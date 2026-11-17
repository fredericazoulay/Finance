import json

import pytest

import mistral_judge
from mistral_judge import (
    JudgeConfigurationError,
    JudgeServiceError,
    challenge_panel,
    challenge_valuation_report,
)


class FakeResponse:
    def __init__(self, value):
        self.value = value

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return json.dumps(self.value).encode("utf-8")


def _panel_report():
    return {
        "target": {"isin": "XS-TARGET", "currency": "EUR"},
        "selected": [
            {
                "isin": "XS-COMP",
                "spread_bps": 120,
                "source_name": "demo.csv",
                "data_status": "synthetic_demo",
                "market_date": None,
                "similarity_score": 90,
                "matches": ["notation équivalente"],
                "differences": [],
            }
        ],
        "methodology": "Classement pondéré.",
        "quality_flags": ["Données synthétiques."],
        "valuation_allowed": False,
    }


def test_judge_sends_minimized_evidence_and_validates_review(monkeypatch):
    review_content = {
        "verdict": "challenge",
        "critical_findings": ["Les données sont synthétiques."],
        "other_findings": [],
        "challenge_questions": ["Quelle est la date de marché ?"],
        "summary": "Le résultat ne peut pas représenter un prix de marché.",
    }
    response = {
        "model": "mistral-large-4-0",
        "choices": [{"message": {"content": json.dumps(review_content)}}],
    }
    requests = []
    monkeypatch.setattr(
        mistral_judge,
        "urlopen",
        lambda request, timeout: requests.append((request, timeout))
        or FakeResponse(response),
    )

    result = challenge_panel(
        _panel_report(), api_key="test-secret", model="mistral-large-4-0"
    )

    request, timeout = requests[0]
    sent_body = json.loads(request.data)
    assert result["verdict"] == "challenge"
    assert result["model"] == "mistral-large-4-0"
    assert "test-secret" not in request.data.decode("utf-8")
    assert request.get_header("Authorization") == "Bearer test-secret"
    assert sent_body["messages"][1]["content"].find("synthetic_demo") >= 0
    assert timeout == 30


def test_judge_requires_api_key(monkeypatch):
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)

    with pytest.raises(JudgeConfigurationError, match="MISTRAL_API_KEY"):
        challenge_panel(_panel_report(), api_key="")


def test_judge_rejects_malformed_review(monkeypatch):
    monkeypatch.setattr(
        mistral_judge,
        "urlopen",
        lambda request, timeout: FakeResponse(
            {
                "choices": [
                    {"message": {"content": '{"verdict":"approve"}'}}
                ]
            }
        ),
    )

    with pytest.raises(JudgeServiceError, match="verdict non reconnu"):
        challenge_panel(_panel_report(), api_key="test-secret")


def test_valuation_challenge_includes_price_and_manual_data_provenance(monkeypatch):
    seen = {}

    def fake_challenge(evidence, **kwargs):
        seen.update(evidence)
        return {"verdict": "challenge"}

    monkeypatch.setattr(mistral_judge, "challenge_panel", fake_challenge)
    valuation = {
        "request": {
            "issuer": "Issuer",
            "isin": "XS-TARGET",
            "sector": "Corporate",
            "rating": "BBB",
            "seniority": "Senior",
            "currency": "EUR",
            "observation_date": "2025-01-01",
            "settlement_date": "2025-01-01",
            "maturity_date": "2030-01-01",
            "coupon": 0.04,
            "frequency": 2,
            "curve_source": "User entered",
            "curve": [{"years": 5.0, "rate": 0.025}],
            "comparables": [
                {
                    "name": "XS-COMP",
                    "z_spread_bps": 110,
                    "similarity": 80,
                    "included": True,
                    "reason": "",
                    "source": "User supplied",
                }
            ],
        },
        "methodology": {"spread": "weighted"},
        "warnings": ["Prototype"],
        "result": {"clean_price": 99.5, "implied_ytm": 0.045},
    }

    result = challenge_valuation_report(valuation, api_key="test-secret")

    assert result == {"verdict": "challenge"}
    assert seen["valuation_result"] == valuation["result"]
    assert seen["selected"][0]["data_status"] == "user_entered_unverified"
    assert seen["selected"][0]["z_spread_bps"] == 110
    assert seen["zero_curve"] == valuation["request"]["curve"]
    assert any("provenance" in warning for warning in seen["quality_flags"])
