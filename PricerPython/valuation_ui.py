"""Parcours Streamlit de valorisation et historique local."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import streamlit as st

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
            raise ValueError("Chaque point de courbe doit avoir une maturité et un taux zéro.")
        nodes.append(CurveNode(years, rate / 100))
    return nodes


def _render_valuation_result(report: dict, report_id: int) -> None:
    result = report["result"]
    st.markdown("#### Résultat")
    a, b, c, d = st.columns(4)
    a.metric("Z-spread théorique", f"{result['weighted_z_spread_bps']:.2f} pb")
    b.metric("YTM implicite", f"{result['implied_ytm'] * 100:.4f} %")
    c.metric("Prix clean", f"{result['clean_price']:.4f}")
    d.metric("Prix dirty", f"{result['dirty_price']:.4f}")
    st.caption(
        f"Intérêts courus : {result['accrued_interest']:.4f} · "
        f"Z-spread maximal : {result['best_z_spread_name']} "
        f"({result['best_z_spread_bps']:.2f} pb). "
        "Le Z-spread maximal n'est pas nécessairement le meilleur YTM."
    )
    if result["curve_extrapolated"]:
        st.warning("Certains flux utilisent une extrapolation plate de la courbe.")
    with st.expander("Flux actualisés et méthodologie"):
        st.dataframe(pd.DataFrame(report["cashflows"]), hide_index=True)
        for description in report["methodology"].values():
            st.write(description)
    st.download_button(
        "Télécharger le rapport JSON",
        data=report_json(report),
        file_name=f"valorisation_{report_id}.json",
        mime=JSON_MIME,
    )


def render_valuation() -> None:
    st.subheader("Valorisation par comparables et courbe zéro")
    st.info(
        "Données saisies manuellement : vérifiez la date, la source et les caractéristiques "
        "de chaque comparable. Ce calcul est un prototype, non validé pour la production."
    )
    st.caption(
        "La courbe doit contenir des taux zéro EUR dérivés de la courbe swap 6M, "
        "en capitalisation continue. Les Z-spreads doivent utiliser la même convention. "
        "Ne saisissez pas directement des taux swap au pair."
    )
    st.caption("Ce parcours est limité aux obligations à taux fixe libellées en EUR.")
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
        st.markdown("#### 1 · Instrument et dates")
        left, right = st.columns(2)
        with left:
            issuer = st.text_input("Émetteur *", key="valuation_issuer")
            isin = st.text_input("ISIN", key="valuation_isin")
            sector = st.text_input("Secteur", key="valuation_sector")
            currency = st.text_input("Devise", value="EUR", key="valuation_currency")
            rating = st.text_input("Notation", key="valuation_rating")
            seniority = st.text_input("Séniorité", key="valuation_seniority")
        with right:
            observation = st.date_input("Date d'observation du marché *", today)
            settlement = st.date_input("Date de règlement *", today, key="valuation_settlement")
            maturity = st.date_input(
                "Date d'échéance *", today + timedelta(days=365 * 8),
                min_value=date(1900, 1, 1), max_value=date(2200, 12, 31),
                key="valuation_maturity"
            )
            coupon = st.number_input("Coupon annuel (%) *", min_value=0.0, value=3.75, step=0.05, key="valuation_coupon")
            nominal = st.number_input("Nominal *", min_value=0.01, value=100.0, key="valuation_nominal")
        frequency = st.selectbox("Coupons par an", (1, 2, 4, 12), index=1, key="valuation_frequency")
        day_count = st.selectbox(
            "Convention d'intérêts courus",
            DAY_COUNT_CONVENTIONS,
            format_func=lambda value: value.value,
            key="valuation_day_count",
        )

        with st.expander("Fiche obligation : champs complémentaires"):
            st.caption(
                "Ces champs sont conservés dans le rapport ou la fiche. "
                "Les champs liés aux conventions et aux structures sont contrôlés ; "
                "vous pouvez toutefois enregistrer la fiche seule."
            )
            a, b = st.columns(2)
            with a:
                produit = st.text_input("produit", key="field_produit")
                type_obl = st.text_input("type_obl", key="field_type_obl", help="Taux fixe simple uniquement pour le calcul.")
                cusip = st.text_input("cusip", key="field_cusip")
                obligation = st.text_input("obligation", key="field_obligation")
                famille = st.text_input("famille", key="field_famille")
                sousfamille = st.text_input("sousfamille", key="field_sousfamille")
                type_bbg = st.text_input("type_bbg", key="field_type_bbg")
                type_bbg_verified = st.checkbox(
                    "Code type_bbg vérifié : taux fixe simple sans option",
                    key="field_type_bbg_verified",
                    help="Le code Bloomberg n'est pas interprété automatiquement.",
                )
                convention_int = st.text_input("convention_int", key="field_convention_int", help="Si renseignée, doit correspondre à la convention choisie.")
                lei = st.text_input("lei", key="field_lei")
                type_conversion = st.text_input("type_conversion", key="field_type_conversion")
            with b:
                date_premier_cpn = st.date_input(
                    "date_premier_cpn", value=None, min_value=date(1900, 1, 1),
                    max_value=date(2200, 12, 31), key="field_date_premier_cpn"
                )
                date_maturite_attendue = st.date_input(
                    "date_maturite_attendue", value=None, min_value=date(1900, 1, 1),
                    max_value=date(2200, 12, 31), key="field_date_maturite_attendue"
                )
                date_annonce = st.date_input(
                    "date_annonce", value=None, min_value=date(1900, 1, 1),
                    max_value=date(2200, 12, 31), key="field_date_annonce"
                )
                prix_remboursement = st.number_input(
                    "prix_remboursement (% du nominal)", min_value=0.01,
                    value=100.0, key="field_prix_remboursement"
                )
                montant_emission = st.number_input(
                    "montant_emission", min_value=0.01, value=None, key="field_montant_emission"
                )
                calendrier = st.text_input("calendrier", key="field_calendrier")
                coupon_hybride = st.text_input("coupon_hybride", key="field_coupon_hybride")
                convention_calc = st.text_input("convention_calc", key="field_convention_calc")
                prix_emission = st.number_input(
                    "prix_emission", min_value=0.01, value=None, key="field_prix_emission"
                )

        st.markdown("#### 2 · Panel à la date d'observation")
        st.caption("Sélection et scores manuels ; un motif est requis pour chaque titre exclu.")
        edited_panel = st.data_editor(
            panel,
            key="valuation_panel",
            hide_index=True,
            num_rows="dynamic",
            column_config={
                "Retenu": st.column_config.CheckboxColumn("Retenu", default=True),
                SPREAD_COLUMN: st.column_config.NumberColumn(SPREAD_COLUMN, min_value=-5000.0, max_value=5000.0),
                SIMILARITY_COLUMN: st.column_config.NumberColumn(SIMILARITY_COLUMN, min_value=0.0, max_value=100.0),
            },
            use_container_width=True,
        )
        st.markdown("#### 3 · Courbe zéro à la même date")
        curve_source = st.text_input("Source de la courbe zéro EUR *", key="valuation_curve_source")
        edited_curve = st.data_editor(
            curve,
            key="valuation_curve",
            hide_index=True,
            num_rows="dynamic",
            column_config={
                MATURITY_COLUMN: st.column_config.NumberColumn(MATURITY_COLUMN, min_value=0.01, max_value=100.0),
                ZERO_RATE_COLUMN: st.column_config.NumberColumn(ZERO_RATE_COLUMN, min_value=-50.0, max_value=100.0),
            },
            use_container_width=True,
        )
        st.caption("Chaque calcul est conservé dans une base SQLite locale non chiffrée.")
        submitted = st.form_submit_button("Calculer et enregistrer", type="primary")
        save_fiche = st.form_submit_button("Enregistrer la fiche seule")

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
                st.success(f"Fiche obligation #{fiche_id} enregistrée sans valorisation.")
                return
            request = replace(
                request,
                comparables=_parse_comparables(edited_panel),
                curve=_parse_curve(edited_curve),
            )
            report = value_bond(request)
            report_id = save_report(report, DATABASE_PATH)
        except (ValueError, sqlite3.Error, OSError) as exc:
            st.error(f"Action non enregistrée : {exc}")
        else:
            st.session_state["latest_valuation"] = report
            st.session_state["latest_valuation_id"] = report_id
            st.success(f"Valorisation #{report_id} enregistrée localement.")

    if "latest_valuation" in st.session_state:
        _render_valuation_result(
            st.session_state["latest_valuation"], st.session_state["latest_valuation_id"]
        )


def render_history() -> None:
    st.subheader("Historique local")
    st.caption(
        "Les données sont stockées localement sans chiffrement ni contrôle d'accès. "
        "Ne pas utiliser cet historique comme registre d'audit réglementaire."
    )
    try:
        reports = list_reports(DATABASE_PATH)
        obligations = list_obligations(DATABASE_PATH)
    except (sqlite3.Error, OSError, ValueError) as exc:
        st.error(f"Impossible de lire l'historique : {exc}")
        return
    if obligations:
        st.markdown("#### Fiches enregistrées sans valorisation")
        fiche_id = st.selectbox("Afficher la fiche", [item["id"] for item in obligations])
        selected_fiche = next(item for item in obligations if item["id"] == fiche_id)
        st.json(selected_fiche["obligation"])
        st.download_button(
            "Télécharger la fiche JSON", data=report_json(selected_fiche["obligation"]),
            file_name=f"obligation_{fiche_id}.json", mime=JSON_MIME,
        )
    if not reports:
        st.info("Aucune valorisation enregistrée.")
        return
    st.markdown("#### Valorisations")
    rows = [
        {
            "ID": item["id"],
            "Date marché": item["observation_date"],
            "Émetteur": item["issuer"],
            "Création UTC": item["created_at_utc"],
            SPREAD_COLUMN: item["report"]["result"]["weighted_z_spread_bps"],
            "YTM (%)": item["report"]["result"]["implied_ytm"] * 100,
            "Prix clean": item["report"]["result"]["clean_price"],
        }
        for item in reports
    ]
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
    selected_id = st.selectbox("Afficher le rapport", [item["id"] for item in reports])
    selected = next(item for item in reports if item["id"] == selected_id)
    st.download_button(
        "Télécharger le rapport sélectionné",
        data=json.dumps(selected["report"], ensure_ascii=False, indent=2),
        file_name=f"valorisation_{selected_id}.json",
        mime=JSON_MIME,
    )
