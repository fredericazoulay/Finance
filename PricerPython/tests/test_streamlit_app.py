from pathlib import Path

from streamlit.testing.v1 import AppTest


def test_streamlit_app_starts_without_errors():
    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path)).run(timeout=15)

    assert not app.exception


def test_topbar_language_environment_and_theme_controls():
    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=20).run()

    assert any(
        "Hackathon GDA 2026 JARVIS - Team PricerExMachina" in str(item.value)
        for item in app.caption
    )
    assert app.selectbox(key="app_group").value == "BO_CASH"
    app.selectbox(key="app_group").set_value("BO_ANALYSE").run()
    assert not app.exception
    assert app.selectbox(key="app_group").value == "BO_ANALYSE"
    app.selectbox(key="app_environment").set_value("PROD").run()
    app.selectbox(key="app_language").set_value("EN").run()
    assert not app.exception
    assert app.selectbox(key="app_environment").value == "PROD"
    assert any(
        item.value == "Valuation using comparables and a zero curve"
        for item in app.subheader
    )

    app.selectbox(key="app_theme").set_value("dark").run()
    assert not app.exception
    assert app.selectbox(key="app_theme").value == "dark"
    assert any("#07141d" in str(item.value) for item in app.html)


def test_legacy_theme_label_is_migrated():
    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=20)
    app.session_state["app_theme"] = "Clair"
    app.run()

    assert not app.exception
    assert app.selectbox(key="app_theme").value == "light"
    assert any("#f6f8fa" in str(item.value) for item in app.html)


def test_angular_themes_are_available_and_applied():
    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=20).run()

    theme_selector = app.selectbox(key="app_theme")
    assert not app.exception
    assert {"RAINBOW", "NEON", "POP", "BLOOMBERG"} <= set(theme_selector.options)
    assert {
        "COMPAGNY CDC INFORMATIQUE",
        "MARVEL IRONMAN",
        "DC-COMICS BATMAN",
    } <= set(theme_selector.options)

    theme_selector.set_value("neon").run()
    assert not app.exception
    assert any("#0a1820" in str(item.value) for item in app.html)
    assert any("#40efdd" in str(item.value) for item in app.html)

    app.selectbox(key="app_theme").set_value("compagny_cdc_informatique").run()
    assert not app.exception
    assert any("#57b78c" in str(item.value) for item in app.html)
    assert app.session_state["app_theme_palette"]["primary"] == "#57b78c"


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


def test_manual_valuation_judge_and_audit_require_explicit_consent(
    tmp_path, monkeypatch
):
    import valuation_ui

    monkeypatch.setattr(valuation_ui, "DATABASE_PATH", tmp_path / "valuations.sqlite3")
    judge_calls = []
    sent_reports = []
    review = {
        "verdict": "challenge",
        "summary": "Vérifier la source des comparables.",
        "critical_findings": [],
        "other_findings": ["Données non vérifiées."],
        "challenge_questions": ["Quelle est la source de marché ?"],
    }
    monkeypatch.setattr(
        valuation_ui,
        "audit_recipient_from_environment",
        lambda: "audit-team@example.test",
    )
    monkeypatch.setattr(
        valuation_ui,
        "challenge_valuation_report",
        lambda report: judge_calls.append(report) or review,
    )
    monkeypatch.setattr(
        valuation_ui, "smtp_settings_from_environment", lambda: object()
    )
    monkeypatch.setattr(
        valuation_ui,
        "send_audit_email",
        lambda report, settings: sent_reports.append(report),
    )

    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=20).run()
    app.text_input(key="valuation_issuer").set_value("Exemple")
    app.text_input(key="valuation_curve_source").set_value("Courbe de test")
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
    assert judge_calls == []
    assert sent_reports == []
    assert (
        app.checkbox(key="valuation_audit_email_consent").label
        == "Je confirme l'envoi du rapport à audit-team@example.test."
    )

    app.checkbox(key="valuation_mistral_consent").check().run()
    app.button(key="valuation_run_judge").click().run()

    assert not app.exception
    assert len(judge_calls) == 1
    assert app.session_state["latest_valuation_judge"] == review
    assert (
        app.session_state["latest_valuation_judge_report_id"]
        == app.session_state["latest_valuation_id"]
    )

    app.checkbox(key="valuation_audit_email_consent").check().run()
    app.button(key="valuation_send_audit").click().run()

    assert not app.exception
    assert len(sent_reports) == 1
    assert sent_reports[0]["judge_review"] == review


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


def test_streamlit_searches_postgres_catalogue(monkeypatch):
    from database import OBLIGATION_COLUMNS
    import valuation_ui

    searches = []
    rendered_tables = []
    render_dataframe = valuation_ui.st.dataframe
    obligation = {column: None for column in OBLIGATION_COLUMNS}
    obligation.update(
        {
            "isin": "XS1000000002",
            "emetteur": "Issuer 1",
            "type_obl": "Fixed",
            "famille": "Government",
            "sousfamille": "Subordinated",
            "secteur": "Sovereign",
            "devise": "EUR",
        }
    )
    second_obligation = {
        **obligation,
        "isin": "XS1000000003",
        "famille": "Corporate",
        "devise": "USD",
    }
    monkeypatch.setattr(
        valuation_ui,
        "search_obligations",
        lambda search, limit: searches.append((search, limit))
        or [obligation, second_obligation],
    )

    def capture_dataframe(dataframe, **kwargs):
        rendered_tables.append(dataframe)
        return render_dataframe(dataframe, **kwargs)

    monkeypatch.setattr(
        valuation_ui.st,
        "dataframe",
        capture_dataframe,
    )
    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=20).run()
    app.selectbox(key="app_theme").set_value("neon").run()
    app.switch_page("pages/catalogue.py").run()
    app.text_input(key="obligation_catalogue_search").set_value("XS1000000002")
    app.button(
        key="FormSubmitter:obligation_catalogue_form-Rechercher"
    ).click().run()

    assert not app.exception
    assert not app.error
    assert searches == [("XS1000000002", 100)]
    assert any(
        f"Les {len(OBLIGATION_COLUMNS)} colonnes" in item.value
        for item in app.caption
    )
    assert any("2 groupes · 2 lignes" == item.value for item in app.caption)
    assert [item.label for item in app.expander] == [
        "Devise : EUR · 1 ligne",
        "Devise : USD · 1 ligne",
    ]
    assert len(app.dataframe) == 1

    app.button(key="obligation_catalogue_expand_all").click().run()
    assert not app.exception
    assert len(app.dataframe) == 2
    app.button(key="obligation_catalogue_collapse_all").click().run()
    assert not app.exception
    assert len(app.dataframe) == 0

    app.multiselect(key="obligation_catalogue_group_columns").set_value(
        ["devise", "famille"]
    ).run()
    assert not app.exception
    assert [
        item.label for item in app.expander
    ] == [
        "Devise : EUR · Famille : Government · 1 ligne",
        "Devise : USD · Famille : Corporate · 1 ligne",
    ]

    app.button(key="obligation_catalogue_clear_grouping").click().run()
    assert not app.exception
    assert app.session_state["obligation_catalogue_group_columns"] == []
    assert any(
        "Aucun regroupement · 2 lignes" == item.value
        for item in app.caption
    )
    assert len(app.dataframe) == 1

    app.toggle(key="obligation_catalogue_alternate").set_value(True).run()
    assert not app.exception
    assert app.session_state["obligation_catalogue_alternate"]
    table_html = rendered_tables[-1].to_html()
    assert "#10252d" in table_html
    assert "#15323a" in table_html


def test_catalogue_exports_all_rows_to_xlsx(monkeypatch):
    from database import OBLIGATION_COLUMNS
    from openpyxl import load_workbook
    from io import BytesIO
    import valuation_ui

    obligations = [
        {column: f"{column}-{row}" for column in OBLIGATION_COLUMNS}
        for row in range(1000)
    ]
    monkeypatch.setattr(
        valuation_ui, "list_all_catalogue_obligations", lambda: obligations
    )
    app_path = Path(__file__).parents[1] / "streamlit_app.py"
    app = AppTest.from_file(str(app_path), default_timeout=20).run()
    app.switch_page("pages/catalogue.py").run()
    app.button(key="obligation_catalogue_prepare_xlsx").click().run()

    assert not app.exception
    assert not app.error
    export = app.session_state["obligation_catalogue_xlsx"]
    worksheet = load_workbook(BytesIO(export["data"]), read_only=True).active
    assert export["count"] == 1000
    assert worksheet.max_row == 1001
    assert worksheet.max_column == len(OBLIGATION_COLUMNS)
    assert worksheet["A1"].value == "ISIN"
    assert worksheet["X1"].value == "LEI"
