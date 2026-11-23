"""Dated cash-flow valuation against an explicitly supplied zero curve."""

from __future__ import annotations

from datetime import date
from datetime import timedelta
import math
from typing import Any

import numpy as np
import QuantLib as ql
from scipy.optimize import brentq


def _to_ql_date(value: date) -> ql.Date:
    return ql.Date(value.day, value.month, value.year)


def _build_zero_curve(
    nodes: list[dict[str, Any]],
    settlement_date: date,
) -> tuple[ql.ZeroCurve, ql.Actual365Fixed, list[float]]:
    if not isinstance(nodes, list) or len(nodes) < 2:
        raise ValueError("At least two zero-curve nodes are required")

    ordered = [(float(node["time_years"]), float(node["zero_rate"])) for node in nodes]
    if any(not math.isfinite(tenor) or not math.isfinite(rate) or tenor <= 0 for tenor, rate in ordered):
        raise ValueError("Zero-curve nodes must have finite rates and positive tenors")
    if any(ordered[index][0] >= ordered[index + 1][0] for index in range(len(ordered) - 1)):
        raise ValueError("Zero-curve tenors must be strictly increasing")

    reference = _to_ql_date(settlement_date)
    node_dates = [
        _to_ql_date(settlement_date + timedelta(days=round(tenor * 365.0)))
        for tenor, _ in ordered
    ]
    if any(node_dates[index] >= node_dates[index + 1] for index in range(len(node_dates) - 1)):
        raise ValueError("Zero-curve nodes must map to distinct, increasing calendar dates")
    day_counter = ql.Actual365Fixed()
    node_times = [day_counter.yearFraction(reference, node_date) for node_date in node_dates]
    curve = ql.ZeroCurve(
        [reference, *node_dates],
        [ordered[0][1], *(rate for _, rate in ordered)],
        day_counter,
        ql.NullCalendar(),
        ql.Linear(),
        ql.Continuous,
        ql.Annual,
    )
    return curve, day_counter, node_times


def value_cashflows(
    cashflows: list[dict[str, Any]],
    settlement_date: date,
    curve_nodes: list[dict[str, Any]],
    z_spread_bps: float,
    accrued_interest: float | None = None,
) -> dict[str, float | None]:
    """Discount supplied cash flows using continuous zero rates plus a constant spread.

    Time is ACT/365F from settlement. No coupon schedule or accrued interest is
    inferred; accrued interest must be supplied to report a clean price.
    """
    if not cashflows:
        raise ValueError("Target cash flows are required to calculate a price")
    if not math.isfinite(z_spread_bps):
        raise ValueError("Z-spread must be finite")

    curve, day_counter, node_times = _build_zero_curve(curve_nodes, settlement_date)
    reference = _to_ql_date(settlement_date)
    times: list[float] = []
    amounts: list[float] = []
    discounts: list[float] = []
    for flow in cashflows:
        payment_date = date.fromisoformat(str(flow["payment_date"]))
        amount = float(flow["amount"])
        if payment_date <= settlement_date:
            raise ValueError("Every target cash flow must fall after settlement")
        if not math.isfinite(amount) or amount < 0:
            raise ValueError("Cash-flow amounts must be finite and non-negative")
        ql_payment_date = _to_ql_date(payment_date)
        t = day_counter.yearFraction(reference, ql_payment_date)
        if t < node_times[0] or t > node_times[-1]:
            raise ValueError("Zero curve does not cover every cash-flow tenor; extrapolation is disabled")
        times.append(t)
        amounts.append(amount)
        discounts.append(curve.discount(ql_payment_date))

    times_array = np.asarray(times, dtype=np.float64)
    amounts_array = np.asarray(amounts, dtype=np.float64)
    discount_array = np.asarray(discounts, dtype=np.float64)
    spread_discount = np.exp(-(z_spread_bps / 10_000.0) * times_array)
    dirty_price = float(np.dot(amounts_array, discount_array * spread_discount))
    if not math.isfinite(dirty_price):
        raise ValueError("QuantLib curve produced a non-finite dirty price")
    clean_price = None
    if accrued_interest is not None:
        accrued = float(accrued_interest)
        if not math.isfinite(accrued) or accrued < 0:
            raise ValueError("Accrued interest must be finite and non-negative")
        clean_price = dirty_price - accrued
        if clean_price <= 0:
            raise ValueError("Clean price must be positive to solve yield")

    yield_percent = _solve_annual_effective_yield(times_array, amounts_array, dirty_price)
    return {
        "theoretical_dirty_price": dirty_price,
        "theoretical_clean_price": clean_price,
        "yield_percent": yield_percent,
    }


def _solve_annual_effective_yield(times: np.ndarray, amounts: np.ndarray, price: float) -> float:
    if price <= 0:
        raise ValueError("Dirty price must be positive to solve yield")

    def price_difference(rate: float) -> float:
        if rate <= -1:
            return math.inf
        return float(np.dot(amounts, np.power(1.0 + rate, -times)) - price)

    low, high = -0.999999, 1.0
    while price_difference(high) > 0 and high < 1_000_000:
        high = high * 2.0 + 1.0
    if price_difference(low) < 0 or price_difference(high) > 0:
        raise ValueError("Could not bracket an annual-effective yield for supplied cash flows")
    try:
        return brentq(price_difference, low, high) * 100.0
    except ValueError as exc:
        raise ValueError("Could not solve an annual-effective yield for supplied cash flows") from exc
