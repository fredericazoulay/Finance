"""Construction d'une courbe de taux zéro annuelle à partir de taux swap EUR au pair."""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class CurveNode:
    years: float
    zero_rate: float


@dataclass(frozen=True)
class SwapPoint:
    years: float
    par_rate: float


def _validate_swaps(swaps: list[SwapPoint]) -> list[SwapPoint]:
    if not swaps:
        raise ValueError("La liste de taux swap ne peut pas être vide.")
    ordered = sorted(swaps, key=lambda point: point.years)
    for point in ordered:
        if not math.isfinite(point.years) or not 0 < point.years <= 100:
            raise ValueError("Les maturités des swaps doivent être entre 0 et 100 ans.")
        if not math.isfinite(point.par_rate) or not -0.5 <= point.par_rate <= 1:
            raise ValueError("Les taux swap doivent être entre -50 % et 100 %.")
    if len({point.years for point in ordered}) != len(ordered):
        raise ValueError("Les maturités des swaps doivent être distinctes.")
    return ordered


def _discount_at(years: float, known_years: list[float], known_discounts: list[float]) -> float:
    if not known_years:
        return 1.0
    if years <= known_years[0]:
        return known_discounts[0]
    for left_years, left_df, right_years, right_df in zip(
        known_years, known_discounts, known_years[1:], known_discounts[1:]
    ):
        if years <= right_years:
            fraction = (years - left_years) / (right_years - left_years)
            return left_df + fraction * (right_df - left_df)
    return known_discounts[-1]


def bootstrap_zero_curve(swaps: list[SwapPoint], *, frequency: int = 2) -> list[CurveNode]:
    """Bootstrapper les taux zéro effectifs annuels depuis des taux swap au pair.

    Chaque swap paie un coupon fixe à la fréquence indiquée (2 = semestriel,
    standard EUR 6M). Les facteurs d'actualisation intermédiaires sont
    interpolés linéairement entre les maturités déjà bootstrappées, puis
    convertis en taux zéro annuels : r = DF^(-1/T) - 1.
    """
    if frequency not in (1, 2, 4, 12):
        raise ValueError("La fréquence doit être 1, 2, 4 ou 12 paiements par an.")
    points = _validate_swaps(swaps)

    known_years: list[float] = []
    known_discounts: list[float] = []
    nodes: list[CurveNode] = []

    for point in points:
        maturity = point.years
        coupon = point.par_rate / frequency
        periods = max(1, round(maturity * frequency))
        payment_times = [maturity * step / periods for step in range(1, periods + 1)]

        fixed_leg = 0.0
        for time in payment_times[:-1]:
            fixed_leg += coupon * _discount_at(time, known_years, known_discounts)
        discount = (1.0 - fixed_leg) / (1.0 + coupon)
        if discount <= 0:
            raise ValueError("Le bootstrap produit un facteur d'actualisation négatif.")

        known_years.append(maturity)
        known_discounts.append(discount)
        nodes.append(CurveNode(maturity, discount ** (-1 / maturity) - 1))
    return nodes


def zero_rate_at(years: float, nodes: list[CurveNode]) -> float:
    """Interpoler linéairement la courbe zéro, avec extrapolation plate."""
    if not nodes:
        raise ValueError("La courbe zéro doit contenir au moins un point.")
    ordered = sorted(nodes, key=lambda node: node.years)
    if years <= ordered[0].years:
        return ordered[0].zero_rate
    for left, right in zip(ordered, ordered[1:]):
        if years <= right.years:
            fraction = (years - left.years) / (right.years - left.years)
            return left.zero_rate + fraction * (right.zero_rate - left.zero_rate)
    return ordered[-1].zero_rate


def zero_rate_function(nodes: list[CurveNode]) -> Callable[[float], float]:
    """Retourner une fonction d'évaluation de la courbe zéro."""
    return lambda years: zero_rate_at(years, nodes)
