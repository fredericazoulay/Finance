from dataclasses import replace
from datetime import date
import math

import pytest

from pricing import DayCount, bond_price
from valuation import (
    Comparable,
    CurveNode,
    ObligationDetails,
    ValuationRequest,
    list_obligations,
    list_reports,
    save_obligation,
    save_report,
    value_bond,
)


@pytest.fixture
def valuation_request():
    return ValuationRequest(
        issuer="Exemple",
        isin="",
        sector="Utilities",
        rating="BBB",
        seniority="Senior",
        currency="EUR",
        observation_date=date(2025, 1, 1),
        settlement_date=date(2025, 1, 1),
        maturity_date=date(2027, 1, 1),
        coupon=0.04,
        nominal=100,
        frequency=1,
        day_count=DayCount.ACT_ACT,
        curve_source="Courbe zéro de test",
        comparables=[
            Comparable("A", 100, 25, True, "", "Source A"),
            Comparable("B", 200, 75, True, "", "Source B"),
            Comparable("C", None, None, False, "Séniorité différente", ""),
        ],
        curve=[CurveNode(1, 0.02), CurveNode(2, 0.03)],
    )


def test_valuation_uses_z_spread_curve_and_implied_yield(valuation_request):
    report = value_bond(valuation_request)
    result = report["result"]
    expected_dirty = 4 / (1 + 0.0375) + 104 / (1 + 0.0475) ** 2
    assert result["weighted_z_spread_bps"] == pytest.approx(175)
    assert result["dirty_price"] == pytest.approx(expected_dirty)
    assert result["selected_count"] == 2
    assert report["methodology"]["curve"].startswith("Taux zéro effectifs annuels")
    assert report["methodology"]["discount"].startswith("(1 + taux zéro + Z-spread)")
    assert bond_price(
        valuation_request.coupon,
        result["implied_ytm"],
        valuation_request.settlement_date,
        valuation_request.maturity_date,
        valuation_request.nominal,
        valuation_request.frequency,
        valuation_request.day_count,
    )["dirty_price"] == pytest.approx(result["dirty_price"], abs=1e-7)
    assert report["request"]["comparables"][2]["reason"] == "Séniorité différente"


def test_redemption_percent_changes_price_and_yield_consistently(valuation_request):
    details = ObligationDetails(prix_remboursement=105)
    request = replace(valuation_request, obligation_details=details)
    result = value_bond(request)["result"]
    expected_dirty = 4 / (1 + 0.0375) + 109 / (1 + 0.0475) ** 2
    assert result["dirty_price"] == pytest.approx(expected_dirty)
    assert bond_price(
        request.coupon, result["implied_ytm"], request.settlement_date,
        request.maturity_date, request.nominal, request.frequency,
        request.day_count, redemption_percent=105,
    )["dirty_price"] == pytest.approx(expected_dirty, abs=1e-7)


def test_all_obligation_fields_survive_report_and_storage(valuation_request, tmp_path):
    details = ObligationDetails(
        produit="Titre", type_obl="fixe", cusip="123456789", obligation="Test 2027",
        famille="Crédit", sousfamille="Senior", type_bbg="FIXED",
        convention_int="ACT/ACT", date_premier_cpn=date(2025, 1, 1),
        date_maturite_attendue=date(2027, 1, 1), date_annonce=date(2024, 1, 1),
        prix_remboursement=105, montant_emission=1000000, type_conversion="non",
        calendrier="aucun", coupon_hybride="non", convention_calc="aucun",
        prix_emission=99, lei="LEI-test",
    )
    request = replace(
        valuation_request, isin="ISIN-test", obligation_details=details, type_bbg_verified=True
    )
    report = value_bond(request)
    path = tmp_path / "valuations.sqlite3"
    save_report(report, path)
    saved = list_reports(path)[0]["report"]["obligation"]
    assert set(saved) == {
        "isin", "produit", "type_obl", "cusip", "obligation", "emetteur", "famille",
        "sousfamille", "secteur", "type_bbg", "convention_int", "date_premier_cpn",
        "date_maturite", "date_maturite_attendue", "date_annonce", "prix_remboursement",
        "montant_emission", "type_conversion", "calendrier", "coupon_hybride",
        "convention_calc", "devise", "prix_emission", "lei",
    }
    assert saved["date_premier_cpn"] == "2025-01-01"
    assert saved["prix_remboursement"] == 105
    assert saved["cusip"] == "123456789"


@pytest.mark.parametrize(
    ("details", "message"),
    [
        (ObligationDetails(type_obl="variable"), "type_obl"),
        (ObligationDetails(type_bbg="code-inconnu"), "type_bbg"),
        (ObligationDetails(type_conversion="convertible"), "type_conversion"),
        (ObligationDetails(coupon_hybride="oui"), "coupon_hybride"),
        (ObligationDetails(calendrier="TARGET"), "calendrier"),
        (ObligationDetails(convention_calc="inconnue"), "convention_calc"),
        (ObligationDetails(convention_int="ACT/360"), "convention_int"),
        (ObligationDetails(date_maturite_attendue=date(2026, 1, 1)), "maturité attendue"),
        (ObligationDetails(date_premier_cpn=date(2024, 6, 1)), "irrégulière"),
        (ObligationDetails(date_premier_cpn=date(2026, 1, 1)), "premier coupon"),
    ],
)
def test_unsupported_instrument_is_rejected(valuation_request, details, message):
    with pytest.raises(ValueError, match=message):
        value_bond(replace(valuation_request, obligation_details=details))


def test_unsupported_instrument_can_be_saved_without_valuation(valuation_request, tmp_path):
    request = replace(
        valuation_request, obligation_details=ObligationDetails(type_conversion="convertible")
    )
    path = tmp_path / "valuations.sqlite3"
    save_obligation(request, path)
    assert list_obligations(path)[0]["obligation"]["type_conversion"] == "convertible"
    assert list_reports(path) == []


def test_rejects_missing_exclusion_reason_and_invalid_curve(valuation_request):
    excluded = Comparable("C", None, None, False, "", "")
    with pytest.raises(ValueError, match="motif"):
        value_bond(replace(valuation_request, comparables=[valuation_request.comparables[0], excluded]))
    with pytest.raises(ValueError, match="distinctes"):
        value_bond(replace(valuation_request, curve=[CurveNode(1, 0.02), CurveNode(1, 0.03)]))


def test_report_persists_inputs_and_result(valuation_request, tmp_path):
    report = value_bond(valuation_request)
    path = tmp_path / "valuations.sqlite3"
    first = save_report(report, path)
    other_date = replace(valuation_request, observation_date=date(2024, 12, 31))
    second = save_report(value_bond(other_date), path)
    history = list_reports(path)

    assert [item["id"] for item in history] == [second, first]
    assert history[0]["observation_date"] == "2024-12-31"
    assert history[1]["report"]["request"]["curve_source"] == "Courbe zéro de test"
    assert history[1]["report"]["result"]["weighted_z_spread_bps"] == 175


def test_long_monthly_bond_does_not_overflow_yield_solver(valuation_request):
    long_bond = replace(
        valuation_request,
        maturity_date=date(2124, 12, 31),
        frequency=12,
        curve=[CurveNode(100, 0.03)],
    )
    result = value_bond(long_bond)["result"]
    assert math.isfinite(result["implied_ytm"])
    assert result["dirty_price"] > 0


def test_schedule_stays_anchored_to_non_month_end_maturity():
    result = bond_price(
        0.06, 0.0, date(2024, 3, 29), date(2025, 5, 30), frequency=12,
        day_count=DayCount.ACT_365,
    )
    assert result["accrued_interest"] == pytest.approx(100 * 0.06 * 29 / 365, abs=1e-8)
