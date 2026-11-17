from dataclasses import replace
from datetime import date

import pytest

from curve import CurveNode, zero_rate_at, zero_rate_function
from pipeline import PipelineTarget, run_pricing_pipeline
from pricing import SpreadObservation, bond_price, weighted_spread
from zspread import bond_cashflows, present_value, z_spread_from_price

D1 = date(2026, 1, 2)
D2 = date(2026, 2, 2)


def _candidate(**overrides):
    candidate = {
        "isin": "XS0000000001",
        "issuer": "Issuer A",
        "issuer_type": "Corporate",
        "bond_type": "Fixed",
        "currency": "EUR",
        "maturity_date": date(2030, 1, 1),
        "coupon_type": "Fixed",
        "seniority": "Senior",
        "rating": "BBB",
        "coupon_rate_pct": 4.0,
        "payment_frequency": 2,
        "day_count": "ACT/365",
        "yield_to_maturity_pct": 4.5,
        "market_date": D1,
        "source_name": "fournisseur-licencie",
        "data_status": "official",
    }
    candidate.update(overrides)
    return candidate


def _target():
    return PipelineTarget(
        isin="XS9999999999",
        issuer="Nouvel Émetteur",
        sector="Corporate",
        rating="BBB",
        seniority="Senior",
        currency="EUR",
        maturity_date=date(2030, 1, 1),
        coupon=0.04,
        nominal=100.0,
        frequency=2,
    )


def _curves():
    return {
        D1: [CurveNode(1, 0.02), CurveNode(3, 0.025), CurveNode(5, 0.028), CurveNode(10, 0.032)],
        D2: [CurveNode(1, 0.021), CurveNode(3, 0.026), CurveNode(5, 0.029), CurveNode(10, 0.033)],
    }


def _candidates():
    return [
        _candidate(),
        _candidate(isin="XS0000000002", rating="A", yield_to_maturity_pct=4.2, market_date=D1),
        _candidate(
            isin="XS0000000003",
            maturity_date=date(2031, 6, 30),
            coupon_rate_pct=4.5,
            yield_to_maturity_pct=4.8,
            market_date=D2,
        ),
        _candidate(isin="XS0000000004", currency="USD", market_date=D1),
        _candidate(isin="XS9999999999", market_date=D1),
        _candidate(isin="XS0000000005", market_date=None),
    ]


def test_pipeline_prices_target_at_two_dates():
    report = run_pricing_pipeline(_target(), _candidates(), _curves(), [D1, D2], limit=5)

    assert report["observation_dates"] == ["2026-01-02", "2026-02-02"]
    assert set(report["dates"]) == {"2026-01-02", "2026-02-02"}

    first = report["dates"]["2026-01-02"]
    assert first["valuation_allowed"] is True
    selected_isins = [item["isin"] for item in first["selected"]]
    assert "XS9999999999" not in selected_isins
    assert "XS0000000004" not in selected_isins
    assert "XS0000000005" not in selected_isins
    assert set(selected_isins) == {"XS0000000001", "XS0000000002"}
    assert all(item["z_spread_bps"] is not None for item in first["selected"])

    excluded_reasons = [item["reason"] for item in first["excluded"]]
    assert "titre cible exclu du panel" in excluded_reasons
    assert "devise différente" in excluded_reasons
    assert any("date de marché" in reason for reason in excluded_reasons)

    # Le Z-spread de chaque comparable est cohérent avec son prix implicite.
    zero_fn = zero_rate_function(_curves()[D1])
    for item in first["selected"]:
        price = bond_price(
            item["coupon_rate_pct"] / 100,
            item["yield_to_maturity_pct"] / 100,
            D1,
            item["maturity_date"],
            100.0,
            2,
            "ACT/365",
        )["dirty_price"]
        flows = bond_cashflows(D1, item["maturity_date"], item["coupon_rate_pct"] / 100, 100.0, 2)
        expected_z = z_spread_from_price(flows, zero_fn, price) * 10000
        assert item["z_spread_bps"] == pytest.approx(expected_z, abs=1e-3)

    # Z-spread pondéré = moyenne pondérée par les scores de similarité.
    expected_weighted = weighted_spread(
        [
            SpreadObservation(item["z_spread_bps"], item["similarity_score"])
            for item in first["selected"]
        ]
    )
    result = first["result"]
    assert result["weighted_z_spread_bps"] == pytest.approx(expected_weighted, abs=1e-3)

    # Yield = taux zéro à maturité (courbe EUR 6M) + Z-spread.
    maturity_years = (date(2030, 1, 1) - D1).days / 365
    expected_yield = zero_rate_at(maturity_years, _curves()[D1]) + expected_weighted / 10000
    assert result["yield_from_curve_and_z_spread"] == pytest.approx(expected_yield, abs=1e-6)

    # Le prix de la cible est cohérent avec le YTM implicite.
    assert bond_price(
        0.04, result["implied_ytm"], D1, date(2030, 1, 1), 100.0, 2, "ACT/ACT"
    )["dirty_price"] == pytest.approx(result["dirty_price"], abs=1e-6)
    assert result["clean_price"] == pytest.approx(
        result["dirty_price"] - result["accrued_interest"], abs=1e-8
    )
    assert result["comparables_used_count"] == len(first["selected"])
    assert "Z-spread" in first["methodology"]

    # La seconde date produit aussi une valorisation.
    second = report["dates"]["2026-02-02"]
    assert second["result"] is not None
    assert [item["isin"] for item in second["selected"]] == ["XS0000000003"]


def test_pipeline_degrades_gracefully_without_curve_or_dated_data():
    candidates = [_candidate(market_date=None)]
    report = run_pricing_pipeline(_target(), candidates, {D1: [CurveNode(1, 0.02)]}, [D1, D2])

    first = report["dates"]["2026-01-02"]
    assert first["selected"] == []
    assert first["result"] is None
    assert first["valuation_allowed"] is False

    second = report["dates"]["2026-02-02"]
    assert second["result"] is None
    assert second["valuation_allowed"] is False
    assert any("courbe" in flag for flag in second["quality_flags"])


def test_pipeline_marks_non_official_data_as_indicative():
    candidates = [_candidate(data_status="synthetic_demo")]
    report = run_pricing_pipeline(_target(), candidates, _curves(), [D1, D2])

    first = report["dates"]["2026-01-02"]
    assert first["result"] is not None
    assert first["valuation_allowed"] is False
    assert any("official" in flag for flag in first["quality_flags"])


def test_pipeline_uses_clean_price_when_ytm_is_missing():
    candidates = [_candidate(yield_to_maturity_pct=None, clean_price=98.5)]
    report = run_pricing_pipeline(_target(), candidates, _curves(), [D1, D2])

    first = report["dates"]["2026-01-02"]
    item = first["selected"][0]
    assert item["z_spread_bps"] is not None
    assert first["result"] is not None

    # Cohérence : le Z-spread résout PV(courbe + Z) = prix clean + intérêts courus.
    accrued = bond_price(0.04, 0, D1, date(2030, 1, 1), 100.0, 2, "ACT/365")[
        "accrued_interest"
    ]
    flows = bond_cashflows(D1, date(2030, 1, 1), 0.04, 100.0, 2)
    z = item["z_spread_bps"] / 10000
    assert present_value(flows, zero_rate_function(_curves()[D1]), z) == pytest.approx(
        98.5 + accrued, abs=1e-3
    )


def test_pipeline_requires_two_ordered_dates_and_eur():
    with pytest.raises(ValueError, match="deux dates"):
        run_pricing_pipeline(_target(), [], _curves(), [D1])
    with pytest.raises(ValueError, match="postérieure"):
        run_pricing_pipeline(_target(), [], _curves(), [D2, D1])
    with pytest.raises(ValueError, match="EUR"):
        run_pricing_pipeline(
            replace(_target(), currency="USD"), [], _curves(), [D1, D2]
        )
