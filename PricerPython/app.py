"""API FastAPI du prototype de pricing obligataire."""

from datetime import date
from typing import Any

import psycopg
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator

from database import DatabaseConfigurationError, search_obligations
from pricing import (
    DayCount,
    SpreadObservation,
    bond_price,
    confidence_score,
    theoretical_yield,
    weighted_spread,
)

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
