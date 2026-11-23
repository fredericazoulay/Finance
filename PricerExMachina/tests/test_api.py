from fastapi.testclient import TestClient

from app.main import create_app


class FakeRepository:
    database_url = None

    def fetch_date_inputs(self, _target, observation_date):
        return {
            "peers": [
                {
                    "isin": f"PEER-{observation_date}-{index}",
                    "currency": "EUR",
                    "maturity_date": "2030-06-01",
                    "market_date": observation_date,
                    "spread_bps": 95 + index * 5,
                    "source_name": "official test import",
                    "data_status": "official",
                    "issuer": "Example Issuer",
                    "rating": "A",
                    "seniority": "Senior",
                }
                for index in range(3)
            ],
            "swap_par_curve": [],
        }


def pricing_payload():
    return {
        "target": {
            "isin": "TARGET",
            "issuer": "Example Issuer",
            "rating": "A",
            "seniority": "Senior",
            "currency": "EUR",
            "maturity_date": "2030-10-27",
            "cashflows": [{"payment_date": "2030-10-27", "amount": 100}],
            "accrued_interest_by_date": {"2026-10-27": 0},
        },
        "observation_dates": ["2026-10-27", "2026-10-28"],
        "selection": {
            "maturity_tolerance_months": 24,
            "minimum_comparables": 2,
            "maximum_comparables": 3,
            "match_fields": ["issuer", "rating", "seniority"],
            "spread_measure": "z_spread_bps",
        },
        "zero_curves": [
            {
                "observation_date": observation_date,
                "source": "official test curve",
                "data_status": "official",
                "nodes": [
                    {"time_years": 0.5, "zero_rate": 0.02},
                    {"time_years": 5, "zero_rate": 0.03},
                ],
            }
            for observation_date in ("2026-10-27", "2026-10-28")
        ],
    }


def test_health_and_pricing_endpoint():
    app = create_app(
        repository=FakeRepository(),
        audit_sender=lambda _result: {"status": "not_configured", "reason": "SMTP not configured"},
    )
    client = TestClient(app)
    assert client.get("/health").json()["status"] == "UP"
    response = client.post("/api/pricing", json=pricing_payload())
    assert response.status_code == 200
    result = response.json()
    assert [item["status"] for item in result["valuations"]] == ["calculated", "calculated"]
    assert all(len(item["comparables"]) == 3 for item in result["valuations"])
    assert result["audit_status"] == "not_configured"


def test_pricing_endpoint_returns_validation_errors():
    client = TestClient(create_app(repository=FakeRepository()))
    response = client.post("/api/pricing", json={"target": {}})
    assert response.status_code == 400
    assert "target.isin" in response.json()["detail"]


def test_workbook_preview_endpoint_is_read_only():
    from io import BytesIO
    from datetime import date

    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "market_observations"
    sheet.append(["isin", "currency", "maturity_date", "market_date", "spread_bps", "source_name", "data_status"])
    sheet.append(["PEER", "EUR", date(2030, 6, 1), date(2026, 10, 27), 100, "source", "official"])
    buffer = BytesIO()
    workbook.save(buffer)
    response = TestClient(create_app(repository=FakeRepository())).post(
        "/api/market-data/preview",
        content=buffer.getvalue(),
        headers={"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    )
    assert response.status_code == 200
    assert response.json()["market_observations"]["valid_rows"] == 1
    assert response.json()["writes_performed"] is False
