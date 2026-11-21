from datetime import date
from pathlib import Path

from streamlit.testing.v1 import AppTest

from curve import SwapPoint

DATE_1 = date(2026, 10, 24)
DATE_2 = date(2026, 10, 27)

SWAP_TEXT = "0.5;2.00\n1;2.20\n2;2.50\n3;2.80\n5;3.20\n7;3.50\n10;3.80"


def _observation(isin: str, market_date: date) -> dict:
    return {
        "observation_id": 1,
        "isin": isin,
        "issuer": "Issuer A",
        "issuer_type": "Corporate",
        "bond_type": "Fixed",
        "currency": "EUR",
        "issue_date": date(2021, 10, 15),
        "maturity_date": date(2031, 10, 15),
        "coupon_type": "Fixed",
        "coupon_rate_pct": 4.0,
        "day_count": "ACT/ACT",
        "payment_frequency": 2,
        "is_callable": False,
        "is_putable": False,
        "is_convertible": False,
        "is_perpetual": False,
        "is_inflation_linked": False,
        "is_green_bond": False,
        "is_social_bond": False,
        "is_sustainability_bond": False,
        "is_sustainability_linked": False,
        "is_secured": False,
        "seniority": "Senior",
        "rating_agency": "S&P",
        "rating": "BBB",
        "country": "FR",
        "market": "OTC",
        "face_value": 1000,
        "yield_to_maturity_pct": 4.5,
        "clean_price": None,
        "spread_bps": None,
        "esg_score": 50,
        "provider_claim": "Euronext",
        "reference_rate": "ESTR",
        "market_date": market_date,
        "source_name": "Euronext_Bonds_2026-10-27.csv",
        "data_status": "official",
    }


def _swap_points() -> list[SwapPoint]:
    return [
        SwapPoint(0.5, 0.02),
        SwapPoint(1.0, 0.022),
        SwapPoint(2.0, 0.025),
        SwapPoint(3.0, 0.028),
        SwapPoint(5.0, 0.032),
        SwapPoint(7.0, 0.035),
        SwapPoint(10.0, 0.038),
    ]


def test_pipeline_page_estimates_zspread_and_yield_at_two_dates(monkeypatch):
    import pipeline_ui

    monkeypatch.setattr(
        pipeline_ui,
        "list_market_observations",
        lambda: [_observation("XS1000000001", DATE_1), _observation("XS1000000002", DATE_2)],
    )
    monkeypatch.setattr(
        pipeline_ui,
        "list_swap_curves",
        lambda: {DATE_1: _swap_points(), DATE_2: _swap_points()},
    )

    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=30).run()
    app.switch_page("pages/pipeline_cas3.py").run()

    app.date_input(key="cas3_obs_date_1").set_value(DATE_1)
    app.date_input(key="cas3_obs_date_2").set_value(DATE_2)
    app.button(key="cas3_load_curves").click().run()

    app.text_input(key="cas3_target_issuer").set_value("New issuer")
    app.text_input(key="cas3_target_isin").set_value("XSNEW0000001")
    app.text_input(key="cas3_target_sector").set_value("Corporate")
    app.text_input(key="cas3_target_rating").set_value("BBB")
    app.text_input(key="cas3_target_seniority").set_value("Senior")
    app.number_input(key="cas3_target_coupon_rate").set_value(4.0)
    app.number_input(key="cas3_issue_spread_adjustment_bps").set_value(25.0)
    app.date_input(key="cas3_target_maturity").set_value(date(2031, 10, 15))
    app.text_area(key=f"cas3_swaps_{DATE_1.isoformat()}").set_value(SWAP_TEXT)
    app.text_area(key=f"cas3_swaps_{DATE_2.isoformat()}").set_value(SWAP_TEXT)
    app.button(key="cas3_run_pipeline").click().run()

    assert not app.exception
    assert not app.error
    report = app.session_state[pipeline_ui.REPORT_KEY]
    assert report["observation_dates"] == [DATE_1.isoformat(), DATE_2.isoformat()]
    assert report["issue_spread_adjustment_bps"] == 25
    for iso_date in (DATE_1.isoformat(), DATE_2.isoformat()):
        date_report = report["dates"][iso_date]
        assert date_report["valuation_allowed"] is True
        result = date_report["result"]
        assert result is not None
        assert result["weighted_z_spread_bps"] > 0
        assert result["comparables_used_count"] == 1
        assert result["issue_scenario"]["spread_adjustment_bps"] == 25
        assert result["issue_scenario"]["z_spread_bps"] == round(
            result["weighted_z_spread_bps"] + 25, 4
        )
        expected_yield = (
            result["zero_rate_at_maturity"] + result["weighted_z_spread_bps"] / 10000
        )
        assert abs(result["yield_from_curve_and_z_spread"] - expected_yield) < 1e-6
        assert result["clean_price"] < result["dirty_price"]


def test_pipeline_page_extracts_natural_language_request_and_prices(monkeypatch):
    import pipeline_ui

    monkeypatch.setattr(
        pipeline_ui,
        "list_market_observations",
        lambda: [_observation("XS1000000001", DATE_1), _observation("XS1000000002", DATE_2)],
    )
    monkeypatch.setattr(
        pipeline_ui,
        "list_swap_curves",
        lambda: {DATE_1: _swap_points(), DATE_2: _swap_points()},
    )

    def fake_extract(request_text, **kwargs):
        assert "Acme" in request_text
        return {
            "extractor": "local",
            "target": {
                "issuer": "Acme Corp",
                "isin": "XSNEW0000001",
                "sector": "Corporate",
                "rating": "BBB",
                "seniority": "Senior",
                "currency": "EUR",
                "maturity_date": "2031-10-15",
                "coupon_pct": 4.0,
                "nominal": 100.0,
                "frequency": 2,
                "observation_dates": [DATE_1.isoformat(), DATE_2.isoformat()],
            },
            "missing_fields": [],
        }

    monkeypatch.setattr(pipeline_ui, "extract_target", fake_extract)

    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=30).run()
    app.switch_page("pages/pipeline_cas3.py").run()

    app.text_area(key="cas3_request_text").set_value(
        "Pricer une obligation émise par Acme Corp, corporate, BBB, senior, "
        "coupon 4 %, échéance 15/10/2031, EUR, dates d'observation "
        "24/10/2026 et 26/10/2026."
    )
    app.button(key="cas3_extract").click().run()

    assert not app.exception
    assert app.session_state["cas3_target_issuer"] == "Acme Corp"
    assert app.session_state["cas3_target_isin"] == "XSNEW0000001"
    assert app.session_state["cas3_target_rating"] == "BBB"
    assert app.session_state["cas3_obs_date_1"] == DATE_1
    assert app.session_state["cas3_obs_date_2"] == DATE_2
    assert pipeline_ui.EXTRACT_RESULT_KEY in app.session_state

    app.text_area(key=f"cas3_swaps_{DATE_1.isoformat()}").set_value(SWAP_TEXT)
    app.text_area(key=f"cas3_swaps_{DATE_2.isoformat()}").set_value(SWAP_TEXT)
    app.button(key="cas3_run_pipeline").click().run()

    assert not app.exception
    assert not app.error
    report = app.session_state[pipeline_ui.REPORT_KEY]
    assert report["target"]["issuer"] == "Acme Corp"
    for iso_date in (DATE_1.isoformat(), DATE_2.isoformat()):
        assert report["dates"][iso_date]["result"] is not None
        assert report["dates"][iso_date]["result"]["weighted_z_spread_bps"] > 0


def test_pipeline_page_rejects_non_eur_currency(monkeypatch):
    import pipeline_ui

    monkeypatch.setattr(
        pipeline_ui, "list_market_observations", lambda: [_observation("XS1", DATE_1)]
    )
    monkeypatch.setattr(
        pipeline_ui, "list_swap_curves", lambda: {DATE_1: _swap_points()}
    )

    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=30).run()
    app.switch_page("pages/pipeline_cas3.py").run()

    app.date_input(key="cas3_obs_date_1").set_value(DATE_1)
    app.date_input(key="cas3_obs_date_2").set_value(DATE_2)
    app.text_input(key="cas3_target_currency").set_value("USD")
    app.button(key="cas3_run_pipeline").click().run()

    assert not app.exception
    assert app.error
    assert pipeline_ui.REPORT_KEY not in app.session_state
