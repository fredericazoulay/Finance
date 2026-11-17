"""Parcours Streamlit de valorisation et historique local."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import replace
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd
import psycopg
import streamlit as st

from database import (
    OBLIGATION_COLUMNS,
    DatabaseConfigurationError,
    list_all_obligations as list_all_catalogue_obligations,
    search_obligations,
)
from localization import current_language, error_text, obligation_column_label, text
from pricing import DAY_COUNT_CONVENTIONS
from valuation import (
    Comparable,
    CurveNode,
    ObligationDetails,
    ValuationRequest,
    list_obligations,
    list_reports,
    report_json,
    save_obligation,
    save_report,
    value_bond,
)

DATABASE_PATH = Path(__file__).resolve().parent / "data" / "valuations.sqlite3"
SPREAD_COLUMN = "Z-spread (pb)"
SIMILARITY_COLUMN = "Similarité (%)"
MATURITY_COLUMN = "Maturité (années)"
ZERO_RATE_COLUMN = "Taux zéro (%)"
JSON_MIME = "application/json"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
OBLIGATION_CATALOGUE_RESULTS_KEY = "obligation_catalogue_results"
OBLIGATION_CATALOGUE_GROUP_COLUMNS_KEY = "obligation_catalogue_group_columns"
OBLIGATION_CATALOGUE_GROUP_KEYS_KEY = "obligation_catalogue_group_keys"


def _set_catalogue_groups_expanded(expanded: bool) -> None:
    for key in st.session_state.get(OBLIGATION_CATALOGUE_GROUP_KEYS_KEY, []):
        st.session_state[key] = expanded


def _clear_catalogue_grouping() -> None:
    st.session_state[OBLIGATION_CATALOGUE_GROUP_COLUMNS_KEY] = []
    _set_catalogue_groups_expanded(False)


def _obligation_display_frame(obligations: pd.DataFrame) -> pd.DataFrame:
    return obligations.rename(
        columns={
            column: obligation_column_label(column)
            for column in OBLIGATION_COLUMNS
        }
    )


def _render_obligation_table(
    obligations: pd.DataFrame, *, key: str, alternate: bool
) -> None:
    display_frame = _obligation_display_frame(obligations)
    if alternate:
        colors = (
            ("#FFFFFF", "#EAF3F8")
            if st.session_state.get("app_theme", "light") == "light"
            else ("#1B2835", "#243748")
        )
        display_frame = display_frame.reset_index(drop=True).style.apply(
            lambda row: [
                f"background-color: {colors[row.name % 2]}"
                for _ in row
            ],
            axis=1,
        )
    st.dataframe(
        display_frame,
        hide_index=True,
        alt=text(
            "Résultats de la recherche dans le catalogue PostgreSQL",
            "Search results from the PostgreSQL catalogue",
        ),
        key=key,
    )


def _render_grouped_obligation_table(
    obligations: pd.DataFrame, group_columns: list[str], *, alternate: bool
) -> None:
    if not group_columns:
        st.session_state[OBLIGATION_CATALOGUE_GROUP_KEYS_KEY] = []
        _render_obligation_table(
            obligations,
            key="obligation_catalogue_table",
            alternate=alternate,
        )
        return

    grouping_key = "_".join(group_columns)
    group_keys = []
    groups = obligations.groupby(group_columns, dropna=False, sort=False)
    for group_index, (values, group) in enumerate(groups):
        group_values = values if isinstance(values, tuple) else (values,)
        group_label = " · ".join(
            f"{obligation_column_label(column)} : "
            f"{text('Non renseigné', 'Not specified') if pd.isna(value) else value}"
            for column, value in zip(group_columns, group_values)
        )
        row_word = text("ligne", "row") if len(group) == 1 else text("lignes", "rows")
        expander_key = (
            f"obligation_catalogue_group_{grouping_key}_{group_index}"
        )
        group_keys.append(expander_key)
        expanded = bool(st.session_state.get(expander_key, group_index == 0))
        expander = st.expander(
            f"{group_label} · {len(group)} {row_word}",
            expanded=expanded,
            key=expander_key,
            on_change="rerun",
        )
        with expander:
            if expander.open:
                _render_obligation_table(
                    group,
                    key=f"obligation_catalogue_table_{grouping_key}_{group_index}",
                    alternate=alternate,
                )
    st.session_state[OBLIGATION_CATALOGUE_GROUP_KEYS_KEY] = group_keys


def _build_obligations_xlsx(obligations: list[dict[str, Any]]) -> bytes:
    dataframe = pd.DataFrame(obligations, columns=OBLIGATION_COLUMNS)
    output = BytesIO()
    _obligation_display_frame(dataframe).to_excel(
        output,
        index=False,
        sheet_name="Obligations",
        engine="openpyxl",
    )
    return output.getvalue()


def _render_obligation_export() -> None:
    export_column, download_column = st.columns([1.4, 2], vertical_alignment="center")
    with export_column:
        if st.button(
            text("Préparer l’export Excel", "Prepare Excel export"),
            key="obligation_catalogue_prepare_xlsx",
            help=text(
                "Exporte toutes les obligations de la base et leurs 24 colonnes.",
                "Exports all bonds in the database with all 24 columns.",
            ),
        ):
            st.session_state.pop("obligation_catalogue_xlsx", None)
            try:
                obligations = list_all_catalogue_obligations()
                workbook = _build_obligations_xlsx(obligations)
            except DatabaseConfigurationError as exc:
                st.error(
                    text(
                        f"Configuration PostgreSQL invalide : {exc}",
                        f"Invalid PostgreSQL configuration: {exc}",
                    )
                )
                return
            except psycopg.Error as exc:
                st.error(
                    text(
                        f"Connexion PostgreSQL impossible : {exc}",
                        f"Unable to connect to PostgreSQL: {exc}",
                    )
                )
                return
            st.session_state["obligation_catalogue_xlsx"] = {
                "data": workbook,
                "count": len(obligations),
                "language": current_language(),
            }

    with download_column:
        export = st.session_state.get("obligation_catalogue_xlsx")
        if export and export["language"] == current_language():
            row_word = (
                text("obligation", "bond")
                if export["count"] == 1
                else text("obligations", "bonds")
            )
            st.download_button(
                text("Télécharger le fichier .xlsx", "Download .xlsx file"),
                data=export["data"],
                file_name=f"obligations_{date.today().isoformat()}.xlsx",
                mime=XLSX_MIME,
                key="obligation_catalogue_download_xlsx",
                on_click="ignore",
                help=text(
                    f"{export['count']} {row_word} · 24 colonnes",
                    f"{export['count']} {row_word} · 24 columns",
                ),
            )
            st.caption(
                text(
                    f"{export['count']} {row_word} · 24 colonnes",
                    f"{export['count']} {row_word} · 24 columns",
                )
            )


def render_obligation_catalogue() -> None:
    st.subheader(text("Catalogue PostgreSQL", "PostgreSQL catalogue"))
    st.caption(
        text(
            "Recherche en lecture seule par ISIN, émetteur ou nom d'obligation.",
            "Read-only search by ISIN, issuer, or bond name.",
        )
    )
    with st.form("obligation_catalogue_form"):
        search = st.text_input(
            text("ISIN, émetteur ou obligation", "ISIN, issuer, or bond"),
            key="obligation_catalogue_search",
        )
        submitted = st.form_submit_button(text("Rechercher", "Search"))

    if submitted:
        st.session_state.pop(OBLIGATION_CATALOGUE_RESULTS_KEY, None)
        try:
            obligations = search_obligations(search, limit=100)
        except DatabaseConfigurationError as exc:
            st.error(
                text(
                    f"Configuration PostgreSQL invalide : {exc}",
                    f"Invalid PostgreSQL configuration: {exc}",
                )
            )
            return
        except psycopg.Error as exc:
            st.error(
                text(
                    f"Connexion PostgreSQL impossible : {exc}",
                    f"Unable to connect to PostgreSQL: {exc}",
                )
            )
            return
        st.session_state[OBLIGATION_CATALOGUE_RESULTS_KEY] = obligations

    _render_obligation_export()
    if OBLIGATION_CATALOGUE_RESULTS_KEY not in st.session_state:
        return

    obligations = st.session_state[OBLIGATION_CATALOGUE_RESULTS_KEY]

    if not obligations:
        st.info(text("Aucune obligation ne correspond à cette recherche.", "No bonds match this search."))
        return

    st.caption(
        text(
            f"{len(obligations)} obligation(s) affichée(s), au maximum 100. "
            f"Les {len(OBLIGATION_COLUMNS)} colonnes peuvent être masquées ou "
            "réaffichées depuis le menu Colonnes du tableau.",
            f"{len(obligations)} bond(s) shown, up to 100. All "
            f"{len(OBLIGATION_COLUMNS)} columns are available in the table's "
            "column visibility menu.",
        )
    )
    dataframe = pd.DataFrame(obligations, columns=OBLIGATION_COLUMNS)
    controls = st.columns(
        [4, 1.2, 1.2, 1.5, 1.2], vertical_alignment="bottom"
    )
    with controls[0]:
        language_code = current_language()
        group_columns = st.multiselect(
            text("Regrouper par", "Group by"),
            options=OBLIGATION_COLUMNS,
            default=["devise"],
            format_func=lambda column: obligation_column_label(
                column, language_code
            ),
            key=OBLIGATION_CATALOGUE_GROUP_COLUMNS_KEY,
            placeholder=text("Choisir les colonnes", "Choose columns"),
        )
    with controls[1]:
        alternate = st.toggle(
            "Alternate",
            key="obligation_catalogue_alternate",
            help=text(
                "Alterner la couleur des lignes du tableau.",
                "Alternate the table row colors.",
            ),
        )
    with controls[2]:
        st.button(
            text("Tout développer", "Expand all"),
            key="obligation_catalogue_expand_all",
            on_click=_set_catalogue_groups_expanded,
            args=(True,),
            disabled=not group_columns,
        )
    with controls[3]:
        st.button(
            text("Tout réduire", "Collapse all"),
            key="obligation_catalogue_collapse_all",
            on_click=_set_catalogue_groups_expanded,
            args=(False,),
            disabled=not group_columns,
        )
    with controls[4]:
        st.button(
            text("Effacer le regroupement", "Clear grouping"),
            key="obligation_catalogue_clear_grouping",
            on_click=_clear_catalogue_grouping,
            disabled=not group_columns,
        )

    if group_columns:
        group_count = dataframe[group_columns].drop_duplicates().shape[0]
        group_word = text("groupe", "group") if group_count == 1 else text("groupes", "groups")
        row_word = text("ligne", "row") if len(dataframe) == 1 else text("lignes", "rows")
        st.caption(f"{group_count} {group_word} · {len(dataframe)} {row_word}")
    else:
        row_word = text("ligne", "row") if len(dataframe) == 1 else text("lignes", "rows")
        st.caption(
            text(
                f"Aucun regroupement · {len(dataframe)} {row_word}",
                f"No grouping · {len(dataframe)} {row_word}",
            )
        )

    _render_grouped_obligation_table(
        dataframe,
        group_columns,
        alternate=alternate,
    )


def _number_or_none(value: object) -> float | None:
    if pd.isna(value):
        return None
    return float(value)


def _text(value: object) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def _parse_comparables(panel: pd.DataFrame) -> list[Comparable]:
    comparables = []
    for row in panel.to_dict("records"):
        name = _text(row["Obligation / ISIN"])
        spread = _number_or_none(row[SPREAD_COLUMN])
        similarity = _number_or_none(row[SIMILARITY_COLUMN])
        source = _text(row["Source"])
        reason = _text(row["Motif exclusion"])
        if not any((name, spread is not None, similarity is not None, source, reason)):
            continue
        comparables.append(
            Comparable(name, spread, similarity, bool(row["Retenu"]), reason, source)
        )
    return comparables


def _parse_curve(curve: pd.DataFrame) -> list[CurveNode]:
    nodes = []
    for row in curve.to_dict("records"):
        years = _number_or_none(row[MATURITY_COLUMN])
        rate = _number_or_none(row[ZERO_RATE_COLUMN])
        if years is None and rate is None:
            continue
        if years is None or rate is None:
            raise ValueError(
                "Chaque point de courbe doit avoir une maturité et un taux zéro."
            )
        nodes.append(CurveNode(years, rate / 100))
    return nodes


def _render_valuation_result(report: dict, report_id: int) -> None:
    result = report["result"]
    st.markdown(f"#### {text('Résultat', 'Result')}")
    a, b, c, d = st.columns(4)
    a.metric(
        text("Z-spread théorique", "Theoretical Z-spread"),
        f"{result['weighted_z_spread_bps']:.2f} pb",
    )
    b.metric(text("YTM implicite", "Implied YTM"), f"{result['implied_ytm'] * 100:.4f} %")
    c.metric(text("Prix clean", "Clean price"), f"{result['clean_price']:.4f}")
    d.metric(text("Prix dirty", "Dirty price"), f"{result['dirty_price']:.4f}")
    st.caption(
        text(
            f"Intérêts courus : {result['accrued_interest']:.4f} · "
            f"Z-spread maximal : {result['best_z_spread_name']} "
            f"({result['best_z_spread_bps']:.2f} pb). "
            "Le Z-spread maximal n'est pas nécessairement le meilleur YTM.",
            f"Accrued interest: {result['accrued_interest']:.4f} · "
            f"Highest Z-spread: {result['best_z_spread_name']} "
            f"({result['best_z_spread_bps']:.2f} bps). "
            "The highest Z-spread is not necessarily the best YTM.",
        )
    )
    if result["curve_extrapolated"]:
        st.warning(
            text(
                "Certains flux utilisent une extrapolation plate de la courbe.",
                "Some cash flows use a flat curve extrapolation.",
            )
        )
    with st.expander(text("Flux actualisés et méthodologie", "Discounted cash flows and methodology")):
        st.dataframe(
            pd.DataFrame(report["cashflows"]).rename(
                columns={
                    "payment_date": text("Date de paiement", "Payment date"),
                    "years_act_365": text("Années ACT/365", "ACT/365 years"),
                    "zero_rate": text("Taux zéro", "Zero rate"),
                    "discount_factor": text("Facteur d'actualisation", "Discount factor"),
                    "cashflow": text("Flux", "Cash flow"),
                    "present_value": text("Valeur actuelle", "Present value"),
                }
            ),
            hide_index=True,
        )
        for description in report["methodology"].values():
            st.write(error_text(description))
    st.download_button(
        text("Télécharger le rapport JSON", "Download JSON report"),
        data=report_json(report),
        file_name=f"valorisation_{report_id}.json",
        mime=JSON_MIME,
    )


def render_valuation() -> None:
    st.subheader(
        text(
            "Valorisation par comparables et courbe zéro",
            "Valuation using comparables and a zero curve",
        )
    )
    st.info(
        text(
            "Données saisies manuellement : vérifiez la date, la source et les caractéristiques "
            "de chaque comparable. Ce calcul est un prototype, non validé pour la production.",
            "Market data is entered manually: verify each comparable's date, source, and "
            "characteristics. This prototype is not validated for production.",
        )
    )
    st.caption(
        text(
            "La courbe doit contenir des taux zéro EUR dérivés de la courbe swap 6M, "
            "en capitalisation continue. Les Z-spreads doivent utiliser la même convention. "
            "Ne saisissez pas directement des taux swap au pair.",
            "The curve must contain EUR zero rates derived from the 6M swap curve, "
            "with continuous compounding. Z-spreads must use the same convention. "
            "Do not enter par swap rates directly.",
        )
    )
    st.caption(
        text(
            "Ce parcours est limité aux obligations à taux fixe libellées en EUR.",
            "This workflow supports only fixed-rate bonds denominated in EUR.",
        )
    )
    today = date.today()
    panel = pd.DataFrame(
        {
            "Retenu": [True, True, False],
            "Obligation / ISIN": ["", "", ""],
            SPREAD_COLUMN: [None, None, None],
            SIMILARITY_COLUMN: [None, None, None],
            "Source": ["", "", ""],
            "Motif exclusion": ["", "", ""],
        }
    )
    curve = pd.DataFrame({MATURITY_COLUMN: [1.0, 5.0, 10.0], ZERO_RATE_COLUMN: [None, None, None]})

    with st.form("valuation_workflow"):
        st.markdown(f"#### {text('1 · Instrument et dates', '1 · Bond and dates')}")
        left, right = st.columns(2)
        with left:
            issuer = st.text_input(
                text("Émetteur *", "Issuer *"), key="valuation_issuer"
            )
            isin = st.text_input("ISIN", key="valuation_isin")
            sector = st.text_input(
                text("Secteur", "Sector"), key="valuation_sector"
            )
            currency = st.text_input(
                text("Devise", "Currency"), value="EUR", key="valuation_currency"
            )
            rating = st.text_input(
                text("Notation", "Rating"), key="valuation_rating"
            )
            seniority = st.text_input(
                text("Séniorité", "Seniority"), key="valuation_seniority"
            )
        with right:
            observation = st.date_input(
                text("Date d'observation du marché *", "Market observation date *"),
                today,
            )
            settlement = st.date_input(
                text("Date de règlement *", "Settlement date *"),
                today,
                key="valuation_settlement",
            )
            maturity = st.date_input(
                text("Date d'échéance *", "Maturity date *"),
                today + timedelta(days=365 * 8),
                min_value=date(1900, 1, 1), max_value=date(2200, 12, 31),
                key="valuation_maturity",
            )
            coupon = st.number_input(
                text("Coupon annuel (%) *", "Annual coupon (%) *"),
                min_value=0.0,
                value=3.75,
                step=0.05,
                key="valuation_coupon",
            )
            nominal = st.number_input(
                text("Nominal *", "Nominal *"),
                min_value=0.01,
                value=100.0,
                key="valuation_nominal",
            )
        language_code = current_language()
        frequency = st.selectbox(
            text("Coupons par an", "Coupons per year"),
            (1, 2, 4, 12),
            index=1,
            key="valuation_frequency",
            format_func=lambda value: {
                1: text("Annuelle", "Annual", language_code),
                2: text("Semestrielle", "Semiannual", language_code),
                4: text("Trimestrielle", "Quarterly", language_code),
                12: text("Mensuelle", "Monthly", language_code),
            }[value],
        )
        day_count = st.selectbox(
            text("Convention d'intérêts courus", "Accrued-interest convention"),
            DAY_COUNT_CONVENTIONS,
            format_func=lambda value: value.value,
            key="valuation_day_count",
        )

        with st.expander(
            text("Fiche obligation : champs complémentaires", "Bond record: additional fields")
        ):
            st.caption(
                text(
                    "Ces champs sont conservés dans le rapport ou la fiche. "
                    "Les champs liés aux conventions et aux structures sont contrôlés ; "
                    "vous pouvez toutefois enregistrer la fiche seule.",
                    "These fields are saved in the report or bond record. Convention and "
                    "structure fields are validated, but you can still save the record "
                    "without valuing it.",
                )
            )
            a, b = st.columns(2)
            with a:
                produit = st.text_input(
                    obligation_column_label("produit"), key="field_produit"
                )
                type_obl = st.text_input(
                    obligation_column_label("type_obl"),
                    key="field_type_obl",
                    help=text(
                        "Taux fixe simple uniquement pour le calcul.",
                        "Plain fixed-rate bonds only for valuation.",
                    ),
                )
                cusip = st.text_input(
                    obligation_column_label("cusip"), key="field_cusip"
                )
                obligation = st.text_input(
                    obligation_column_label("obligation"), key="field_obligation"
                )
                famille = st.text_input(
                    obligation_column_label("famille"), key="field_famille"
                )
                sousfamille = st.text_input(
                    obligation_column_label("sousfamille"), key="field_sousfamille"
                )
                type_bbg = st.text_input(
                    obligation_column_label("type_bbg"), key="field_type_bbg"
                )
                type_bbg_verified = st.checkbox(
                    text(
                        "Code type_bbg vérifié : taux fixe simple sans option",
                        "Bloomberg type verified: plain fixed-rate, no embedded option",
                    ),
                    key="field_type_bbg_verified",
                    help=text(
                        "Le code Bloomberg n'est pas interprété automatiquement.",
                        "The Bloomberg type is not interpreted automatically.",
                    ),
                )
                convention_int = st.text_input(
                    obligation_column_label("convention_int"),
                    key="field_convention_int",
                    help=text(
                        "Si renseignée, doit correspondre à la convention choisie.",
                        "If provided, it must match the selected convention.",
                    ),
                )
                lei = st.text_input(
                    obligation_column_label("lei"), key="field_lei"
                )
                type_conversion = st.text_input(
                    obligation_column_label("type_conversion"),
                    key="field_type_conversion",
                )
            with b:
                date_premier_cpn = st.date_input(
                    obligation_column_label("date_premier_cpn"),
                    value=None,
                    min_value=date(1900, 1, 1),
                    max_value=date(2200, 12, 31),
                    key="field_date_premier_cpn",
                )
                date_maturite_attendue = st.date_input(
                    obligation_column_label("date_maturite_attendue"),
                    value=None,
                    min_value=date(1900, 1, 1),
                    max_value=date(2200, 12, 31),
                    key="field_date_maturite_attendue",
                )
                date_annonce = st.date_input(
                    obligation_column_label("date_annonce"),
                    value=None,
                    min_value=date(1900, 1, 1),
                    max_value=date(2200, 12, 31),
                    key="field_date_annonce",
                )
                prix_remboursement = st.number_input(
                    text(
                        "Prix de remboursement (% du nominal)",
                        "Redemption price (% of nominal)",
                    ),
                    min_value=0.01,
                    value=100.0,
                    key="field_prix_remboursement",
                )
                montant_emission = st.number_input(
                    obligation_column_label("montant_emission"),
                    min_value=0.01,
                    value=None,
                    key="field_montant_emission",
                )
                calendrier = st.text_input(
                    obligation_column_label("calendrier"), key="field_calendrier"
                )
                coupon_hybride = st.text_input(
                    obligation_column_label("coupon_hybride"),
                    key="field_coupon_hybride",
                )
                convention_calc = st.text_input(
                    obligation_column_label("convention_calc"),
                    key="field_convention_calc",
                )
                prix_emission = st.number_input(
                    obligation_column_label("prix_emission"),
                    min_value=0.01,
                    value=None,
                    key="field_prix_emission",
                )

        st.markdown(
            f"#### {text('2 · Panel à la date d’observation', '2 · Comparables at observation date')}"
        )
        st.caption(
            text(
                "Sélection et scores manuels ; un motif est requis pour chaque titre exclu.",
                "Select comparables and enter scores manually; excluded bonds require a reason.",
            )
        )
        edited_panel = st.data_editor(
            panel,
            key="valuation_panel",
            hide_index=True,
            num_rows="dynamic",
            column_config={
                "Retenu": st.column_config.CheckboxColumn(
                    text("Retenu", "Selected"), default=True
                ),
                SPREAD_COLUMN: st.column_config.NumberColumn(
                    text(SPREAD_COLUMN, "Z-spread (bps)"),
                    min_value=-5000.0,
                    max_value=5000.0,
                ),
                SIMILARITY_COLUMN: st.column_config.NumberColumn(
                    text(SIMILARITY_COLUMN, "Similarity (%)"),
                    min_value=0.0,
                    max_value=100.0,
                ),
                "Obligation / ISIN": text("Obligation / ISIN", "Bond / ISIN"),
                "Source": text("Source", "Source"),
                "Motif exclusion": text("Motif exclusion", "Exclusion reason"),
            },
            use_container_width=True,
        )
        st.markdown(
            f"#### {text('3 · Courbe zéro à la même date', '3 · Zero curve at the same date')}"
        )
        curve_source = st.text_input(
            text("Source de la courbe zéro EUR *", "EUR zero-curve source *"),
            key="valuation_curve_source",
        )
        edited_curve = st.data_editor(
            curve,
            key="valuation_curve",
            hide_index=True,
            num_rows="dynamic",
            column_config={
                MATURITY_COLUMN: st.column_config.NumberColumn(
                    text(MATURITY_COLUMN, "Maturity (years)"),
                    min_value=0.01,
                    max_value=100.0,
                ),
                ZERO_RATE_COLUMN: st.column_config.NumberColumn(
                    text(ZERO_RATE_COLUMN, "Zero rate (%)"),
                    min_value=-50.0,
                    max_value=100.0,
                ),
            },
            use_container_width=True,
        )
        st.caption(
            text(
                "Chaque calcul est conservé dans une base SQLite locale non chiffrée.",
                "Each calculation is saved in a local, unencrypted SQLite database.",
            )
        )
        submitted = st.form_submit_button(
            text("Calculer et enregistrer", "Calculate and save"), type="primary"
        )
        save_fiche = st.form_submit_button(
            text("Enregistrer la fiche seule", "Save bond record only")
        )

    if submitted or save_fiche:
        if submitted:
            st.session_state.pop("latest_valuation", None)
            st.session_state.pop("latest_valuation_id", None)
        try:
            request = ValuationRequest(
                issuer=issuer.strip(), isin=isin.strip(), sector=sector.strip(),
                rating=rating.strip(), seniority=seniority.strip(), currency=currency.strip().upper(),
                observation_date=observation, settlement_date=settlement,
                maturity_date=maturity, coupon=coupon / 100, nominal=nominal,
                frequency=frequency, day_count=day_count, curve_source=curve_source.strip(),
                comparables=[], curve=[],
                type_bbg_verified=type_bbg_verified,
                obligation_details=ObligationDetails(
                    produit=produit.strip(), type_obl=type_obl.strip(), cusip=cusip.strip(),
                    obligation=obligation.strip(), famille=famille.strip(), sousfamille=sousfamille.strip(),
                    type_bbg=type_bbg.strip(), convention_int=convention_int.strip(),
                    date_premier_cpn=date_premier_cpn, date_maturite_attendue=date_maturite_attendue,
                    date_annonce=date_annonce, prix_remboursement=prix_remboursement,
                    montant_emission=montant_emission, type_conversion=type_conversion.strip(),
                    calendrier=calendrier.strip(), coupon_hybride=coupon_hybride.strip(),
                    convention_calc=convention_calc.strip(), prix_emission=prix_emission, lei=lei.strip(),
                ),
            )
            if save_fiche:
                fiche_id = save_obligation(request, DATABASE_PATH)
                st.success(
                    text(
                        f"Fiche obligation #{fiche_id} enregistrée sans valorisation.",
                        f"Bond record #{fiche_id} saved without valuation.",
                    )
                )
                return
            request = replace(
                request,
                comparables=_parse_comparables(edited_panel),
                curve=_parse_curve(edited_curve),
            )
            report = value_bond(request)
            report_id = save_report(report, DATABASE_PATH)
        except (ValueError, sqlite3.Error, OSError) as exc:
            st.error(
                text(
                    f"Action non enregistrée : {error_text(str(exc))}",
                    f"Action not saved: {error_text(str(exc))}",
                )
            )
        else:
            st.session_state["latest_valuation"] = report
            st.session_state["latest_valuation_id"] = report_id
            st.success(
                text(
                    f"Valorisation #{report_id} enregistrée localement.",
                    f"Valuation #{report_id} saved locally.",
                )
            )

    if "latest_valuation" in st.session_state:
        _render_valuation_result(
            st.session_state["latest_valuation"], st.session_state["latest_valuation_id"]
        )


def render_history() -> None:
    st.subheader(text("Historique local", "Local history"))
    st.caption(
        text(
            "Les données sont stockées localement sans chiffrement ni contrôle d'accès. "
            "Ne pas utiliser cet historique comme registre d'audit réglementaire.",
            "Data is stored locally without encryption or access control. "
            "Do not use this history as a regulatory audit record.",
        )
    )
    try:
        reports = list_reports(DATABASE_PATH)
        obligations = list_obligations(DATABASE_PATH)
    except (sqlite3.Error, OSError, ValueError) as exc:
        st.error(
            text(
                f"Impossible de lire l'historique : {exc}",
                f"Unable to read history: {exc}",
            )
        )
        return
    if obligations:
        st.markdown(
            f"#### {text('Fiches enregistrées sans valorisation', 'Bond records saved without valuation')}"
        )
        fiche_id = st.selectbox(
            text("Afficher la fiche", "Select bond record"),
            [item["id"] for item in obligations],
        )
        selected_fiche = next(item for item in obligations if item["id"] == fiche_id)
        st.json(selected_fiche["obligation"])
        st.download_button(
            text("Télécharger la fiche JSON", "Download bond record JSON"),
            data=report_json(selected_fiche["obligation"]),
            file_name=f"obligation_{fiche_id}.json",
            mime=JSON_MIME,
        )
    if not reports:
        st.info(text("Aucune valorisation enregistrée.", "No valuations saved."))
        return
    st.markdown(f"#### {text('Valorisations', 'Valuations')}")
    rows = [
        {
            text("ID", "ID"): item["id"],
            text("Date marché", "Market date"): item["observation_date"],
            text("Émetteur", "Issuer"): item["issuer"],
            text("Création UTC", "Created (UTC)"): item["created_at_utc"],
            text(SPREAD_COLUMN, "Z-spread (bps)"): item["report"]["result"][
                "weighted_z_spread_bps"
            ],
            text("YTM (%)", "YTM (%)"): item["report"]["result"]["implied_ytm"] * 100,
            text("Prix clean", "Clean price"): item["report"]["result"]["clean_price"],
        }
        for item in reports
    ]
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
    selected_id = st.selectbox(
        text("Afficher le rapport", "Select report"),
        [item["id"] for item in reports],
    )
    selected = next(item for item in reports if item["id"] == selected_id)
    st.download_button(
        text("Télécharger le rapport sélectionné", "Download selected report"),
        data=json.dumps(selected["report"], ensure_ascii=False, indent=2),
        file_name=f"valorisation_{selected_id}.json",
        mime=JSON_MIME,
    )
