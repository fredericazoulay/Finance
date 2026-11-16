"""Moteur de calcul du prototype de pricing obligataire."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum


class DayCount(str, Enum):
    ACT_ACT = "ACT/ACT"
    ACT_365 = "ACT/365"
    ACT_360 = "ACT/360"
    THIRTY_360 = "30/360"


DAY_COUNT_CONVENTIONS = tuple(DayCount)


@dataclass(frozen=True)
class SpreadObservation:
    spread_bps: float
    similarity_score: float


def _validate_finite(name: str, value: float) -> None:
    if not isinstance(value, (int, float)) or not float("-inf") < value < float("inf"):
        raise ValueError(f"{name} doit être un nombre fini.")


def weighted_spread(panel: list[SpreadObservation]) -> float:
    """Calculer la moyenne des spreads pondérée par les scores de similarité."""
    if not panel:
        raise ValueError("Le panel de comparables ne peut pas être vide.")

    numerator = 0.0
    denominator = 0.0
    for observation in panel:
        _validate_finite("spread_bps", observation.spread_bps)
        _validate_finite("similarity_score", observation.similarity_score)
        if observation.similarity_score < 0:
            raise ValueError("Le score de similarité doit être positif ou nul.")
        numerator += observation.spread_bps * observation.similarity_score
        denominator += observation.similarity_score

    if denominator == 0:
        raise ValueError("La somme des scores de similarité doit être positive.")
    return numerator / denominator


def theoretical_yield(risk_free_rate: float, spread_bps: float) -> float:
    """Calculer le rendement cible en ajoutant un spread en points de base."""
    _validate_finite("risk_free_rate", risk_free_rate)
    _validate_finite("spread_bps", spread_bps)
    return risk_free_rate + spread_bps / 10_000


def confidence_score(
    nb_comparables: int,
    avg_similarity: float,
    data_quality: float,
    liquidity: float,
) -> float:
    """Calculer une confiance entre 0 et 1 (5 comparables saturent le premier facteur)."""
    if isinstance(nb_comparables, bool) or not isinstance(nb_comparables, int):
        raise ValueError("nb_comparables doit être un entier positif ou nul.")
    if nb_comparables < 0:
        raise ValueError("nb_comparables doit être un entier positif ou nul.")

    components = {
        "avg_similarity": avg_similarity,
        "data_quality": data_quality,
        "liquidity": liquidity,
    }
    for name, value in components.items():
        _validate_finite(name, value)
        if not 0 <= value <= 1:
            raise ValueError(f"{name} doit être compris entre 0 et 1.")

    normalized_count = min(nb_comparables / 5, 1)
    score = (
        0.30 * normalized_count
        + 0.25 * avg_similarity
        + 0.25 * data_quality
        + 0.20 * liquidity
    )
    return round(score, 6)


def _last_day_of_month(year: int, month: int) -> int:
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    return (next_month - date.resolution).day


def _add_months(value: date, months: int) -> date:
    month_index = value.year * 12 + value.month - 1 + months
    year, month_index = divmod(month_index, 12)
    month = month_index + 1
    last_day = _last_day_of_month(year, month)
    if value.day == _last_day_of_month(value.year, value.month):
        return date(year, month, last_day)
    return date(year, month, min(value.day, last_day))


def _coupon_dates_around(
    settlement_date: date, maturity_date: date, frequency: int
) -> tuple[date, date, list[date]]:
    months_per_period = 12 // frequency
    coupon_dates = [maturity_date]
    while coupon_dates[-1] > settlement_date:
        coupon_dates.append(_add_months(maturity_date, -months_per_period * len(coupon_dates)))

    previous_coupon = coupon_dates[-1]
    next_coupon = coupon_dates[-2] if len(coupon_dates) > 1 else maturity_date
    future_dates = [d for d in reversed(coupon_dates[:-1]) if d <= maturity_date]
    return previous_coupon, next_coupon, future_dates


def _year_fraction(start: date, end: date, convention: DayCount) -> float:
    if end < start:
        raise ValueError("La date de fin doit être postérieure ou égale à la date de début.")
    if convention == DayCount.ACT_365:
        return (end - start).days / 365
    if convention == DayCount.ACT_360:
        return (end - start).days / 360
    if convention == DayCount.THIRTY_360:
        day_start = min(start.day, 30)
        day_end = end.day
        if day_start == 30:
            day_end = min(day_end, 30)
        return (
            360 * (end.year - start.year)
            + 30 * (end.month - start.month)
            + day_end
            - day_start
        ) / 360
    if convention == DayCount.ACT_ACT:
        total = 0.0
        cursor = start
        while cursor < end:
            year_end = date(cursor.year + 1, 1, 1)
            segment_end = min(end, year_end)
            days_in_year = 366 if _is_leap_year(cursor.year) else 365
            total += (segment_end - cursor).days / days_in_year
            cursor = segment_end
        return total
    raise ValueError("Convention de décompte non prise en charge.")


def _is_leap_year(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def bond_price(
    coupon: float,
    ytm: float,
    settlement_date: date,
    maturity_date: date,
    nominal: float = 100.0,
    frequency: int = 2,
    day_count: DayCount = "ACT/ACT",
    redemption_percent: float = 100.0,
) -> dict[str, float]:
    """Calculer les prix dirty/clean avec actualisation fractionnée entre coupons.

    Le coupon et le YTM sont des taux annuels décimaux. Le prix est exprimé
    pour le nominal fourni. Le YTM est composé à la fréquence des coupons.
    """
    for name, value in (
        ("coupon", coupon), ("ytm", ytm), ("nominal", nominal),
        ("redemption_percent", redemption_percent),
    ):
        _validate_finite(name, value)
    if coupon < 0:
        raise ValueError("Le coupon doit être positif ou nul.")
    if nominal <= 0:
        raise ValueError("Le nominal doit être strictement positif.")
    if redemption_percent <= 0:
        raise ValueError("Le prix de remboursement doit être strictement positif.")
    if frequency not in (1, 2, 4, 12):
        raise ValueError("La fréquence doit être 1, 2, 4 ou 12 coupons par an.")
    if settlement_date >= maturity_date:
        raise ValueError("La date de règlement doit être antérieure à l'échéance.")
    if day_count not in DAY_COUNT_CONVENTIONS:
        raise ValueError("Convention de décompte non prise en charge.")

    periodic_rate = ytm / frequency
    if 1 + periodic_rate <= 0:
        raise ValueError("Le rendement est incompatible avec la fréquence de capitalisation.")

    previous_coupon, next_coupon, future_dates = _coupon_dates_around(
        settlement_date, maturity_date, frequency
    )
    days_in_period = (next_coupon - previous_coupon).days
    if days_in_period <= 0:
        raise ValueError("La période de coupon doit être strictement positive.")
    fraction_to_next_coupon = (next_coupon - settlement_date).days / days_in_period
    coupon_amount = nominal * coupon / frequency

    dirty_price = 0.0
    for index, payment_date in enumerate(future_dates):
        periods = fraction_to_next_coupon + index
        cashflow = coupon_amount
        if payment_date == maturity_date:
            cashflow += nominal * redemption_percent / 100
        dirty_price += cashflow / ((1 + periodic_rate) ** periods)

    accrued_interest = nominal * coupon * _year_fraction(
        previous_coupon, settlement_date, day_count
    )
    clean_price = dirty_price - accrued_interest
    return {
        "clean_price": round(clean_price, 8),
        "dirty_price": round(dirty_price, 8),
        "accrued_interest": round(accrued_interest, 8),
    }
