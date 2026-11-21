"""Calcul du Z-spread d'une obligation à partir de son prix de marché."""

from __future__ import annotations

import math
from collections.abc import Callable
from datetime import date

from pricing import _coupon_dates_around

CashFlow = tuple[float, float]
ZeroRateFn = Callable[[float], float]


def bond_cashflows(
    settlement_date: date,
    maturity_date: date,
    coupon: float,
    nominal: float = 100.0,
    frequency: int = 2,
    redemption_percent: float = 100.0,
) -> list[CashFlow]:
    """Lister les flux futurs d'une obligation à taux fixe : (années ACT/365, montant)."""
    if settlement_date >= maturity_date:
        raise ValueError("La date de règlement doit être antérieure à l'échéance.")
    if frequency not in (1, 2, 4, 12):
        raise ValueError("La fréquence doit être 1, 2, 4 ou 12 coupons par an.")
    if coupon < 0 or nominal <= 0 or redemption_percent <= 0:
        raise ValueError("Le coupon, le nominal et le prix de remboursement doivent être valides.")

    _, _, payment_dates = _coupon_dates_around(settlement_date, maturity_date, frequency)
    flows: list[CashFlow] = []
    for payment_date in payment_dates:
        years = (payment_date - settlement_date).days / 365
        amount = nominal * coupon / frequency
        if payment_date == maturity_date:
            amount += nominal * redemption_percent / 100
        flows.append((years, amount))
    return flows


def present_value(
    flows: list[CashFlow],
    zero_rate: ZeroRateFn,
    z_spread: float,
    *,
    frequency: int = 1,
) -> float:
    """Actualiser les flux : PV = somme CF_t / (1 + (r_t + Z) / f) ^ (t * f).

    Avec frequency=1, on retrouve la formule du cas d'usage :
    P = somme CF_t / (1 + r_t + Z) ^ t.
    """
    if frequency not in (1, 2, 4, 12):
        raise ValueError("La fréquence doit être 1, 2, 4 ou 12 périodes par an.")
    if not flows:
        raise ValueError("La liste de flux ne peut pas être vide.")
    total = 0.0
    for years, amount in flows:
        if not math.isfinite(years) or years <= 0 or not math.isfinite(amount):
            raise ValueError("Chaque flux doit avoir une maturité positive et un montant fini.")
        periodic_rate = (zero_rate(years) + z_spread) / frequency
        discount_base = 1 + periodic_rate
        if discount_base <= 0:
            raise ValueError("Le taux d'actualisation est incompatible avec la fréquence.")
        total += amount / discount_base ** (years * frequency)
    return total


def z_spread_from_price(
    flows: list[CashFlow],
    zero_rate: ZeroRateFn,
    price: float,
    *,
    lower: float = -0.5,
    upper: float = 1.0,
    tolerance: float = 1e-12,
    max_iterations: int = 200,
    frequency: int = 1,
) -> float:
    """Résoudre le Z-spread Z tel que PV(courbe zéro + Z) = prix de marché.

    La valeur actuelle est strictement décroissante en Z : on encadre le prix
    puis on converge par bisection.
    """
    if not math.isfinite(price) or price <= 0:
        raise ValueError("Le prix de marché doit être un nombre strictement positif.")
    if not lower < upper:
        raise ValueError("La borne inférieure doit être inférieure à la borne supérieure.")

    if present_value(flows, zero_rate, lower, frequency=frequency) < price:
        raise ValueError("Le prix de marché est hors des bornes de calcul (Z trop faible).")
    if present_value(flows, zero_rate, upper, frequency=frequency) > price:
        raise ValueError("Le prix de marché est hors des bornes de calcul (Z trop élevé).")

    for _ in range(max_iterations):
        middle = (lower + upper) / 2
        if present_value(flows, zero_rate, middle, frequency=frequency) > price:
            lower = middle
        else:
            upper = middle
        if upper - lower < tolerance:
            break
    return (lower + upper) / 2
