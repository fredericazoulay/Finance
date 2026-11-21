from datetime import date
from pathlib import Path

from streamlit.testing.v1 import AppTest

from curve import CurveNode, zero_rate_function

MARKET_DATE = date(2026, 11, 20)


def _observation(isin: str, currency: str, issuer: str, ytm: float) -> dict:
    return {
        "observation_id": isin,
        "isin": isin,
        "issuer": issuer,
        "issuer_type": "Corporate",
        "bond_type": "Fixed",
        "currency": currency,
        "maturity_date": date(2031, 11, 20),
        "coupon_type": "Fixed",
        "coupon_rate_pct": 4.0,
        "day_count": "ACT/365",
        "payment_frequency": 2,
        "is_callable": False,
        "is_putable": False,
        "is_convertible": False,
        "is_perpetual": False,
        "is_inflation_linked": False,
        "seniority": "Senior",
        "rating": "BBB",
        "yield_to_maturity_pct": ytm,
        "clean_price": 98.5,
        "spread_bps": 125,
        "esg_score": 72,
        "market_date": MARKET_DATE,
        "source_name": "licensed-feed.csv",
        "data_status": "official",
    }


def test_family_distribution_includes_unmatched_bonds_as_percentage():
    import graphs_ui

    observations = [
        _observation("XS1000000001", "EUR", "Issuer A", 4.5),
        _observation("XS1000000002", "USD", "Issuer B", 5.2),
    ]
    frame = graphs_ui._panel_frame(
        observations,
        {"XS1000000001": "Corporate"},
    )

    shares = graphs_ui._share_frame(frame, "family")

    assert shares.set_index("category")["bond_count"].to_dict() == {
        "Corporate": 1,
        "Non renseignée": 1,
    }
    assert shares.set_index("category")["share"].to_dict() == {
        "Corporate": 0.5,
        "Non renseignée": 0.5,
    }


def test_graphs_page_filters_panel_and_shows_bond_analytics(monkeypatch):
    import graphs_ui

    observations = [
        _observation("XS1000000001", "EUR", "Issuer A", 4.5),
        _observation("XS1000000002", "USD", "Issuer B", 5.2),
    ]
    monkeypatch.setattr(
        graphs_ui,
        "list_market_observations",
        lambda *, limit=5000: observations,
    )
    monkeypatch.setattr(
        graphs_ui,
        "_curves",
        lambda: (
            zero_rate_function([CurveNode(1, 0.02), CurveNode(10, 0.035)]),
            lambda years: 0.025,
            MARKET_DATE.isoformat(),
        ),
    )
    monkeypatch.setattr(
        graphs_ui,
        "_load_family_by_isin",
        lambda: {
            "XS1000000001": "Corporate",
            "XS1000000002": "Government",
        },
    )
    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=30).run()
    app.switch_page("pages/graphiques.py").run()

    assert not app.exception
    assert app.title[0].value == "Graphiques obligataires"
    metrics = {metric.label: metric.value for metric in app.metric}
    assert metrics["Obligations filtrées"] == "2"
    assert len(app.get("vega_lite_chart")) >= 8

    app.selectbox(key="graphs_currency").select("EUR").run()

    assert not app.exception
    metrics = {metric.label: metric.value for metric in app.metric}
    assert metrics["Obligations filtrées"] == "1"
    assert next(metric.value for metric in app.metric if metric.label == "Z-Spread (pb)") != "—"

    app.text_input(key="graphs_search").set_value("no matching bond").run()

    assert not app.exception
    metrics = {metric.label: metric.value for metric in app.metric}
    assert metrics["Obligations filtrées"] == "0"
