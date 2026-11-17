import json
from datetime import date

import pytest

import request_extraction
from request_extraction import (
    ExtractionConfigurationError,
    ExtractionServiceError,
    extract_target,
    extract_target_local,
    extract_target_with_mistral,
)

FR_REQUEST = (
    "Pricer une obligation émise par Acme Corp, secteur corporate, notée BB+, "
    "séniorité senior, coupon de 4,5 % payé semestriellement, échéance 15/10/2031, "
    "devise EUR, ISIN XS1234567890, aux dates d'observation 24/10/2026 et 26/10/2026."
)

EN_REQUEST = (
    "Price a new bond issued by Globex, financials sector, rated A-, senior, "
    "3% annual coupon, maturity 2031-12-31, USD, ISIN US0378331005, "
    "observed on 2026-10-24 and 2026-10-27."
)


def test_local_extractor_parses_french_request():
    result = extract_target_local(FR_REQUEST)

    assert result["extractor"] == "local"
    target = result["target"]
    assert target["issuer"] == "Acme Corp"
    assert target["isin"] == "XS1234567890"
    assert target["sector"] == "Corporate"
    assert target["rating"] == "BB+"
    assert target["seniority"] == "Senior"
    assert target["currency"] == "EUR"
    assert target["coupon_pct"] == pytest.approx(4.5)
    assert target["frequency"] == 2
    assert target["maturity_date"] == "2031-10-15"
    assert target["observation_dates"] == ["2026-10-24", "2026-10-26"]
    assert result["missing_fields"] == []


def test_local_extractor_parses_english_request():
    result = extract_target_local(EN_REQUEST)

    target = result["target"]
    assert target["issuer"] == "Globex"
    assert target["isin"] == "US0378331005"
    assert target["sector"] == "Financials"
    assert target["rating"] == "A-"
    assert target["seniority"] == "Senior"
    assert target["currency"] == "USD"
    assert target["coupon_pct"] == pytest.approx(3.0)
    assert target["frequency"] == 1
    assert target["maturity_date"] == "2031-12-31"
    assert target["observation_dates"] == ["2026-10-24", "2026-10-27"]


def test_local_extractor_reports_missing_fields():
    result = extract_target_local("Pricer une obligation souveraine en EUR.")

    assert result["extractor"] == "local"
    assert result["target"]["sector"] == "Sovereign"
    assert result["target"]["currency"] == "EUR"
    assert "issuer" in result["missing_fields"]
    assert "maturity_date" in result["missing_fields"]
    assert "observation_dates" in result["missing_fields"]


def test_local_extractor_supports_relative_maturity():
    result = extract_target_local("Obligation corporate senior, coupon 2%, maturité dans 5 ans.")

    maturity = date.fromisoformat(result["target"]["maturity_date"])
    assert 4 <= (maturity - date.today()).days / 365 <= 6


def test_extract_target_falls_back_to_local_without_api_key(monkeypatch):
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)

    result = extract_target(FR_REQUEST, api_key="")

    assert result["extractor"] == "local"
    assert result["target"]["isin"] == "XS1234567890"


def test_extract_target_rejects_empty_request():
    with pytest.raises(ValueError, match="vide"):
        extract_target("   ")


def test_mistral_extractor_requires_api_key(monkeypatch):
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)

    with pytest.raises(ExtractionConfigurationError, match="MISTRAL_API_KEY"):
        extract_target_with_mistral(FR_REQUEST, api_key="")


class _FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_mistral_extractor_parses_json_response(monkeypatch):
    captured = {}

    def fake_urlopen(request, timeout):
        captured["body"] = json.loads(request.data.decode("utf-8"))
        captured["auth"] = request.get_header("Authorization")
        return _FakeResponse(
            {
                "model": "mistral-large-4-0",
                "choices": [
                    {
                        "message": {
                            "content": (
                                "```json\n"
                                '{"issuer": "Acme Corp", "isin": "XS1234567890", '
                                '"sector": "Corporate", "rating": "BB+", "seniority": "Senior", '
                                '"currency": "EUR", "maturity_date": "2031-10-15", '
                                '"coupon_pct": 4.5, "frequency": 2, '
                                '"observation_dates": ["2026-10-24", "2026-10-26"]}\n'
                                "```"
                            )
                        }
                    }
                ],
            }
        )

    monkeypatch.setattr(request_extraction, "urlopen", fake_urlopen)
    result = extract_target_with_mistral(FR_REQUEST, api_key="test-secret")

    assert result["extractor"] == "mistral"
    assert result["model"] == "mistral-large-4-0"
    assert result["target"]["issuer"] == "Acme Corp"
    assert result["target"]["coupon_pct"] == pytest.approx(4.5)
    assert result["missing_fields"] == []
    assert captured["auth"] == "Bearer test-secret"
    assert captured["body"]["response_format"] == {"type": "json_object"}


def test_mistral_extractor_rejects_malformed_json(monkeypatch):
    monkeypatch.setattr(
        request_extraction,
        "urlopen",
        lambda request, timeout: _FakeResponse(
            {"choices": [{"message": {"content": "pas du json"}}]}
        ),
    )

    with pytest.raises(ExtractionServiceError, match="JSON"):
        extract_target_with_mistral(FR_REQUEST, api_key="test-secret")


def test_extract_target_falls_back_to_local_on_service_error(monkeypatch):
    def failing_urlopen(request, timeout):
        raise request_extraction.URLError("connexion refusée")

    monkeypatch.setattr(request_extraction, "urlopen", failing_urlopen)
    result = extract_target(FR_REQUEST, api_key="test-secret")

    assert result["extractor"] == "local"
    assert "fallback_reason" in result
    assert result["target"]["isin"] == "XS1234567890"
