"""Métriques de sensibilité obligataire : duration, convexité, DV01, choc de taux,
statut de relative value — équivalents Python des écrans YAS/comparateur du frontend."""

from __future__ import annotations

from datetime import date
from typing import Any, Callable

from pricing import DayCount, bond_price
from zspread import bond_cashflows, z_spread_from_price

RV_THRESHOLD_BPS = 10.0


def ytm_from_dirty_price(
    *,
    settlement_date: date,
    maturity_date: date,
    coupon: float,
    dirty_price: float,
    nominal: float = 100.0,
    frequency: int = 2,
    day_count: DayCount = DayCount.ACT_ACT,
) -> float:
    """Retrouver le YTM par bisection depuis un prix dirty (actualisation périodique)."""

    def price(rate: float) -> float:
        return bond_price(
            coupon, rate, settlement_date, maturity_date, nominal, frequency, day_count
        )["dirty_price"]

    lower, upper = -0.9, 8.0
    if price(lower) < dirty_price or price(upper) > dirty_price:
        raise ValueError("Le prix dirty est hors des bornes de calcul du rendement.")
    for _ in range(100):
        middle = (lower + upper) / 2
        if price(middle) > dirty_price:
            lower = middle
        else:
            upper = middle
    return (lower + upper) / 2


def bond_metrics(
    *,
    settlement_date: date,
    maturity_date: date,
    coupon: float,
    nominal: float = 100.0,
    frequency: int = 2,
    day_count: DayCount = DayCount.ACT_ACT,
    ytm: float | None = None,
    dirty_price: float | None = None,
    zero_fn: Callable[[float], float] | None = None,
    swap_rate_at_maturity: float | None = None,
) -> dict[str, Any]:
    """Métriques complètes d'une obligation à taux fixe.

    Prix clean/dirty via la convention street (capitalisation périodique) ;
    duration/convexité sur les flux ACT/365 actualisés à la fréquence du coupon.
    """
    if ytm is None:
        if dirty_price is None:
            raise ValueError("Fournir un YTM ou un prix dirty.")
        ytm = ytm_from_dirty_price(
            settlement_date=settlement_date,
            maturity_date=maturity_date,
            coupon=coupon,
            dirty_price=dirty_price,
            nominal=nominal,
            frequency=frequency,
            day_count=day_count,
        )
    price = bond_price(
        coupon, ytm, settlement_date, maturity_date, nominal, frequency, day_count
    )
    dirty = price["dirty_price"]
    clean = price["clean_price"]
    accrued = price["accrued_interest"]

    flows = bond_cashflows(settlement_date, maturity_date, coupon, nominal, frequency)
    periodic_rate = ytm / frequency
    pv = sum(amount / (1 + periodic_rate) ** (years * frequency) for years, amount in flows)
    macaulay = (
        sum(
            years * amount / (1 + periodic_rate) ** (years * frequency)
            for years, amount in flows
        )
        / pv
    )
    modified = macaulay / (1 + periodic_rate)
    convexity = (
        sum(
            years
            * (years * frequency + 1)
            * amount
            / frequency
            / (1 + periodic_rate) ** (years * frequency + 2)
            for years, amount in flows
        )
        / pv
    )
    dv01_per_100k = (dirty / 100) * 100_000 * modified * 1e-4
    current_yield = coupon * nominal / clean if clean > 0 else None
    years_to_maturity = (maturity_date - settlement_date).days / 365

    z_spread_bps = None
    if zero_fn is not None:
        try:
            z_spread_bps = round(z_spread_from_price(flows, zero_fn, dirty) * 10000, 4)
        except ValueError:
            z_spread_bps = None
    effective_ytm = (1 + ytm / frequency) ** frequency - 1
    g_spread_bps = (
        round((effective_ytm - zero_fn(years_to_maturity)) * 10000, 4)
        if zero_fn is not None
        else None
    )
    i_spread_bps = (
        round((ytm - swap_rate_at_maturity) * 10000, 4)
        if swap_rate_at_maturity is not None
        else None
    )

    return {
        "ytm": ytm,
        "clean_price": clean,
        "dirty_price": dirty,
        "accrued_interest": accrued,
        "current_yield": current_yield,
        "years_to_maturity": years_to_maturity,
        "macaulay_duration": macaulay,
        "modified_duration": modified,
        "convexity": convexity,
        "dv01_per_100k": dv01_per_100k,
        "z_spread_bps": z_spread_bps,
        "g_spread_bps": g_spread_bps,
        "i_spread_bps": i_spread_bps,
    }


def rate_shock(
    *,
    modified_duration: float,
    convexity: float,
    clean_price: float,
    shock_bps: float,
    invested_amount: float = 100_000.0,
) -> dict[str, float]:
    """Choc de taux au second ordre : ΔP/P ≈ -D_mod × Δy + ½ × Conv × (Δy)²."""
    dy = shock_bps / 10000
    pct_change = -modified_duration * dy + 0.5 * convexity * dy * dy
    return {
        "shock_bps": shock_bps,
        "pct_change": pct_change,
        "monetary_change": invested_amount * pct_change,
        "new_price": clean_price * (1 + pct_change),
    }


def relative_value_status(
    z_spread_bps: float,
    peer_z_spreads_bps: list[float],
    *,
    threshold_bps: float = RV_THRESHOLD_BPS,
) -> dict[str, Any]:
    """Statut CHEAP/RICH/FAIR vs la moyenne des Z-spreads des pairs."""
    if not peer_z_spreads_bps:
        return {"status": "FAIR", "residue_bps": 0.0, "peer_count": 0}
    average = sum(peer_z_spreads_bps) / len(peer_z_spreads_bps)
    residue = z_spread_bps - average
    if residue > threshold_bps:
        status = "CHEAP"
    elif residue < -threshold_bps:
        status = "RICH"
    else:
        status = "FAIR"
    return {
        "status": status,
        "residue_bps": round(residue, 2),
        "peer_count": len(peer_z_spreads_bps),
        "peer_average_bps": round(average, 2),
    }


def rating_bucket(rating: str | None) -> str:
    """Seau de notation pour le regroupement des pairs (A, B, C…)."""
    text = str(rating or "").strip().upper()
    if text.startswith("SIM-"):
        text = text[4:]
    return text[:1] if text else "NR"
