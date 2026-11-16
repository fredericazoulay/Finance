from pathlib import Path

from streamlit.testing.v1 import AppTest


def test_streamlit_app_starts_without_errors():
    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path)).run(timeout=15)

    assert not app.exception


def test_valuation_form_calculates_and_saves(tmp_path, monkeypatch):
    import valuation_ui

    monkeypatch.setattr(valuation_ui, "DATABASE_PATH", tmp_path / "valuations.sqlite3")
    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=20).run()
    app.text_input(key="valuation_issuer").set_value("Exemple")
    app.text_input(key="valuation_curve_source").set_value("Courbe de test")
    app.text_input(key="field_cusip").set_value("123456789")
    app.number_input(key="field_prix_remboursement").set_value(105.0)
    app.session_state["valuation_panel"] = {
        "edited_rows": {
            0: {
                "Obligation / ISIN": "Titre A",
                "Z-spread (pb)": 125.0,
                "Similarité (%)": 80.0,
                "Source": "Source A",
            }
        },
        "added_rows": [],
        "deleted_rows": [],
    }
    app.session_state["valuation_curve"] = {
        "edited_rows": {
            0: {"Taux zéro (%)": 2.0},
            1: {"Taux zéro (%)": 2.5},
            2: {"Taux zéro (%)": 3.0},
        },
        "added_rows": [],
        "deleted_rows": [],
    }
    app.button(key="FormSubmitter:valuation_workflow-Calculer et enregistrer").click().run()

    assert not app.exception
    assert not app.error
    assert (tmp_path / "valuations.sqlite3").exists()
    assert any(item.label == "Z-spread théorique" and "125.00" in item.value for item in app.metric)
    saved = valuation_ui.list_reports(tmp_path / "valuations.sqlite3")[0]["report"]["obligation"]
    assert saved["cusip"] == "123456789"
    assert saved["prix_remboursement"] == 105

    app.text_input(key="field_type_conversion").set_value("convertible")
    app.button(key="FormSubmitter:valuation_workflow-Calculer et enregistrer").click().run()
    assert any("type_conversion" in item.value for item in app.error)
    assert not any(item.label == "Z-spread théorique" for item in app.metric)
    assert len(valuation_ui.list_reports(tmp_path / "valuations.sqlite3")) == 1


def test_streamlit_can_save_unsupported_instrument_as_draft(tmp_path, monkeypatch):
    import valuation_ui

    monkeypatch.setattr(valuation_ui, "DATABASE_PATH", tmp_path / "valuations.sqlite3")
    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=20).run()
    app.text_input(key="valuation_issuer").set_value("Exemple")
    app.text_input(key="field_type_conversion").set_value("convertible")
    app.button(key="FormSubmitter:valuation_workflow-Enregistrer la fiche seule").click().run()

    assert not app.exception
    assert not app.error
    assert valuation_ui.list_obligations(tmp_path / "valuations.sqlite3")[0]["obligation"][
        "type_conversion"
    ] == "convertible"
