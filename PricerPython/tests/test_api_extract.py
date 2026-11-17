from fastapi.testclient import TestClient

from app import app

client = TestClient(app)

REQUEST = (
    "Pricer une obligation émise par Acme Corp, corporate, notée BB+, coupon 4,5 %, "
    "échéance 15/10/2031, EUR, aux dates d'observation 24/10/2026 et 26/10/2026."
)


def test_extract_target_endpoint_uses_local_fallback_without_key(monkeypatch):
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)

    response = client.post("/pricing/extract-target", json={"request": REQUEST})

    assert response.status_code == 200
    body = response.json()
    assert body["extractor"] == "local"
    assert body["target"]["issuer"] == "Acme Corp"
    assert body["target"]["rating"] == "BB+"
    assert body["target"]["coupon_pct"] == 4.5
    assert body["target"]["maturity_date"] == "2031-10-15"
    assert body["target"]["observation_dates"] == ["2026-10-24", "2026-10-26"]


def test_extract_target_endpoint_returns_llm_result(monkeypatch):
    import app as app_module

    def fake_extract(request_text, **kwargs):
        return {
            "extractor": "mistral",
            "model": "mistral-large-4-0",
            "target": {"issuer": "Acme Corp", "currency": "EUR"},
            "missing_fields": ["maturity_date"],
        }

    monkeypatch.setattr(app_module, "extract_target", fake_extract)

    response = client.post("/pricing/extract-target", json={"request": REQUEST})

    assert response.status_code == 200
    body = response.json()
    assert body["extractor"] == "mistral"
    assert body["missing_fields"] == ["maturity_date"]


def test_extract_target_endpoint_rejects_empty_request():
    response = client.post("/pricing/extract-target", json={"request": "ok"})

    assert response.status_code == 422
