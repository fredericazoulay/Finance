"""Dated cash-flow valuation against an explicitly supplied zero curve."""

from __future__ import annotations

from datetime import date
import math
from typing import Any


def _curve_rate(nodes: list[dict[str, Any]], time_years: float) -> float:
    ordered = [(float(n["time_years"]), float(n["zero_rate"])) for n in nodes]
    if len(ordered) < 2:
        raise ValueError("At least two zero-curve nodes are required")
    if any(not math.isfinite(t) or not math.isfinite(r) or t <= 0 for t, r in ordered):
        raise ValueError("Zero-curve nodes must have finite rates and positive tenors")
    if any(ordered[i][0] >= ordered[i + 1][0] for i in range(len(ordered) - 1)):
        raise ValueError("Zero-curve tenors must be strictly increasing")
    if time_years < ordered[0][0] or time_years > ordered[-1][0]:
        raise ValueError("Zero curve does not cover every cash-flow tenor; extrapolation is disabled")
    for (t0, r0), (t1, r1) in zip(ordered, ordered[1:]):
        if t0 <= time_years <= t1:
            weight = (time_years - t0) / (t1 - t0)
            return r0 + weight * (r1 - r0)
    raise ValueError("Could not interpolate zero curve")


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

    priced_flows: list[tuple[float, float]] = []
    yield_flows: list[tuple[float, float]] = []
    for flow in cashflows:
        payment_date = date.fromisoformat(str(flow["payment_date"]))
        amount = float(flow["amount"])
        if payment_date <= settlement_date:
            raise ValueError("Every target cash flow must fall after settlement")
        if not math.isfinite(amount) or amount < 0:
            raise ValueError("Cash-flow amounts must be finite and non-negative")
        t = (payment_date - settlement_date).days / 365.0
        rate = _curve_rate(curve_nodes, t)
        priced_flows.append((t, amount * math.exp(-(rate + z_spread_bps / 10_000.0) * t)))
        yield_flows.append((t, amount))

    dirty_price = sum(amount for _, amount in priced_flows)
    clean_price = None
    if accrued_interest is not None:
        accrued = float(accrued_interest)
        if not math.isfinite(accrued) or accrued < 0:
            raise ValueError("Accrued interest must be finite and non-negative")
        clean_price = dirty_price - accrued
        if clean_price <= 0:
            raise ValueError("Clean price must be positive to solve yield")

    yield_percent = _solve_annual_effective_yield(yield_flows, dirty_price)
    return {
        "theoretical_dirty_price": dirty_price,
        "theoretical_clean_price": clean_price,
        "yield_percent": yield_percent,
    }


def _solve_annual_effective_yield(flows: list[tuple[float, float]], price: float) -> float:
    if price <= 0:
        raise ValueError("Dirty price must be positive to solve yield")

    def present_value(rate: float) -> float:
        if rate <= -1:
            return math.inf
        return sum(amount / ((1.0 + rate) ** t) for t, amount in flows)

    low, high = -0.999999, 1.0
    while present_value(high) > price and high < 1_000_000:
        high = high * 2.0 + 1.0
    if present_value(low) < price or present_value(high) > price:
        raise ValueError("Could not bracket an annual-effective yield for supplied cash flows")
    for _ in range(160):
        mid = (low + high) / 2.0
        if present_value(mid) > price:
            low = mid
        else:
            high = mid
    return ((low + high) / 2.0) * 100.0
