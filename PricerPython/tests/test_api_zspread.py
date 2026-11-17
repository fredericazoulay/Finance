import pytest
from fastapi.testclient import TestClient

from app import app

client = TestClient(app)


def test_z_spread_endpoint_matches_use_case_example():
    response = client.post(
        "/pricing/z-spread",
        json={
            "cashflows": [
                {"years": 1.0, "amount": 5.0},
                {"years": 2.0, "amount": 5.0},
                {"years": 3.0, "amount": 105.0},
            ],
            "curve": [
                {"years": 1, "zero_rate": 0.02},
                {"years": 2, "zero_rate": 0.025},
                {"years": 3, "zero_rate": 0.03},
            ],
            "price": 104.00,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["z_spread_bps"] == pytest.approx(60.25, abs=0.1)
    assert body["z_spread"] == pytest.approx(0.006025, abs=1e-5)


def test_z_spread_endpoint_rejects_out_of_bounds_price():
    response = client.post(
        "/pricing/z-spread",
        json={
            "cashflows": [{"years": 1.0, "amount": 105.0}],
            "curve": [{"years": 1, "zero_rate": 0.02}],
            "price": 1000,
        },
    )

    assert response.status_code == 422
    assert "hors des bornes" in response.json()["detail"]


def test_bootstrap_endpoint_returns_zero_curve():
    response = client.post(
        "/curve/bootstrap",
        json={
            "swaps": [
                {"years": 0.5, "par_rate": 0.02},
                {"years": 1.0, "par_rate": 0.022},
                {"years": 2.0, "par_rate": 0.025},
            ],
            "frequency": 2,
        },
    )

    assert response.status_code == 200
    curve = response.json()["curve"]
    assert [node["years"] for node in curve] == [0.5, 1.0, 2.0]
    rates = [node["zero_rate"] for node in curve]
    assert rates == sorted(rates)


def test_bootstrap_endpoint_rejects_duplicate_maturities():
    response = client.post(
        "/curve/bootstrap",
        json={
            "swaps": [
                {"years": 1.0, "par_rate": 0.02},
                {"years": 1.0, "par_rate": 0.03},
            ]
        },
    )

    assert response.status_code == 422


def _panel_payload():
    return {
        "target": {
            "isin": "XS9999999999",
            "issuer": "Nouvel Émetteur",
            "sector": "Corporate",
            "rating": "BBB",
            "seniority": "Senior",
            "currency": "EUR",
            "maturity_date": "2030-01-01",
            "coupon": 0.04,
            "nominal": 100.0,
            "frequency": 2,
        },
        "comparables": [
            {
                "isin": "XS0000000001",
                "issuer": "Issuer A",
                "issuer_type": "Corporate",
                "bond_type": "Fixed",
                "currency": "EUR",
                "maturity_date": "2030-01-01",
                "coupon_type": "Fixed",
                "seniority": "Senior",
                "rating": "BBB",
                "coupon_rate_pct": 4.0,
                "payment_frequency": 2,
                "day_count": "ACT/365",
                "yield_to_maturity_pct": 4.5,
                "market_date": "2026-01-02",
                "source_name": "fournisseur-licencie",
                "data_status": "official",
            }
        ],
        "curves": {
            "2026-01-02": [
                {"years": 1, "zero_rate": 0.02},
                {"years": 5, "zero_rate": 0.028},
                {"years": 10, "zero_rate": 0.032},
            ],
            "2026-02-02": [
                {"years": 1, "zero_rate": 0.021},
                {"years": 5, "zero_rate": 0.029},
                {"years": 10, "zero_rate": 0.033},
            ],
        },
        "observation_dates": ["2026-01-02", "2026-02-02"],
    }


def test_panel_endpoint_prices_target_at_two_dates():
    response = client.post("/pricing/panel", json=_panel_payload())

    assert response.status_code == 200
    report = response.json()
    assert report["observation_dates"] == ["2026-01-02", "2026-02-02"]

    first = report["dates"]["2026-01-02"]
    assert first["valuation_allowed"] is True
    assert first["result"]["weighted_z_spread_bps"] > 0
    assert first["result"]["yield_from_curve_and_z_spread"] > 0
    assert first["result"]["comparables_used"] == ["XS0000000001"]
    assert first["selected"][0]["z_spread_bps"] > 0

    second = report["dates"]["2026-02-02"]
    assert second["result"] is None
    assert second["valuation_allowed"] is False


def test_panel_endpoint_rejects_single_observation_date():
    payload = _panel_payload()
    payload["observation_dates"] = ["2026-01-02"]

    response = client.post("/pricing/panel", json=payload)

    assert response.status_code == 422


def test_openapi_documents_new_endpoints():
    response = client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert {"/pricing/z-spread", "/curve/bootstrap", "/pricing/panel"}.issubset(paths)
