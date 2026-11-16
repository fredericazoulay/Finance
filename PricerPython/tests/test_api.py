from datetime import date

from fastapi.testclient import TestClient

from app import app

client = TestClient(app)


def test_spread_endpoint():
    response = client.post(
        "/pricing/spread",
        json={
            "panel": [
                {"spread_bps": 100, "similarity_score": 1},
                {"spread_bps": 200, "similarity_score": 3},
            ]
        },
    )
    assert response.status_code == 200
    assert response.json() == {"weighted_spread_bps": 175}


def test_yield_endpoint():
    response = client.post(
        "/pricing/yield",
        json={"risk_free_rate": 0.025, "spread_bps": 175},
    )
    assert response.status_code == 200
    assert response.json() == {"theoretical_yield": 0.0425}


def test_confidence_endpoint():
    response = client.post(
        "/pricing/confidence",
        json={
            "nb_comparables": 5,
            "avg_similarity": 1,
            "data_quality": 0.8,
            "liquidity": 0.5,
        },
    )
    assert response.status_code == 200
    assert response.json() == {"confidence_score": 0.85}


def test_price_endpoint_and_coupon_fraction():
    response = client.post(
        "/pricing/price",
        json={
            "coupon": 0.04,
            "ytm": 0.05,
            "settlement_date": date(2025, 4, 1).isoformat(),
            "maturity_date": date(2026, 1, 1).isoformat(),
            "frequency": 2,
            "day_count": "ACT/ACT",
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["dirty_price"] > result["clean_price"]
    assert result["accrued_interest"] > 0


def test_openapi_documents_all_pricing_endpoints():
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert {
        "/pricing/price",
        "/pricing/yield",
        "/pricing/spread",
        "/pricing/confidence",
    }.issubset(paths)


def test_price_endpoint_rejects_invalid_frequency():
    response = client.post(
        "/pricing/price",
        json={
            "coupon": 0.04,
            "ytm": 0.05,
            "settlement_date": "2025-04-01",
            "maturity_date": "2026-01-01",
            "frequency": 3,
        },
    )
    assert response.status_code == 422
