from datetime import date
from pathlib import Path

from streamlit.testing.v1 import AppTest

from curve import SwapPoint

MARKET_DATE = date(2026, 10, 26)


def _observation(isin: str, issuer: str, rating: str, ytm: float) -> dict:
    return {
        "isin": isin,
        "issuer": issuer,
        "issuer_type": "Corporate",
        "bond_type": "Fixed",
        "currency": "EUR",
        "maturity_date": date(2031, 10, 15),
        "coupon_type": "Fixed",
        "coupon_rate_pct": 4.0,
        "day_count": "ACT/ACT",
        "payment_frequency": 2,
        "seniority": "Senior",
        "rating": rating,
        "yield_to_maturity_pct": ytm,
        "clean_price": None,
        "spread_bps": None,
        "market_date": MARKET_DATE,
        "source_name": "Euronext_Bonds_2026-10-27.csv",
        "data_status": "official",
        "is_green_bond": False,
    }


def _swaps() -> list[SwapPoint]:
    return [
        SwapPoint(0.5, 0.02), SwapPoint(1.0, 0.022), SwapPoint(2.0, 0.025),
        SwapPoint(3.0, 0.028), SwapPoint(5.0, 0.032), SwapPoint(7.0, 0.035),
        SwapPoint(10.0, 0.038),
    ]


def test_terminal_page_filters_and_shows_yas(monkeypatch):
    import comparator_ui
    import terminal_ui

    observations = [
        _observation("XS1000000001", "Issuer A", "BBB", 4.5),
        _observation("XS1000000002", "Issuer B", "BBB", 4.7),
        _observation("XS1000000003", "Issuer C", "BB+", 6.0),
    ]
    monkeypatch.setattr(terminal_ui, "list_market_observations", lambda: observations)
    monkeypatch.setattr(comparator_ui, "list_swap_curves", lambda: {MARKET_DATE: _swaps()})

    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=30).run()
    app.switch_page("pages/terminal_marche.py").run()

    assert not app.exception
    assert len(app.session_state[terminal_ui.FILTERED_KEY]) == 3

    app.text_input(key="terminal_search").set_value("Issuer A").run()
    assert len(app.session_state[terminal_ui.FILTERED_KEY]) == 1

    app.selectbox(key="terminal_selected").set_value("XS1000000001 · Issuer A · BBB").run()
    app.session_state["terminal_screen"] = "YAS"
    app.run()

    assert not app.exception
    assert not app.error
    state = app.session_state[terminal_ui.METRICS_KEY]
    assert state["isin"] == "XS1000000001"
    assert state["metrics"]["ytm"] == 4.5 / 100
    assert state["metrics"]["z_spread_bps"] is not None
    assert state["metrics"]["modified_duration"] > 0
    assert state["rv"]["peer_count"] == 0
    app.session_state["terminal_screen"] = "Graphique"
    app.run()
    chart = app.session_state[terminal_ui.CHART_KEY]
    assert not chart.empty
    assert {"years", "z_spread_bps", "rating_bucket"}.issubset(chart.columns)
    app.session_state["terminal_screen"] = "SECF"
    app.run()
    assert app.text_input(key="terminal_search").value == "Issuer A"
    assert len(app.session_state[terminal_ui.FILTERED_KEY]) == 1


def test_terminal_page_rating_filter(monkeypatch):
    import comparator_ui
    import terminal_ui

    observations = [
        _observation("XS1000000001", "Issuer A", "BBB", 4.5),
        _observation("XS1000000003", "Issuer C", "BB+", 6.0),
    ]
    monkeypatch.setattr(terminal_ui, "list_market_observations", lambda: observations)
    monkeypatch.setattr(comparator_ui, "list_swap_curves", lambda: {MARKET_DATE: _swaps()})

    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=30).run()
    app.switch_page("pages/terminal_marche.py").run()

    app.selectbox(key="terminal_rating").set_value("BB+").run()

    assert not app.exception
    filtered = app.session_state[terminal_ui.FILTERED_KEY]
    assert [obs["isin"] for obs in filtered] == ["XS1000000003"]


def test_terminal_tabs_keep_description_and_chart_for_matured_selection(monkeypatch):
    import comparator_ui
    import terminal_ui

    expired = _observation("XS1000000001", "Issuer A", "BBB", 4.5)
    expired["maturity_date"] = date(2020, 1, 1)
    active = _observation("XS1000000002", "Issuer B", "BBB", 4.7)
    monkeypatch.setattr(terminal_ui, "list_market_observations", lambda: [expired, active])
    monkeypatch.setattr(comparator_ui, "list_swap_curves", lambda: {MARKET_DATE: _swaps()})

    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=30).run()
    app.switch_page("pages/terminal_marche.py").run()
    assert [tab.label for tab in app.tabs] == ["SECF", "DES", "YAS", "Graphique"]

    app.session_state["terminal_screen"] = "DES"
    app.run()
    assert not app.exception
    assert any("Issuer A" in str(item.value) for item in app.caption)

    app.session_state["terminal_screen"] = "YAS"
    app.run()
    assert any("titre échu" in str(item.value) for item in app.warning)

    app.session_state["terminal_screen"] = "Graphique"
    app.run()
    assert not app.exception
    assert len(app.session_state[terminal_ui.CHART_KEY]) == 1
