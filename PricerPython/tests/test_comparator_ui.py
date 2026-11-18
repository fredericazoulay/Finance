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


def _label(isin: str, issuer: str, rating: str) -> str:
    return f"{isin} · {issuer} · {rating}"


def _patch(monkeypatch, module):
    observations = [
        _observation("XS1000000001", "Issuer A", "BBB", 4.5),
        _observation("XS1000000002", "Issuer B", "BBB", 4.7),
        _observation("XS1000000003", "Issuer C", "BB+", 6.0),
    ]
    monkeypatch.setattr(module, "list_market_observations", lambda: observations)
    monkeypatch.setattr(module, "list_swap_curves", lambda: {MARKET_DATE: _swaps()})
    return observations


def test_comparator_page_builds_matrix_and_shock(monkeypatch):
    import comparator_ui

    observations = _patch(monkeypatch, comparator_ui)

    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=30).run()
    app.switch_page("pages/comparateur.py").run()

    labels = [
        _label("XS1000000001", "Issuer A", "BBB"),
        _label("XS1000000002", "Issuer B", "BBB"),
    ]
    app.multiselect(key="comparator_selected").set_value(labels).run()

    assert not app.exception
    assert not app.error
    report = app.session_state[comparator_ui.MATRIX_KEY]
    assert set(report["bonds"]) == set(labels)
    matrix = report["matrix"]["Rendements & spreads"]
    assert matrix["Z-Spread (bp)"][labels[0]] is not None
    assert matrix["YTM (%)"][labels[0]] == 4.5
    sensitivities = report["matrix"]["Sensibilités aux taux"]
    assert sensitivities["Duration modifiée (ans)"][labels[0]] > 0
    assert list(app.dataframe[0].value.columns) == labels
    app.multiselect(key="comparator_selected").set_value(labels[::-1]).run()
    assert list(app.dataframe[0].value.columns) == labels[::-1]

    app.slider(key="comparator_shock_bps").set_value(100).run()

    assert not app.exception
    shock_rows = app.session_state[comparator_ui.SHOCK_KEY]
    assert len(shock_rows) == 2
    assert all(row["ΔP/P (%)"] < 0 for row in shock_rows)
    assert all(row["Impact (montant)"] < 0 for row in shock_rows)


def test_comparator_page_requires_two_bonds(monkeypatch):
    import comparator_ui

    _patch(monkeypatch, comparator_ui)

    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=30).run()
    app.switch_page("pages/comparateur.py").run()

    app.multiselect(key="comparator_selected").set_value(
        [_label("XS1000000001", "Issuer A", "BBB")]
    ).run()

    assert not app.exception
    assert comparator_ui.MATRIX_KEY not in app.session_state
    assert any("au moins 2" in str(info.value) for info in app.info)


def test_comparator_keeps_expired_bonds_in_matrix_without_calculated_metrics(monkeypatch):
    import comparator_ui

    observations = _patch(monkeypatch, comparator_ui)
    for observation in observations[:2]:
        observation["maturity_date"] = date(2020, 1, 1)

    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=30).run()
    app.switch_page("pages/comparateur.py").run()
    labels = [
        _label("XS1000000001", "Issuer A", "BBB"),
        _label("XS1000000002", "Issuer B", "BBB"),
    ]
    app.multiselect(key="comparator_selected").set_value(labels).run()

    assert not app.exception
    assert list(app.dataframe[0].value.columns) == labels
    assert app.dataframe[0].value.loc["Échéance", labels[0]] == "2020-01-01"
    report = app.session_state[comparator_ui.MATRIX_KEY]
    assert report["matrix"]["Identification & structure"]["Émetteur"][labels[0]] == "Issuer A"
    assert report["matrix"]["Rendements & spreads"]["Z-Spread (bp)"][labels[0]] is None
    assert any("titres échus" in str(item.value) for item in app.warning)
    assert not app.session_state[comparator_ui.SHOCK_KEY]


def test_non_eur_bond_does_not_use_eur_curve(monkeypatch):
    import comparator_ui

    observation = _observation("XS1000000001", "Issuer A", "BBB", 4.5)
    observation["currency"] = "USD"
    zero_fn, par_fn, _ = comparator_ui._curves()
    metrics = comparator_ui._metrics_for(observation, zero_fn, par_fn)

    assert metrics is not None
    assert metrics["ytm"] == 0.045
    assert metrics["z_spread_bps"] is None
    assert metrics["g_spread_bps"] is None
    assert metrics["i_spread_bps"] is None


def test_comparator_only_calculates_selected_bonds_and_possible_peers(monkeypatch):
    import comparator_ui

    observations = _patch(monkeypatch, comparator_ui)
    observations[2]["rating"] = "A"
    distant = _observation("XS1000000004", "Distant", "BBB", 4.5)
    distant["maturity_date"] = date(2050, 1, 1)
    observations.append(distant)
    calculate = comparator_ui._metrics_for
    calculated = []

    def track(obs, zero_fn, par_fn):
        calculated.append(obs["isin"])
        return calculate(obs, zero_fn, par_fn)

    monkeypatch.setattr(comparator_ui, "_metrics_for", track)
    zero_fn, par_fn, _ = comparator_ui._curves()
    comparator_ui.build_matrix(observations[:2], observations, zero_fn, par_fn)

    assert calculated == ["XS1000000001", "XS1000000002"]
