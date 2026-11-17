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


def test_openapi_documents_all_endpoints():
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert {
        "/pricing/price",
        "/pricing/yield",
        "/pricing/spread",
        "/pricing/confidence",
        "/obligations",
        "/health",
    }.issubset(paths)


def test_health_endpoint_reports_api_availability():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_obligations_endpoint_passes_search_and_limit(monkeypatch):
    import app as app_module

    monkeypatch.setattr(
        app_module,
        "search_obligations",
        lambda search, limit: [{"isin": search, "devise": "EUR"}],
    )

    response = client.get("/obligations", params={"search": "XS1000000002", "limit": 5})

    assert response.status_code == 200
    assert response.json() == [{"isin": "XS1000000002", "devise": "EUR"}]


def test_obligations_endpoint_limits_result_size():
    response = client.get("/obligations", params={"limit": 501})

    assert response.status_code == 422


def test_obligations_endpoint_reports_database_unavailability(monkeypatch):
    import psycopg
    import app as app_module

    def fail_search(search, *, limit):
        raise psycopg.OperationalError("database unavailable")

    monkeypatch.setattr(app_module, "search_obligations", fail_search)

    response = client.get("/obligations")

    assert response.status_code == 503
    assert response.json()["detail"] == "La base PostgreSQL est indisponible."


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


def test_price_endpoint_respects_redemption_percent():
    response = client.post(
        "/pricing/price",
        json={
            "coupon": 0,
            "ytm": 0,
            "settlement_date": "2025-01-01",
            "maturity_date": "2026-01-01",
            "redemption_percent": 105,
        },
    )
    assert response.status_code == 200
    assert response.json()["dirty_price"] == 105
