"""Interface de recherche traçable des obligations comparables."""

from __future__ import annotations

import json
import os
import smtplib
from datetime import date, timedelta
from typing import Any

import pandas as pd
import psycopg
import streamlit as st

from audit_mail import (
    AuditMailConfigurationError,
    DEFAULT_AUDIT_RECIPIENT,
    send_audit_email,
    smtp_settings_from_environment,
)
from comparable_selection import TargetBond, select_comparables
from database import DatabaseConfigurationError, list_market_observations
from localization import text
from mistral_judge import (
    JudgeConfigurationError,
    JudgeServiceError,
    challenge_panel,
)

REPORT_KEY = "automatic_market_panel_report"
JUDGE_KEY = "automatic_market_panel_judge"
MAX_CANDIDATES = 5


def _build_market_panel_report(
    target_values: dict[str, Any],
    candidates: list[dict[str, Any]],
    first_date: date,
    second_date: date,
) -> dict[str, Any]:
    reports = {}
    for label, observation_date in (
        ("date_1", first_date),
        ("date_2", second_date),
    ):
        target = TargetBond(
            isin=target_values["isin"],
            issuer=target_values["issuer"],
            sector=target_values["sector"],
            rating=target_values["rating"],
            seniority=target_values["seniority"],
            currency=target_values["currency"],
            maturity_date=target_values["maturity_date"],
            observation_date=observation_date,
            coupon_type=target_values["coupon_type"],
            bond_type=target_values["bond_type"],
            coupon_rate_pct=target_values["coupon_rate_pct"],
        )
        reports[label] = select_comparables(
            target, candidates, limit=MAX_CANDIDATES
        )
        reports[label]["requested_date"] = observation_date.isoformat()
    return {
        "target": target_values,
        "requested_observation_dates": [
            first_date.isoformat(),
            second_date.isoformat(),
        ],
        "date_reports": reports,
        "data_source": "PostgreSQL bp2s.market_observation",
        "generated_at": date.today().isoformat(),
        "production_valuation_allowed": all(
            result["valuation_allowed"] for result in reports.values()
        ),
    }


def _judge_evidence(report: dict[str, Any]) -> dict[str, Any]:
    selected = []
    quality_flags = []
    for date_label, date_report in report["date_reports"].items():
        quality_flags.extend(date_report["quality_flags"])
        for candidate in date_report["selected"]:
            selected.append(
                {
                    **candidate,
                    "requested_date": date_report["requested_date"],
                }
            )
    return {
        "target": {
            **report["target"],
            "requested_observation_dates": report[
                "requested_observation_dates"
            ],
        },
        "selected": selected,
        "excluded": [],
        "methodology": next(
            iter(report["date_reports"].values())
        )["methodology"],
        "quality_flags": sorted(set(quality_flags)),
        "valuation_allowed": report["production_valuation_allowed"],
    }


def _render_date_report(label: str, report: dict[str, Any]) -> None:
    requested_date = report["requested_date"]
    st.markdown(
        f"#### {text('Observation', 'Observation')} — {requested_date}"
    )
    if report["valuation_allowed"]:
        st.success(
            text(
                "Les données retenues sont datées et vérifiées comme officielles.",
                "Selected data are dated and identified as official.",
            )
        )
    else:
        st.warning(
            text(
                "Cette sélection aide à explorer les caractéristiques, mais ne permet "
                "pas d'établir un prix de marché pour cette date.",
                "This selection helps explore bond characteristics but cannot establish "
                "a market price for this date.",
            )
        )
    for flag in report["quality_flags"]:
        st.caption(f"• {flag}")

    selected = report["selected"]
    if not selected:
        st.info(text("Aucun titre comparable admissible.", "No eligible comparable found."))
        return

    st.caption(
        text(
            f"{len(selected)} candidat(s) classé(s) par score de similarité.",
            f"{len(selected)} candidate(s) ranked by similarity score.",
        )
    )
    display = pd.DataFrame(
        [
            {
                text("Rang", "Rank"): index,
                "ISIN": candidate.get("isin"),
                text("Émetteur", "Issuer"): candidate.get("issuer"),
                text("Type d'émetteur", "Issuer type"): candidate.get("issuer_type"),
                text("Notation", "Rating"): candidate.get("rating"),
                text("Séniorité", "Seniority"): candidate.get("seniority"),
                text("Échéance", "Maturity"): candidate.get("maturity_date"),
                text("Coupon (%)", "Coupon (%)"): candidate.get(
                    "coupon_rate_pct"
                ),
                text("Spread source (pb)", "Source spread (bps)"): candidate.get(
                    "spread_bps"
                ),
                text("Score ESG", "ESG score"): candidate.get("esg_score"),
                text("Similarité", "Similarity"): candidate.get(
                    "similarity_score"
                ),
                text("Statut données", "Data status"): candidate.get("data_status"),
                text("Date marché", "Market date"): candidate.get("market_date"),
            }
            for index, candidate in enumerate(selected, start=1)
        ]
    )
    st.dataframe(display, hide_index=True, width="stretch")
    for index, candidate in enumerate(selected, start=1):
        label = f"{index}. {candidate.get('issuer') or candidate.get('isin')} — {candidate.get('similarity_score'):.2f}/100"
        with st.expander(label):
            st.write(
                text("Critères concordants", "Matching criteria"),
                ", ".join(candidate["matches"])
                or text("Aucun critère confirmé.", "No confirmed match."),
            )
            st.write(
                text("Écarts et données manquantes", "Differences and missing data"),
                ", ".join(candidate["differences"])
                or text("Aucun écart identifié.", "No difference identified."),
            )
            st.caption(
                text("Source de fichier", "File source")
                + f": {candidate.get('source_name')}; "
                + text("fournisseur déclaré", "claimed provider")
                + f": {candidate.get('provider_claim') or '—'}"
            )

    with st.expander(text("Méthode de classement", "Ranking methodology")):
        st.write(report["methodology"])
        st.caption(
            text(
                "Le champ « spread_bps » du jeu de démonstration est un spread "
                "synthétique non qualifié ; ce n'est pas un Z-spread. Aucun prix "
                "ou rendement cible n'est calculé à partir de ce champ.",
                "The demo dataset's spread_bps is an unqualified synthetic spread, "
                "not a Z-spread. No target price or yield is calculated from it.",
            )
        )

    excluded = report["excluded"]
    if excluded:
        with st.expander(
            text(
                f"Titres écartés ({len(excluded)})",
                f"Excluded bonds ({len(excluded)})",
            )
        ):
            st.dataframe(
                pd.DataFrame(
                    [
                        {
                            "ISIN": item.get("isin"),
                            text("Motif", "Reason"): item.get("reason"),
                        }
                        for item in excluded
                    ]
                ),
                hide_index=True,
                width="stretch",
            )


def _render_judge(report: dict[str, Any]) -> None:
    st.markdown(f"#### {text('Agent juge indépendant', 'Independent judge agent')}")
    st.caption(
        text(
            "Le juge challenge les preuves et les limites ; il ne choisit pas les "
            "comparables et ne modifie aucun calcul. L'appel transmet à Mistral les "
            "caractéristiques de la cible, les candidats et leurs sources.",
            "The judge challenges evidence and limitations; it does not select "
            "comparables or change calculations. The Mistral request sends the target "
            "characteristics, candidates, and their sources.",
        )
    )
    consent = st.checkbox(
        text(
            "J'autorise l'envoi de ces données à Mistral pour la revue contradictoire.",
            "I authorize sending this data to Mistral for an independent review.",
        ),
        key="market_panel_mistral_consent",
    )
    if st.button(
        text("Lancer le challenge", "Run challenge"),
        key="market_panel_run_judge",
        disabled=not consent,
    ):
        st.session_state.pop(JUDGE_KEY, None)
        try:
            review = challenge_panel(_judge_evidence(report))
        except (JudgeConfigurationError, JudgeServiceError) as exc:
            st.error(str(exc))
        else:
            st.session_state[JUDGE_KEY] = review

    review = st.session_state.get(JUDGE_KEY)
    if review:
        verdict_label = {
            "challenge": text("À challenger", "Challenge required"),
            "conditional": text("Réserves", "Conditional"),
            "no_critical_issue": text("Aucun problème critique détecté", "No critical issue detected"),
        }[review["verdict"]]
        st.info(f"**{verdict_label}** · {review['summary']}")
        for finding in review["critical_findings"]:
            st.error(finding)
        for finding in review["other_findings"]:
            st.warning(finding)
        for question in review["challenge_questions"]:
            st.write(f"• {question}")


def _render_audit_delivery(report: dict[str, Any]) -> None:
    st.markdown(f"#### {text('Traçabilité', 'Audit trail')}")
    audit_report = {
        **report,
        "judge_review": st.session_state.get(JUDGE_KEY),
    }
    st.download_button(
        text("Télécharger le rapport JSON", "Download JSON report"),
        data=json.dumps(audit_report, ensure_ascii=False, indent=2, default=str),
        file_name="rapport_panel_comparables.json",
        mime="application/json",
        key="market_panel_download_report",
    )
    recipient = os.environ.get(
        "AUDIT_EMAIL_TO", DEFAULT_AUDIT_RECIPIENT
    ).strip()
    consent = st.checkbox(
        text(
            f"Je confirme l'envoi du rapport à {recipient}.",
            f"I confirm sending the report to {recipient}.",
        ),
        key="market_panel_email_consent",
    )
    if st.button(
        text("Envoyer le rapport d'audit", "Send audit report"),
        key="market_panel_send_audit",
        disabled=not consent,
    ):
        try:
            settings = smtp_settings_from_environment()
            send_audit_email(audit_report, settings)
        except AuditMailConfigurationError as exc:
            st.error(str(exc))
        except (OSError, TimeoutError, smtplib.SMTPException) as exc:
            st.error(
                text(
                    f"Envoi du rapport impossible : {exc}",
                    f"Unable to send the report: {exc}",
                )
            )
        else:
            st.success(
                text("Rapport transmis à la boîte d'audit.", "Report sent to the audit mailbox.")
            )


def render_market_panel() -> None:
    st.subheader(
        text("Panel automatique de comparables", "Automatic comparable panel")
    )
    st.warning(
        text(
            "Le jeu actuellement chargé est synthétique. Il sert à tester le "
            "classement, pas à produire une juste valeur ou une recommandation "
            "d'investissement. Il ne contient pas deux dates de marché vérifiées "
            "ni de courbe EUR swap 6M.",
            "The loaded dataset is synthetic. It can test ranking, but cannot produce "
            "fair value or an investment recommendation. It contains neither two "
            "verified market dates nor an EUR 6M swap curve.",
        )
    )
    st.caption(
        text(
            "Les candidats sont classés par devise, maturité, notation, type "
            "d'émetteur, séniorité et type de coupon. Chaque sélection et exclusion "
            "est justifiée ; les spreads source ne sont jamais présentés comme des "
            "Z-spreads. Les scores ESG sont affichés comme contexte, sans influencer "
            "la comparaison de crédit.",
            "Candidates are ranked by currency, maturity, rating, issuer type, "
            "seniority, and coupon type. Every selection and exclusion is explained; "
            "source spreads are never presented as Z-spreads. ESG scores are shown "
            "as context and do not influence credit comparability.",
        )
    )

    today = date.today()
    with st.form("automatic_market_panel_form"):
        left, right = st.columns(2)
        with left:
            issuer = st.text_input(
                text("Émetteur cible", "Target issuer"),
                key="market_panel_target_issuer",
            )
            isin = st.text_input("ISIN", key="market_panel_target_isin")
            sector = st.text_input(
                text("Secteur / type d'émetteur", "Sector / issuer type"),
                key="market_panel_target_sector",
            )
            rating = st.text_input(
                text("Notation", "Rating"), key="market_panel_target_rating"
            )
            seniority = st.text_input(
                text("Séniorité", "Seniority"),
                key="market_panel_target_seniority",
            )
        with right:
            currency = st.text_input(
                text("Devise", "Currency"),
                value="EUR",
                max_chars=3,
                key="market_panel_target_currency",
            )
            bond_type = st.selectbox(
                text("Type d'obligation", "Bond type"),
                ("Fixed", "Floating", "Zero Coupon"),
                key="market_panel_target_bond_type",
            )
            coupon_type = st.selectbox(
                text("Type de coupon", "Coupon type"),
                ("Fixed", "Floating", "Zero Coupon"),
                key="market_panel_target_coupon_type",
            )
            coupon_rate = st.number_input(
                text("Coupon annuel (%)", "Annual coupon (%)"),
                min_value=0.0,
                value=3.75,
                step=0.05,
                key="market_panel_target_coupon_rate",
            )
            maturity = st.date_input(
                text("Maturité cible", "Target maturity"),
                today + timedelta(days=365 * 8),
                min_value=today + timedelta(days=1),
                max_value=date(2200, 12, 31),
                key="market_panel_target_maturity",
            )
            first_date = st.date_input(
                text("Première date d'observation", "First observation date"),
                today - timedelta(days=1),
                key="market_panel_observation_date_1",
            )
            second_date = st.date_input(
                text("Seconde date d'observation", "Second observation date"),
                today,
                key="market_panel_observation_date_2",
            )
        submitted = st.form_submit_button(
            text("Rechercher les comparables", "Find comparables"),
            type="primary",
            key="find_market_comparables",
        )

    if submitted:
        if first_date >= second_date:
            st.error(
                text(
                    "La seconde date doit être postérieure à la première.",
                    "The second date must be after the first.",
                )
            )
        elif not currency.strip():
            st.error(text("La devise est obligatoire.", "Currency is required."))
        else:
            try:
                candidates = list_market_observations()
            except DatabaseConfigurationError as exc:
                st.error(str(exc))
                return
            except psycopg.Error as exc:
                st.error(
                    text(
                        f"Lecture du référentiel impossible : {exc}",
                        f"Unable to read the market reference: {exc}",
                    )
                )
                return
            target_values = {
                "issuer": issuer.strip(),
                "isin": isin.strip(),
                "sector": sector.strip(),
                "rating": rating.strip(),
                "seniority": seniority.strip(),
                "currency": currency.strip().upper(),
                "maturity_date": maturity.isoformat(),
                "bond_type": bond_type,
                "coupon_type": coupon_type,
                "coupon_rate_pct": coupon_rate,
            }
            target_values_for_engine = {
                **target_values,
                "maturity_date": maturity,
            }
            try:
                report = _build_market_panel_report(
                    target_values_for_engine,
                    candidates,
                    first_date,
                    second_date,
                )
            except ValueError as exc:
                st.error(str(exc))
                return
            st.session_state[REPORT_KEY] = report
            st.session_state.pop(JUDGE_KEY, None)
            st.session_state.pop("market_panel_mistral_consent", None)
            st.session_state.pop("market_panel_email_consent", None)

    report = st.session_state.get(REPORT_KEY)
    if not report:
        return

    tabs = st.tabs(
        [
            f"{text('Date 1', 'Date 1')} · {report['requested_observation_dates'][0]}",
            f"{text('Date 2', 'Date 2')} · {report['requested_observation_dates'][1]}",
        ]
    )
    for tab, (label, date_report) in zip(
        tabs, report["date_reports"].items()
    ):
        with tab:
            _render_date_report(label, date_report)

    _render_judge(report)
    _render_audit_delivery(report)
