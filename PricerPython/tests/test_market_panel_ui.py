from datetime import date, timedelta
from pathlib import Path

from streamlit.testing.v1 import AppTest


def test_automatic_panel_page_displays_explanations_and_data_gates(monkeypatch):
    import market_panel_ui

    observation = {
        "observation_id": 1,
        "isin": "XS1000000002",
        "issuer": "Issuer A",
        "issuer_type": "Corporate",
        "bond_type": "Fixed",
        "currency": "EUR",
        "issue_date": date(2020, 1, 1),
        "maturity_date": date.today() + timedelta(days=365 * 8),
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
        "spread_bps": 120,
        "esg_score": 50,
        "provider_claim": "Bloomberg",
        "reference_rate": "ESTR",
        "market_date": None,
        "source_name": "demo.csv",
        "data_status": "synthetic_demo",
    }
    monkeypatch.setattr(
        market_panel_ui, "list_market_observations", lambda: [observation]
    )
    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=20).run()
    app.switch_page("pages/panel_automatique.py").run()
    app.text_input(key="market_panel_target_issuer").set_value("New issuer")
    app.text_input(key="market_panel_target_sector").set_value("Corporate")
    app.text_input(key="market_panel_target_rating").set_value("BBB")
    app.text_input(key="market_panel_target_seniority").set_value("Senior")
    app.number_input(key="market_panel_target_coupon_rate").set_value(4.0)
    app.button(key="find_market_comparables").click().run()

    assert not app.exception
    assert not app.error
    report = app.session_state[market_panel_ui.REPORT_KEY]
    assert report["production_valuation_allowed"] is False
    assert all(
        result["selected"][0]["similarity_score"] == 100
        for result in report["date_reports"].values()
    )
    assert all(
        "spread source (proxy synthétique, pas un Z-spread)"
        == result["spread_label"]
        for result in report["date_reports"].values()
    )

