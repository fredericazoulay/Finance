from datetime import date

import pytest

from pricing import (
    SpreadObservation,
    bond_price,
    confidence_score,
    theoretical_yield,
    weighted_spread,
)


def test_weighted_spread_uses_similarity_weights():
    assert weighted_spread(
        [
            SpreadObservation(spread_bps=100, similarity_score=1),
            SpreadObservation(spread_bps=200, similarity_score=3),
        ]
    ) == pytest.approx(175)


@pytest.mark.parametrize(
    "panel",
    [
        [],
        [
            SpreadObservation(spread_bps=100, similarity_score=0),
            SpreadObservation(spread_bps=200, similarity_score=0),
        ],
        [SpreadObservation(spread_bps=100, similarity_score=-1)],
    ],
)
def test_weighted_spread_rejects_invalid_panels(panel):
    with pytest.raises(ValueError):
        weighted_spread(panel)


def test_theoretical_yield_converts_basis_points():
    assert theoretical_yield(0.025, 175) == pytest.approx(0.0425)


def test_confidence_score_is_weighted_and_bounded():
    assert confidence_score(5, 1, 0.8, 0.5) == pytest.approx(0.85)
    assert confidence_score(50, 1, 1, 1) == 1


def test_bond_price_handles_fractional_coupon_period_and_accrual():
    result = bond_price(
        coupon=0.04,
        ytm=0.05,
        settlement_date=date(2025, 4, 1),
        maturity_date=date(2026, 1, 1),
        nominal=100,
        frequency=2,
        day_count="ACT/ACT",
    )

    assert result["dirty_price"] == pytest.approx(100.25976043, abs=1e-8)
    assert result["accrued_interest"] == pytest.approx(0.98630137, abs=1e-8)
    assert result["clean_price"] == pytest.approx(
        result["dirty_price"] - result["accrued_interest"]
    )


def test_bond_price_rejects_settlement_at_or_after_maturity():
    settlement_date = date(2026, 1, 1)
    maturity_date = date(2026, 1, 1)
    with pytest.raises(ValueError, match="antérieure"):
        bond_price(
            coupon=0.04,
            ytm=0.05,
            settlement_date=settlement_date,
            maturity_date=maturity_date,
        )


def test_bond_schedule_preserves_month_end_coupon_dates():
    result = bond_price(
        coupon=0.04,
        ytm=0.05,
        settlement_date=date(2024, 10, 15),
        maturity_date=date(2025, 5, 31),
        frequency=2,
        day_count="ACT/365",
    )

    assert result["accrued_interest"] == pytest.approx(100 * 137 * 0.04 / 365)
