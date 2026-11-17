"""API FastAPI du prototype de pricing obligataire."""

from datetime import date
from typing import Any

import psycopg
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator

from curve import CurveNode, SwapPoint, bootstrap_zero_curve, zero_rate_function
from database import DatabaseConfigurationError, search_obligations
from pricing import (
    DayCount,
    SpreadObservation,
    bond_price,
    confidence_score,
    theoretical_yield,
    weighted_spread,
)
from pipeline import PipelineTarget, run_pricing_pipeline
from request_extraction import extract_target
from zspread import z_spread_from_price

app = FastAPI(
    title="API de pricing obligataire",
    description=(
        "Prototype de calcul de spread pondéré, rendement théorique, "
        "prix obligataire et score de confiance."
    ),
    version="1.0.0",
)


class SpreadObservationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spread_bps: float = Field(description="Spread observé en points de base.")
    similarity_score: float = Field(
        ge=0, description="Poids de similarité, positif ou nul."
    )


class SpreadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    panel: list[SpreadObservationInput] = Field(min_length=1)


class YieldRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    risk_free_rate: float = Field(description="Taux sans risque annuel décimal.")
    spread_bps: float = Field(description="Spread en points de base.")


class ConfidenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nb_comparables: int = Field(ge=0)
    avg_similarity: float = Field(ge=0, le=1)
    data_quality: float = Field(ge=0, le=1)
    liquidity: float = Field(ge=0, le=1)


class PriceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    coupon: float = Field(ge=0, description="Taux de coupon annuel décimal.")
    ytm: float = Field(description="Rendement actuariel annuel décimal.")
    settlement_date: date
    maturity_date: date
    nominal: float = Field(default=100, gt=0)
    redemption_percent: float = Field(
        default=100, gt=0, description="Prix de remboursement en pourcentage du nominal."
    )
    frequency: int = Field(default=2, description="1, 2, 4 ou 12 coupons par an.")
    day_count: DayCount = Field(
        default="ACT/ACT",
        description="Convention pour les intérêts courus : ACT/ACT, ACT/365, ACT/360, 30/360.",
    )

    @model_validator(mode="after")
    def validate_dates(self) -> "PriceRequest":
        if self.settlement_date >= self.maturity_date:
            raise ValueError("La date de règlement doit être antérieure à l'échéance.")
        if self.frequency not in (1, 2, 4, 12):
            raise ValueError("La fréquence doit être 1, 2, 4 ou 12.")
        return self



class CurveNodeInput(BaseModel):

    model_config = ConfigDict(extra="forbid")

    years: float = Field(gt=0, le=100, description="Maturité en années.")
    zero_rate: float = Field(ge=-0.5, le=1, description="Taux zéro décimal annuel.")


class CashFlowInput(BaseModel):

    model_config = ConfigDict(extra="forbid")

    years: float = Field(gt=0, description="Maturité du flux en années ACT/365.")
    amount: float = Field(description="Montant du flux.")


class ZSpreadRequest(BaseModel):

    model_config = ConfigDict(extra="forbid")

    cashflows: list[CashFlowInput] = Field(min_length=1)
    curve: list[CurveNodeInput] = Field(min_length=1)
    price: float = Field(gt=0, description="Prix de marché (dirty) de l'obligation.")
    frequency: int = Field(default=1, description="Capitalisation de la courbe zéro : 1, 2, 4 ou 12.")


class SwapPointInput(BaseModel):

    model_config = ConfigDict(extra="forbid")

    years: float = Field(gt=0, le=100, description="Maturité du swap en années.")
    par_rate: float = Field(ge=-0.5, le=1, description="Taux swap au pair, décimal annuel.")


class BootstrapRequest(BaseModel):

    model_config = ConfigDict(extra="forbid")

    swaps: list[SwapPointInput] = Field(min_length=1)
    frequency: int = Field(default=2, description="Paiements par an des swaps (2 = EUR 6M).")


class PipelineTargetInput(BaseModel):

    model_config = ConfigDict(extra="forbid")

    isin: str = ""
    issuer: str
    sector: str = ""
    rating: str = ""
    seniority: str = ""
    currency: str = "EUR"
    maturity_date: date
    coupon: float = Field(ge=0, description="Taux de coupon annuel décimal.")
    nominal: float = Field(default=100, gt=0)
    frequency: int = Field(default=2, description="1, 2, 4 ou 12 coupons par an.")
    day_count: DayCount = DayCount.ACT_ACT
    settlement_date: date | None = None


class PipelineRequest(BaseModel):

    model_config = ConfigDict(extra="forbid")

    target: PipelineTargetInput
    comparables: list[dict[str, Any]] = Field(default_factory=list)
    curves: dict[str, list[CurveNodeInput]] = Field(
        description="Courbes zéro par date d'observation (clé ISO AAAA-MM-JJ)."
    )
    observation_dates: list[date] = Field(min_length=2, max_length=2)


class ExtractRequest(BaseModel):

    model_config = ConfigDict(extra="forbid")

    request: str = Field(
        min_length=3,
        description="Demande de pricing en langage naturel (cas #3, étape 01)."
    )


def _run_calculation(calculation, *args):
    try:
        return calculation(*args)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/health", tags=["Health"], summary="Vérifier la disponibilité de l'API")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/obligations", summary="Rechercher dans le catalogue d'obligations")
def get_obligations(
    search: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[dict[str, Any]]:
    try:
        return search_obligations(search, limit=limit)
    except DatabaseConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except psycopg.Error as exc:
        raise HTTPException(
            status_code=503, detail="La base PostgreSQL est indisponible."
        ) from exc


@app.post("/pricing/spread", summary="Calculer le spread pondéré")
def calculate_spread(request: SpreadRequest) -> dict[str, float]:
    panel = [
        SpreadObservation(
            spread_bps=item.spread_bps,
            similarity_score=item.similarity_score,
        )
        for item in request.panel
    ]
    spread = _run_calculation(weighted_spread, panel)
    return {"weighted_spread_bps": spread}


@app.post("/pricing/yield", summary="Calculer le rendement théorique")
def calculate_yield(request: YieldRequest) -> dict[str, float]:
    result = _run_calculation(
        theoretical_yield, request.risk_free_rate, request.spread_bps
    )
    return {"theoretical_yield": result}


@app.post("/pricing/confidence", summary="Calculer le score de confiance")
def calculate_confidence(request: ConfidenceRequest) -> dict[str, float]:
    result = _run_calculation(
        confidence_score,
        request.nb_comparables,
        request.avg_similarity,
        request.data_quality,
        request.liquidity,
    )
    return {"confidence_score": result}


@app.post("/pricing/price", summary="Calculer le prix d'une obligation")
def calculate_price(request: PriceRequest) -> dict[str, float]:
    return _run_calculation(
        bond_price,
        request.coupon,
        request.ytm,
        request.settlement_date,
        request.maturity_date,
        request.nominal,
        request.frequency,
        request.day_count,
        request.redemption_percent,
    )



def _parse_candidate_dates(candidate: dict[str, Any]) -> dict[str, Any]:
    parsed = dict(candidate)
    for key in ("issue_date", "maturity_date", "market_date"):
        value = parsed.get(key)
        if isinstance(value, str) and value:
            parsed[key] = date.fromisoformat(value)
    return parsed


@app.post("/pricing/z-spread", summary="Calculer le Z-spread depuis un prix de marché")
def calculate_z_spread(request: ZSpreadRequest) -> dict[str, float]:
    nodes = [CurveNode(item.years, item.zero_rate) for item in request.curve]
    flows = [(item.years, item.amount) for item in request.cashflows]
    try:
        z_spread = z_spread_from_price(
            flows,
            zero_rate_function(nodes),
            request.price,
            frequency=request.frequency,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"z_spread": z_spread, "z_spread_bps": z_spread * 10_000}


@app.post("/curve/bootstrap", summary="Bootstrapper une courbe zéro depuis des swaps EUR au pair")
def bootstrap_curve(request: BootstrapRequest) -> dict[str, list[dict[str, float]]]:
    try:
        nodes = bootstrap_zero_curve(
            [SwapPoint(item.years, item.par_rate) for item in request.swaps],
            frequency=request.frequency,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"curve": [{"years": node.years, "zero_rate": node.zero_rate} for node in nodes]}


@app.post("/pricing/panel", summary="Pipeline cas #3 : Z-spread et yield à deux dates d'observation")
def calculate_panel(request: PipelineRequest) -> dict[str, Any]:
    target = PipelineTarget(
        isin=request.target.isin,
        issuer=request.target.issuer,
        sector=request.target.sector,
        rating=request.target.rating,
        seniority=request.target.seniority,
        currency=request.target.currency,
        maturity_date=request.target.maturity_date,
        coupon=request.target.coupon,
        nominal=request.target.nominal,
        frequency=request.target.frequency,
        day_count=request.target.day_count,
        settlement_date=request.target.settlement_date,
    )
    try:
        comparables = [_parse_candidate_dates(c) for c in request.comparables]
        curves = {
            date.fromisoformat(key): [CurveNode(item.years, item.zero_rate) for item in nodes]
            for key, nodes in request.curves.items()
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _run_calculation(
        run_pricing_pipeline, target, comparables, curves, request.observation_dates
    )


@app.post(
    "/pricing/extract-target",
    summary="Extraire les caractéristiques d'une obligation depuis une demande en langage naturel",
)
def extract_target_endpoint(request: ExtractRequest) -> dict[str, Any]:
    try:
        return extract_target(request.request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
