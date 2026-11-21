from datetime import date

import pytest

from curve import SwapPoint, bootstrap_zero_curve, zero_rate_function
from sensitivities import (
    bond_metrics,
    rate_shock,
    rating_bucket,
    relative_value_status,
    ytm_from_dirty_price,
)

SETTLEMENT = date(2026, 10, 26)
MATURITY = date(2031, 10, 26)


def _zero_fn():
    swaps = [
        SwapPoint(0.5, 0.02), SwapPoint(1.0, 0.022), SwapPoint(2.0, 0.025),
        SwapPoint(3.0, 0.028), SwapPoint(5.0, 0.032), SwapPoint(7.0, 0.035),
        SwapPoint(10.0, 0.038),
    ]
    return zero_rate_function(bootstrap_zero_curve(swaps))


def test_par_bond_prices_at_100_and_duration_is_sane():
    metrics = bond_metrics(
        settlement_date=SETTLEMENT,
        maturity_date=MATURITY,
        coupon=0.04,
        ytm=0.04,
        frequency=1,
    )

    assert metrics["clean_price"] == pytest.approx(100.0, abs=0.05)
    # Duration modifiée d'une obligation par à 4 % sur 5 ans ≈ 4,45 ans.
    assert 4.3 < metrics["modified_duration"] < 4.6
    assert metrics["macaulay_duration"] == pytest.approx(
        metrics["modified_duration"] * 1.04, rel=1e-6
    )
    assert metrics["convexity"] > 20
    assert metrics["dv01_per_100k"] > 0
    assert metrics["current_yield"] == pytest.approx(0.04, abs=1e-3)


def test_ytm_from_dirty_price_roundtrip():
    metrics = bond_metrics(
        settlement_date=SETTLEMENT, maturity_date=MATURITY, coupon=0.05, ytm=0.035, frequency=2
    )
    recovered = ytm_from_dirty_price(
        settlement_date=SETTLEMENT,
        maturity_date=MATURITY,
        coupon=0.05,
        dirty_price=metrics["dirty_price"],
        frequency=2,
    )

    assert recovered == pytest.approx(0.035, abs=1e-6)


def test_semiannual_duration_uses_semiannual_ytm_compounding():
    metrics = bond_metrics(
        settlement_date=SETTLEMENT,
        maturity_date=MATURITY,
        coupon=0.04,
        ytm=0.04,
        frequency=2,
    )

    assert metrics["macaulay_duration"] == pytest.approx(
        metrics["modified_duration"] * (1 + 0.04 / 2), rel=1e-6
    )


def test_bond_metrics_computes_spreads_against_curves():
    zero_fn = _zero_fn()
    metrics = bond_metrics(
        settlement_date=SETTLEMENT,
        maturity_date=MATURITY,
        coupon=0.04,
        ytm=0.045,
        frequency=2,
        zero_fn=zero_fn,
        swap_rate_at_maturity=0.033,
    )

    assert metrics["z_spread_bps"] is not None
    assert metrics["z_spread_bps"] > 0  # YTM 4,5 % au-dessus de la courbe ~3,3 %
    effective_ytm = (1 + 0.045 / 2) ** 2 - 1
    expected_g = (effective_ytm - zero_fn(metrics["years_to_maturity"])) * 10000
    assert metrics["g_spread_bps"] == pytest.approx(expected_g, abs=0.01)
    assert metrics["i_spread_bps"] == pytest.approx((0.045 - 0.033) * 10000, abs=0.01)


def test_rate_shock_second_order_formula():
    result = rate_shock(
        modified_duration=4.45,
        convexity=25.0,
        clean_price=100.0,
        shock_bps=100,
        invested_amount=100_000.0,
    )

    expected_pct = -4.45 * 0.01 + 0.5 * 25.0 * 0.01**2
    assert result["pct_change"] == pytest.approx(expected_pct, rel=1e-9)
    assert result["pct_change"] < 0
    assert result["monetary_change"] == pytest.approx(100_000.0 * expected_pct, rel=1e-9)
    assert result["new_price"] == pytest.approx(100.0 * (1 + expected_pct), rel=1e-9)


def test_relative_value_status_thresholds():
    assert relative_value_status(150, [100, 110])["status"] == "CHEAP"
    assert relative_value_status(50, [100, 110])["status"] == "RICH"
    assert relative_value_status(105, [100, 110])["status"] == "FAIR"
    assert relative_value_status(105, [])["status"] == "FAIR"
    rich = relative_value_status(50, [100, 110])
    assert rich["residue_bps"] == pytest.approx(-55.0)


def test_rating_bucket():
    assert rating_bucket("BB+") == "B"
    assert rating_bucket("AA-") == "A"
    assert rating_bucket(None) == "NR"
