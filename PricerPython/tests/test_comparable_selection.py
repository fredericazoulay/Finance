from datetime import date

from comparable_selection import TargetBond, select_comparables


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
        "spread_bps": 120,
        "market_date": None,
        "source_name": "demo.csv",
        "data_status": "synthetic_demo",
    }
    candidate.update(overrides)
    return candidate


def _target():
    return TargetBond(
        isin="XS0000000004",
        issuer="New Issuer",
        sector="Corporate",
        rating="BBB",
        seniority="Senior",
        currency="EUR",
        maturity_date=date(2030, 1, 1),
        observation_date=date(2025, 1, 1),
        coupon_rate_pct=4.0,
    )


def test_select_comparables_explains_rank_and_blocks_demo_valuation():
    best = _candidate()
    weaker = _candidate(
        isin="XS0000000002",
        rating="A",
        maturity_date=date(2034, 1, 1),
        seniority="Subordinated",
    )
    wrong_currency = _candidate(isin="XS0000000003", currency="USD")
    target_bond = _candidate(isin="XS0000000004")
    expired = _candidate(
        isin="XS0000000005", maturity_date=date(2024, 1, 1)
    )
    wrong_type = _candidate(
        isin="XS0000000006",
        bond_type="Floating",
        coupon_type="Floating",
    )

    report = select_comparables(
        _target(),
        [weaker, wrong_currency, target_bond, expired, wrong_type, best],
    )

    assert [item["isin"] for item in report["selected"]] == [
        "XS0000000001",
        "XS0000000002",
    ]
    assert report["selected"][0]["similarity_score"] == 100
    assert "notation équivalente" in report["selected"][0]["matches"]
    assert "devise différente" in [
        item["reason"] for item in report["excluded"]
    ]
    assert "titre cible exclu du panel" in [
        item["reason"] for item in report["excluded"]
    ]
    assert report["valuation_allowed"] is False
    assert any("synthétique" in flag for flag in report["quality_flags"])
    assert any("date d'observation" in flag for flag in report["quality_flags"])
    assert "pas un Z-spread" in report["spread_label"]


def test_selection_rejects_invalid_limit():
    try:
        select_comparables(_target(), [], limit=0)
    except ValueError as exc:
        assert "compris entre 1 et 20" in str(exc)
    else:
        raise AssertionError("Invalid candidate limit should be rejected.")
