"""Pipeline du cas d'usage #3 : panel de comparables, Z-spread et yield à deux dates."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from typing import Any

from comparable_selection import TargetBond, select_comparables
from curve import CurveNode, zero_rate_at, zero_rate_function
from pricing import (
    DayCount,
    SpreadObservation,
    bond_price,
    weighted_spread,
)
from zspread import bond_cashflows, present_value, z_spread_from_price


@dataclass(frozen=True)
class PipelineTarget:
    isin: str
    issuer: str
    sector: str
    rating: str
    seniority: str
    currency: str
    maturity_date: date
    coupon: float
    nominal: float = 100.0
    frequency: int = 2
    day_count: DayCount = DayCount.ACT_ACT
    settlement_date: date | None = None
    coupon_type: str = "Fixed"
    bond_type: str = "Fixed"


def _target_bond(target: PipelineTarget, observation_date: date) -> TargetBond:
    return TargetBond(
        isin=target.isin,
        issuer=target.issuer,
        sector=target.sector,
        rating=target.rating,
        seniority=target.seniority,
        currency=target.currency,
        maturity_date=target.maturity_date,
        observation_date=observation_date,
        coupon_type=target.coupon_type,
        bond_type=target.bond_type,
        coupon_rate_pct=target.coupon * 100,
    )


def _day_count(value: Any) -> DayCount:
    try:
        return DayCount(str(value).strip().upper())
    except ValueError:
        return DayCount.ACT_365


def _comparable_z_spread(
    candidate: dict[str, Any],
    observation_date: date,
    zero_fn,
) -> tuple[float | None, float | None, list[str]]:
    """Z-spread d'un comparable depuis son prix implicite (YTM) et la courbe de la date."""
    maturity = candidate.get("maturity_date")
    if not isinstance(maturity, date) or maturity <= observation_date:
        return None, None, ["échéance absente ou passée"]
    ytm_pct = candidate.get("yield_to_maturity_pct")
    clean_price = candidate.get("clean_price")
    coupon_pct = candidate.get("coupon_rate_pct")
    if coupon_pct is None:
        return None, None, ["coupon absent : Z-spread non calculable"]
    if ytm_pct is None and clean_price is None:
        return None, None, ["YTM et prix clean absents : Z-spread non calculable"]

    frequency = candidate.get("payment_frequency") or 2
    if frequency not in (1, 2, 4, 12):
        frequency = 2
    coupon = float(coupon_pct) / 100
    day_count = _day_count(candidate.get("day_count"))
    if ytm_pct is not None:
        price = bond_price(
            coupon, float(ytm_pct) / 100, observation_date, maturity, 100.0, frequency, day_count
        )["dirty_price"]
    else:
        accrued = bond_price(
            coupon, 0, observation_date, maturity, 100.0, frequency, day_count
        )["accrued_interest"]
        price = float(clean_price) + accrued
    flows = bond_cashflows(observation_date, maturity, coupon, 100.0, frequency)
    try:
        z_spread = z_spread_from_price(flows, zero_fn, price)
    except ValueError as exc:
        return None, price, [str(exc)]
    return z_spread, price, []


def _implied_ytm(target: PipelineTarget, settlement: date, dirty_price: float) -> float:
    def price(rate: float) -> float:
        return bond_price(
            target.coupon,
            rate,
            settlement,
            target.maturity_date,
            target.nominal,
            target.frequency,
            target.day_count,
        )["dirty_price"]

    lower, upper = -0.9, 8.0
    if price(lower) < dirty_price or price(upper) > dirty_price:
        raise ValueError("Le rendement implicite est hors des bornes de calcul.")
    for _ in range(100):
        middle = (lower + upper) / 2
        if price(middle) > dirty_price:
            lower = middle
        else:
            upper = middle
    return (lower + upper) / 2


_METHODOLOGY = (
    " Chaque comparable retenu est revalorisé à la date d'observation : son prix "
    "dirty implicite est reconstruit depuis son YTM, puis son Z-spread est résolu "
    "par bisection pour que la somme de ses flux actualisés à (taux zéro + Z) égale "
    "ce prix. Le Z-spread cible est la moyenne des Z-spreads des comparables "
    "pondérée par les scores de similarité. Le yield est le taux zéro à maturité "
    "(courbe zéro EUR bootstrapée depuis les swaps EUR 6M) plus le Z-spread."
)


def _run_date(
    target: PipelineTarget,
    candidates: list[dict[str, Any]],
    nodes: list[CurveNode] | None,
    observation_date: date,
    *,
    limit: int,
) -> dict[str, Any]:
    settlement = target.settlement_date or observation_date
    flags: list[str] = []

    if nodes is None:
        flags.append(
            f"Aucune courbe zéro EUR (swaps 6M) fournie pour le {observation_date.isoformat()}."
        )

    dated = [c for c in candidates if c.get("market_date") == observation_date]
    undated_excluded = [
        {
            "isin": str(c.get("isin") or ""),
            "reason": "date de marché absente ou différente de la date d'observation",
        }
        for c in candidates
        if c.get("market_date") != observation_date
    ]

    selection = select_comparables(
        _target_bond(target, observation_date), dated, limit=limit
    )
    selection["excluded"].extend(undated_excluded)

    result: dict[str, Any] | None = None
    if nodes is not None:
        zero_fn = zero_rate_function(nodes)
        for item in selection["selected"]:
            z_spread, price, notes = _comparable_z_spread(item, observation_date, zero_fn)
            item["z_spread_bps"] = round(z_spread * 10000, 4) if z_spread is not None else None
            item["implied_dirty_price"] = round(price, 8) if price is not None else None
            item["z_spread_notes"] = notes
            if z_spread is None:
                flags.append(
                    f"Z-spread non calculable pour {item.get('isin')} : {'; '.join(notes)}"
                )

        usable = [item for item in selection["selected"] if item["z_spread_bps"] is not None]
        if usable:
            z_spread_bps = weighted_spread(
                [
                    SpreadObservation(item["z_spread_bps"], item["similarity_score"])
                    for item in usable
                ]
            )
            maturity_years = (target.maturity_date - settlement).days / 365
            zero_rate = zero_rate_at(maturity_years, nodes)
            yield_decimal = zero_rate + z_spread_bps / 10000
            flows = bond_cashflows(
                settlement, target.maturity_date, target.coupon, target.nominal, target.frequency
            )
            dirty_price = present_value(flows, zero_fn, z_spread_bps / 10000)
            accrued = bond_price(
                target.coupon,
                0,
                settlement,
                target.maturity_date,
                target.nominal,
                target.frequency,
                target.day_count,
            )["accrued_interest"]
            result = {
                "weighted_z_spread_bps": round(z_spread_bps, 4),
                "zero_rate_at_maturity": round(zero_rate, 8),
                "yield_from_curve_and_z_spread": round(yield_decimal, 8),
                "dirty_price": round(dirty_price, 8),
                "clean_price": round(dirty_price - accrued, 8),
                "accrued_interest": round(accrued, 8),
                "implied_ytm": round(_implied_ytm(target, settlement, dirty_price), 8),
                "comparables_used": [item.get("isin") for item in usable],
                "comparables_used_count": len(usable),
            }
        else:
            flags.append("Aucun comparable avec un Z-spread calculable à cette date.")

    official = bool(selection["selected"]) and all(
        item.get("data_status") == "official" for item in selection["selected"]
    )
    if selection["selected"] and not official:
        flags.append(
            "La provenance des données n'est pas certifiée 'official' ; valorisation indicative uniquement."
        )

    return {
        "observation_date": observation_date.isoformat(),
        "settlement_date": settlement.isoformat(),
        "selected": selection["selected"],
        "excluded": selection["excluded"],
        "methodology": selection["methodology"] + _METHODOLOGY,
        "weights": selection["weights"],
        "quality_flags": sorted(set(selection["quality_flags"] + flags)),
        "valuation_allowed": official and result is not None,
        "result": result,
    }


def run_pricing_pipeline(
    target: PipelineTarget,
    candidates: list[dict[str, Any]],
    curves: dict[date, list[CurveNode]],
    observation_dates: list[date],
    *,
    limit: int = 5,
) -> dict[str, Any]:
    """Estimer le Z-spread et le yield de la cible à chacune des deux dates d'observation."""
    if len(observation_dates) != 2:
        raise ValueError("Indiquez exactement deux dates d'observation.")
    if observation_dates[0] >= observation_dates[1]:
        raise ValueError("La seconde date d'observation doit être postérieure à la première.")
    if target.currency.upper() != "EUR":
        raise ValueError("Ce pipeline ne traite que les obligations en EUR.")
    if target.frequency not in (1, 2, 4, 12):
        raise ValueError("La fréquence doit être 1, 2, 4 ou 12 coupons par an.")

    return {
        "schema_version": 1,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "target": asdict(target),
        "observation_dates": [d.isoformat() for d in observation_dates],
        "curve_source": "courbe zéro EUR bootstrapée depuis les taux swap EUR 6M au pair",
        "dates": {
            observation_date.isoformat(): _run_date(
                target, candidates, curves.get(observation_date), observation_date, limit=limit
            )
            for observation_date in observation_dates
        },
    }
