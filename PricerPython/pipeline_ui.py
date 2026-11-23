"""Interface du cas d'usage #3 : Z-spread et yield d'une nouvelle obligation à deux dates."""

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
    DEFAULT_AUDIT_RECIPIENT,
    AuditMailConfigurationError,
    send_audit_email,
    smtp_settings_from_environment,
)
from curve import SwapPoint, bootstrap_zero_curve
from database import (
    DatabaseConfigurationError,
    list_market_observations,
    list_swap_curve_sets,
)
from localization import text
from mistral_judge import (
    JudgeConfigurationError,
    JudgeServiceError,
    challenge_panel,
)
from pipeline import CurveProvenance, PipelineTarget, run_pricing_pipeline
from request_extraction import extract_target

REPORT_KEY = "cas3_pipeline_report"
JUDGE_KEY = "cas3_pipeline_judge"
CURVES_KEY = "cas3_swap_curves_by_date"
CURVE_METADATA_KEY = "cas3_swap_curve_metadata_by_date"
EXTRACT_KEY = "cas3_pending_extract"
EXTRACT_RESULT_KEY = "cas3_extraction"
MAX_CANDIDATES = 5

DEFAULT_SWAP_TEXT = "\n".join(
    f"{years};{rate:.2f}"
    for years, rate in (
        (0.5, 2.00),
        (1.0, 2.20),
        (2.0, 2.50),
        (3.0, 2.80),
        (5.0, 3.20),
        (7.0, 3.50),
        (10.0, 3.80),
    )
)


def _format_swap_text(points: list[SwapPoint]) -> str:
    return "\n".join(f"{p.years:g};{p.par_rate * 100:.4f}" for p in points)


def _parse_swap_text(raw: str) -> list[SwapPoint]:
    """Parser des lignes « années;taux au pair en % » (séparateur ';' ou ',')."""
    points: list[SwapPoint] = []
    for line in str(raw or "").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [part.strip() for part in line.replace(",", ";").split(";")]
        if len(parts) != 2:
            raise ValueError(
                f"Ligne de swap invalide : « {line} » (attendu « années;taux % »)."
            )
        try:
            years = float(parts[0])
            par_rate_pct = float(parts[1])
        except ValueError as exc:
            raise ValueError(
                f"Ligne de swap invalide : « {line} » (nombres attendus)."
            ) from exc
        if years <= 0:
            raise ValueError(f"La maturité du swap doit être positive : « {line} ».")
        points.append(SwapPoint(years, round(par_rate_pct / 100, 10)))
    if not points:
        raise ValueError("Au moins un point de swap est requis par date.")
    return points


def _swap_text_for(observation_date: date) -> str:
    stored = st.session_state.get(CURVES_KEY, {})
    points = stored.get(observation_date.isoformat())
    if points:
        return _format_swap_text(points)
    return DEFAULT_SWAP_TEXT


def _curve_provenance_for_input(
    observation_date: date, raw_text: str, points: list[SwapPoint]
) -> CurveProvenance:
    iso_date = observation_date.isoformat()
    metadata = st.session_state.get(CURVE_METADATA_KEY, {}).get(iso_date)
    loaded_points = st.session_state.get(CURVES_KEY, {}).get(iso_date)
    if metadata and loaded_points == points:
        return CurveProvenance(
            source_name=str(metadata["source_name"]),
            market_date=metadata["market_date"],
            data_status=str(metadata["data_status"]),
        )
    if raw_text.strip() == DEFAULT_SWAP_TEXT.strip():
        return CurveProvenance(
            source_name="Courbe de démonstration préremplie",
            market_date=observation_date,
            data_status="synthetic_demo",
        )
    return CurveProvenance(
        source_name="Saisie manuelle",
        market_date=observation_date,
        data_status="unverified",
    )


def _judge_evidence(report: dict[str, Any]) -> dict[str, Any]:
    selected: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    flags: list[str] = []
    valuation: dict[str, Any] = {}
    curves: dict[str, Any] = {}
    for iso_date, date_report in report["dates"].items():
        flags.extend(date_report["quality_flags"])
        excluded.extend(date_report["excluded"])
        valuation[iso_date] = date_report["result"]
        curves[iso_date] = date_report["curve"]
        for item in date_report["selected"]:
            selected.append({**item, "observation_date": iso_date})
    return {
        "target": {
            **report["target"],
            "observation_dates": report["observation_dates"],
        },
        "selected": selected,
        "excluded": excluded,
        "zero_curve": report["curve_source"],
        "curves": curves,
        "methodology": next(iter(report["dates"].values()))["methodology"],
        "quality_flags": sorted(set(flags)),
        "valuation_allowed": all(
            date_report["valuation_allowed"]
            for date_report in report["dates"].values()
        ),
        "valuation_result": valuation,
    }


def _render_date_result(
    iso_date: str,
    date_report: dict[str, Any],
    currency: str,
    nominal: float,
) -> None:
    st.markdown(f"#### {text('Observation', 'Observation')} — {iso_date}")
    if date_report["valuation_allowed"]:
        st.success(
            text(
                "Seuils techniques de qualité satisfaits. Les statuts et sources sont déclaratifs et ne sont pas vérifiés indépendamment.",
                "Technical quality thresholds passed. Sources and statuses are declared and are not independently verified.",
            )
        )
    else:
        st.warning(
            text(
                "Valorisation indicative uniquement : seuil de comparables, statut ou provenance de la courbe insuffisant.",
                "Indicative valuation only: comparable threshold, status, or curve provenance is insufficient.",
            )
        )
    curve = date_report["curve"]
    st.caption(
        text(
            "Courbe utilisée — source : "
            + str(curve["source_name"] or "absente")
            + " ; date : "
            + str(curve["market_date"] or "absente")
            + " ; statut déclaré : "
            + str(curve["data_status"]),
            "Curve used — source: "
            + str(curve["source_name"] or "missing")
            + " ; date: "
            + str(curve["market_date"] or "missing")
            + " ; declared status: "
            + str(curve["data_status"]),
        )
    )
    for flag in date_report["quality_flags"]:
        st.caption(f"• {flag}")

    result = date_report["result"]
    if result:
        st.markdown(f"**{text('Juste valeur de référence', 'Reference fair value')}**")
        cols = st.columns(3)
        cols[0].metric(
            text("Z-spread pondéré (pb)", "Weighted Z-spread (bps)"),
            f"{result['weighted_z_spread_bps']:.2f}",
        )
        cols[1].metric(
            text("Yield (courbe zéro + Z)", "Yield (zero curve + Z)"),
            f"{result['yield_from_curve_and_z_spread'] * 100:.4f} %",
        )
        cols[2].metric(
            text("Taux zéro à maturité", "Zero rate at maturity"),
            f"{result['zero_rate_at_maturity'] * 100:.4f} %",
        )
        cols = st.columns(3)
        cols[0].metric(
            text("Prix dirty", "Dirty price"),
            f"{result['dirty_price']:.4f} {currency}",
        )
        cols[1].metric(
            text("Prix clean", "Clean price"),
            f"{result['clean_price']:.4f} {currency}",
        )
        cols[2].metric(
            text("YTM implicite", "Implied YTM"),
            f"{result['implied_ytm'] * 100:.4f} %",
        )
        st.caption(
            text(
                f"Prix exprimés pour un nominal de {nominal:g} {currency}.",
                f"Prices are quoted for a face value of {nominal:g} {currency}.",
            )
        )

        spread_range = result["observed_comparable_spread_range_bps"]
        price_range = result["observed_panel_price_range"]
        st.markdown(
            f"**{text('Dispersion observée du panel', 'Observed panel dispersion')}**"
        )
        range_cols = st.columns(3)
        range_cols[0].metric(
            text("Z-spread min–max (pb)", "Z-spread min–max (bps)"),
            f"{spread_range['minimum']:.2f} – {spread_range['maximum']:.2f}",
        )
        range_cols[1].metric(
            text("Prix clean min–max", "Clean price min–max"),
            f"{price_range['minimum_clean_price']:.4f} – "
            f"{price_range['maximum_clean_price']:.4f} {currency}",
        )
        range_cols[2].metric(
            text("Prix dirty min–max", "Dirty price min–max"),
            f"{price_range['minimum_dirty_price']:.4f} – "
            f"{price_range['maximum_dirty_price']:.4f} {currency}",
        )
        st.caption(
            text(
                "Enveloppe calculée aux spreads minimum et maximum des comparables utilisables ; "
                "ce n'est pas un intervalle de confiance.",
                "Range repriced at the minimum and maximum usable comparable spreads; "
                "this is not a confidence interval.",
            )
        )

        issue = result["issue_scenario"]
        st.markdown(
            f"**{text('Scénario de prix d’émission', 'Indicative issue-price scenario')}**"
        )
        issue_cols = st.columns(3)
        issue_cols[0].metric(
            text("Ajustement utilisateur (pb)", "User adjustment (bps)"),
            f"{issue['spread_adjustment_bps']:+.2f}",
        )
        issue_cols[1].metric(
            text("Z-spread du scénario (pb)", "Scenario Z-spread (bps)"),
            f"{issue['z_spread_bps']:.2f}",
        )
        issue_cols[2].metric(
            text("YTM implicite du scénario", "Scenario implied YTM"),
            f"{issue['implied_ytm'] * 100:.4f} %",
        )
        issue_price_cols = st.columns(2)
        issue_price_cols[0].metric(
            text("Prix clean du scénario", "Scenario clean price"),
            f"{issue['clean_price']:.4f} {currency}",
        )
        issue_price_cols[1].metric(
            text("Prix dirty du scénario", "Scenario dirty price"),
            f"{issue['dirty_price']:.4f} {currency}",
        )
        st.caption(
            text(
                "L'ajustement est saisi par l'utilisateur : positif, il élargit le spread ; "
                "négatif, il le resserre. Il n'est pas déduit des données de marché.",
                "The adjustment is user-entered: positive widens the spread; negative tightens it. "
                "It is not inferred from market data.",
            )
        )
        stress = result["stress_scenarios"]
        with st.expander(
            text(
                "Sensibilités aux chocs parallèles",
                "Parallel-shock sensitivities",
            )
        ):
            st.caption(
                text(
                    "Chaque choc est appliqué isolément au scénario d'émission : le choc de courbe "
                    "laisse le Z-spread inchangé, et le choc de spread laisse la courbe zéro inchangée. "
                    "Les prix sont recalculés sur les flux.",
                    "Each shock is applied independently to the issue scenario: curve shocks keep "
                    "the Z-spread fixed, and spread shocks keep the zero curve fixed. Prices are "
                    "repriced from cash flows.",
                )
            )
            curve_col, spread_col = st.columns(2)
            for column, scenario_key, title in (
                (
                    curve_col,
                    "reference_curve",
                    text("Choc de courbe zéro", "Zero-curve shock"),
                ),
                (
                    spread_col,
                    "credit_spread",
                    text("Choc de Z-spread", "Z-spread shock"),
                ),
            ):
                with column:
                    st.markdown(f"**{title}**")
                    scenario_rows = stress[scenario_key]
                    shock_key = (
                        "curve_shock_bps"
                        if scenario_key == "reference_curve"
                        else "spread_shock_bps"
                    )
                    scenario_frame = pd.DataFrame(
                        [
                            {
                                text("Choc (pb)", "Shock (bps)"): row[shock_key],
                                text("Prix clean", "Clean price"): round(
                                    row["clean_price"], 4
                                ),
                                text("Variation", "Change"): round(
                                    row["clean_price_change"], 4
                                ),
                                text("YTM (%)", "YTM (%)"): round(
                                    row["implied_ytm"] * 100, 4
                                ),
                            }
                            for row in scenario_rows
                        ]
                    )
                    st.dataframe(
                        scenario_frame,
                        hide_index=True,
                        alt=text(
                            f"Prix et rendement sous chocs de {title.lower()}.",
                            f"Price and yield under {title.lower()} scenarios.",
                        ),
                    )
        st.caption(
            text(
                f"{result['comparables_used_count']} comparable(s) utilisé(s) : "
                + ", ".join(result["comparables_used"]),
                f"{result['comparables_used_count']} comparable(s) used: "
                + ", ".join(result["comparables_used"]),
            )
        )
    else:
        st.info(
            text(
                "Aucun résultat de valorisation pour cette date.",
                "No valuation result for this date.",
            )
        )

    selected = date_report["selected"]
    if selected:
        st.caption(
            text(
                f"{len(selected)} comparable(s) retenu(s) par score de similarité.",
                f"{len(selected)} comparable(s) selected by similarity score.",
            )
        )
        display = pd.DataFrame(
            [
                {
                    "ISIN": item.get("isin"),
                    text("Émetteur", "Issuer"): item.get("issuer"),
                    text("Notation", "Rating"): item.get("rating"),
                    text("Séniorité", "Seniority"): item.get("seniority"),
                    text("Échéance", "Maturity"): item.get("maturity_date"),
                    text("Coupon (%)", "Coupon (%)"): item.get("coupon_rate_pct"),
                    "YTM (%)": item.get("yield_to_maturity_pct"),
                    text("Prix clean", "Clean price"): item.get("clean_price"),
                    text("Z-spread (pb)", "Z-spread (bps)"): item.get("z_spread_bps"),
                    text("Similarité", "Similarity"): item.get("similarity_score"),
                    text("Statut données", "Data status"): item.get("data_status"),
                }
                for item in selected
            ]
        )
        st.dataframe(display, hide_index=True, width="stretch")
        for item in selected:
            notes = item.get("z_spread_notes") or []
            if notes:
                st.caption(f"• {item.get('isin')} : {'; '.join(notes)}")

    excluded = date_report["excluded"]
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

    with st.expander(text("Méthodologie", "Methodology")):
        st.write(date_report["methodology"])
        st.caption(
            text(
                "Yield = taux zéro à maturité (courbe zéro EUR bootstrapée depuis les "
                "swaps EUR 6M au pair) + Z-spread pondéré des comparables.",
                "Yield = zero rate at maturity (EUR zero curve bootstrapped from "
                "EUR 6M par swaps) + weighted Z-spread of comparables.",
            )
        )


def _render_judge(report: dict[str, Any]) -> None:
    st.markdown(f"#### {text('Agent juge indépendant', 'Independent judge agent')}")
    st.caption(
        text(
            "Le juge challenge les preuves et les limites de la valorisation à deux "
            "dates ; il ne choisit pas les comparables et ne modifie aucun calcul. "
            "L'appel transmet à Mistral les caractéristiques de la cible, les "
            "comparables retenus avec leur Z-spread et les résultats.",
            "The judge challenges the evidence and limits of the two-date valuation; "
            "it does not select comparables or change any calculation. The Mistral "
            "request sends the target characteristics, the selected comparables with "
            "their Z-spread, and the results.",
        )
    )
    consent = st.checkbox(
        text(
            "J'autorise l'envoi de ces données à Mistral pour la revue contradictoire.",
            "I authorize sending this data to Mistral for an independent review.",
        ),
        key="cas3_mistral_consent",
    )
    if st.button(
        text("Lancer le challenge", "Run challenge"),
        key="cas3_run_judge",
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
            "no_critical_issue": text(
                "Aucun problème critique détecté", "No critical issue detected"
            ),
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
        file_name="rapport_zspread_deux_dates.json",
        mime="application/json",
        key="cas3_download_report",
    )
    recipient = os.environ.get(
        "AUDIT_EMAIL_TO", DEFAULT_AUDIT_RECIPIENT
    ).strip()
    consent = st.checkbox(
        text(
            f"Je confirme l'envoi du rapport à {recipient}.",
            f"I confirm sending the report to {recipient}.",
        ),
        key="cas3_email_consent",
    )
    if st.button(
        text("Envoyer le rapport d'audit", "Send audit report"),
        key="cas3_send_audit",
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
                text(
                    "Rapport transmis à la boîte d'audit.",
                    "Report sent to the audit mailbox.",
                )
            )


def _apply_pending_extraction() -> None:
    """Appliquer l'extraction NLP en attente aux champs du formulaire (avant leur rendu)."""
    pending = st.session_state.pop(EXTRACT_KEY, None)
    if pending is None:
        return
    target = pending.get("target") or {}
    mapping: dict[str, Any] = {
        "cas3_target_issuer": target.get("issuer"),
        "cas3_target_isin": target.get("isin"),
        "cas3_target_sector": target.get("sector"),
        "cas3_target_rating": target.get("rating"),
        "cas3_target_seniority": target.get("seniority"),
        "cas3_target_currency": target.get("currency"),
        "cas3_target_coupon_rate": target.get("coupon_pct"),
        "cas3_target_nominal": target.get("nominal"),
        "cas3_target_frequency": target.get("frequency"),
    }
    maturity = target.get("maturity_date")
    if maturity:
        mapping["cas3_target_maturity"] = date.fromisoformat(str(maturity)[:10])
    observation_dates = target.get("observation_dates")
    if observation_dates and len(observation_dates) == 2:
        mapping["cas3_obs_date_1"] = date.fromisoformat(str(observation_dates[0])[:10])
        mapping["cas3_obs_date_2"] = date.fromisoformat(str(observation_dates[1])[:10])
    for key, value in mapping.items():
        if value is not None:
            st.session_state[key] = value
    st.session_state[EXTRACT_RESULT_KEY] = pending


def render_pipeline() -> None:
    st.subheader(
        text(
            "Pricing d'une nouvelle obligation — Z-spread et yield à deux dates",
            "New bond pricing — Z-spread and yield at two dates",
        )
    )
    st.caption(
        text(
            "Cas d'usage #3 : à partir d'un panel de comparables dont les sources "
            "sont déclarées official, et de la courbe zéro EUR (bootstrapée depuis "
            "les swaps EUR 6M "
            "au pair), estimer le Z-spread et le yield de la nouvelle obligation à "
            "chacune des deux dates d'observation. Le statut official n'est pas "
            "vérifié indépendamment. Yield = taux zéro + Z-spread.",
            "Use case #3: from comparables whose source status is declared official "
            "and the EUR zero curve (bootstrapped from EUR 6M par swaps), estimate "
            "the new bond's Z-spread and yield at each observation date. Official "
            "status is not independently verified. Yield = zero rate + Z-spread.",
        )
    )

    _apply_pending_extraction()

    today = date.today()
    first_date = st.date_input(
        text("Première date d'observation", "First observation date"),
        today - timedelta(days=3),
        key="cas3_obs_date_1",
    )
    second_date = st.date_input(
        text("Seconde date d'observation", "Second observation date"),
        today - timedelta(days=1),
        key="cas3_obs_date_2",
    )
    curve_source_filter = st.text_input(
        text(
            "Source de courbe à charger (facultatif, nom exact)",
            "Curve source to load (optional, exact name)",
        ),
        key="cas3_swap_curve_source",
    )
    if st.button(
        text(
            "Charger les courbes swap de la base pour ces deux dates",
            "Load swap curves from the database for these two dates",
        ),
        key="cas3_load_curves",
    ):
        try:
            curve_sets = list_swap_curve_sets(
                source_name=curve_source_filter.strip() or None
            )
        except DatabaseConfigurationError as exc:
            st.error(str(exc))
        except psycopg.Error as exc:
            st.error(
                text(
                    f"Lecture des courbes swap impossible : {exc}",
                    f"Unable to read swap curves: {exc}",
                )
            )
        else:
            requested_dates = (first_date, second_date)
            selected_sets = {
                observation_date: [
                    curve_set
                    for curve_set in curve_sets
                    if curve_set["curve_date"] == observation_date
                ]
                for observation_date in requested_dates
            }
            ambiguous_dates = [
                observation_date.isoformat()
                for observation_date, matching_sets in selected_sets.items()
                if len(matching_sets) > 1
            ]
            if ambiguous_dates:
                st.error(
                    text(
                        "Plusieurs sources existent pour : "
                        + ", ".join(ambiguous_dates)
                        + ". Indiquez le nom exact d'une source.",
                        "Multiple sources exist for: "
                        + ", ".join(ambiguous_dates)
                        + ". Enter an exact source name.",
                    )
                )
                return

            curves = {
                observation_date.isoformat(): matching_sets[0]["points"]
                for observation_date, matching_sets in selected_sets.items()
                if matching_sets
            }
            metadata = {
                observation_date.isoformat(): {
                    "source_name": matching_sets[0]["source_name"],
                    "data_status": matching_sets[0]["data_status"],
                    "market_date": matching_sets[0]["curve_date"],
                }
                for observation_date, matching_sets in selected_sets.items()
                if matching_sets
            }
            st.session_state[CURVES_KEY] = curves
            st.session_state[CURVE_METADATA_KEY] = metadata
            loaded = list(curves)
            if loaded:
                st.success(
                    text(
                        "Courbes chargées : "
                        + ", ".join(
                            f"{iso_date} ({metadata[iso_date]['source_name']}, "
                            f"{metadata[iso_date]['data_status']})"
                            for iso_date in loaded
                        ),
                        "Curves loaded: "
                        + ", ".join(
                            f"{iso_date} ({metadata[iso_date]['source_name']}, "
                            f"{metadata[iso_date]['data_status']})"
                            for iso_date in loaded
                        ),
                    )
                )
            else:
                st.warning(
                    text(
                        "Aucune courbe swap en base pour ces dates ; courbe par défaut proposée.",
                        "No swap curve in the database for these dates; default curve proposed.",
                    )
                )

    st.markdown(
        f"##### {text('01 — Analyser la demande', '01 — Analyze the request')}"
    )
    request_text = st.text_area(
        text(
            "Demande de pricing en langage naturel (ex. « pricer une obligation émise "
            "par Acme, corporate, BB+, coupon 4,5 % semestriel, échéance 15/10/2031, "
            "EUR, aux dates d'observation 24/10/2026 et 26/10/2026 »)",
            "Natural-language pricing request (e.g. 'price a bond issued by Acme, "
            "corporate, BB+, 4.5% semi-annual coupon, maturity 2031-10-15, EUR, "
            "observed on 2026-10-24 and 2026-10-26')",
        ),
        key="cas3_request_text",
        height=90,
    )
    if st.button(
        text("Extraire les caractéristiques", "Extract characteristics"),
        key="cas3_extract",
    ):
        try:
            extraction = extract_target(request_text)
        except ValueError as exc:
            st.error(str(exc))
        else:
            st.session_state[EXTRACT_KEY] = extraction
            st.rerun()

    extraction = st.session_state.get(EXTRACT_RESULT_KEY)
    if extraction:
        extractor = extraction.get("extractor", "")
        st.caption(
            text(
                f"Extraction effectuée ({extractor}) — vérifiez les champs pré-remplis ci-dessous.",
                f"Extraction done ({extractor}) — check the pre-filled fields below.",
            )
        )
        missing = extraction.get("missing_fields") or []
        if missing:
            st.warning(
                text(
                    "Champs non extraits de la demande, à renseigner manuellement : "
                    + ", ".join(missing),
                    "Fields not extracted from the request, to fill in manually: "
                    + ", ".join(missing),
                )
            )
        if extraction.get("fallback_reason"):
            st.caption(
                text(
                    "Repli sur l'extracteur local : " + str(extraction["fallback_reason"]),
                    "Fell back to the local extractor: " + str(extraction["fallback_reason"]),
                )
            )

    with st.form("cas3_pipeline_form"):
        left, right = st.columns(2)
        with left:
            issuer = st.text_input(
                text("Émetteur cible", "Target issuer"),
                key="cas3_target_issuer",
            )
            isin = st.text_input("ISIN", key="cas3_target_isin")
            sector = st.text_input(
                text("Secteur / type d'émetteur", "Sector / issuer type"),
                key="cas3_target_sector",
            )
            rating = st.text_input(
                text("Notation", "Rating"), key="cas3_target_rating"
            )
            seniority = st.text_input(
                text("Séniorité", "Seniority"), key="cas3_target_seniority"
            )
            currency = st.text_input(
                text("Devise", "Currency"),
                value="EUR",
                max_chars=3,
                key="cas3_target_currency",
            )
        with right:
            maturity = st.date_input(
                text("Maturité cible", "Target maturity"),
                today + timedelta(days=365 * 5),
                min_value=today + timedelta(days=1),
                max_value=date(2200, 12, 31),
                key="cas3_target_maturity",
            )
            coupon_rate = st.number_input(
                text("Coupon annuel (%)", "Annual coupon (%)"),
                min_value=0.0,
                value=3.0,
                step=0.05,
                key="cas3_target_coupon_rate",
            )
            issue_spread_adjustment_bps = st.number_input(
                text(
                    "Ajustement d'émission vs juste valeur (pb)",
                    "Issue adjustment versus fair value (bps)",
                ),
                value=0.0,
                step=1.0,
                key="cas3_issue_spread_adjustment_bps",
                help=text(
                    "Hypothèse explicite de l'utilisateur. Une valeur positive élargit le Z-spread ; "
                    "une valeur négative le resserre.",
                    "Explicit user assumption. Positive values widen the Z-spread; negative values tighten it.",
                ),
            )
            nominal = st.number_input(
                text("Nominal (%)", "Nominal (%)"),
                min_value=0.01,
                value=100.0,
                step=10.0,
                key="cas3_target_nominal",
            )
            frequency = st.selectbox(
                text("Fréquence des coupons (par an)", "Coupon frequency (per year)"),
                (1, 2, 4, 12),
                index=1,
                key="cas3_target_frequency",
            )
            bond_type = st.selectbox(
                text("Type d'obligation", "Bond type"),
                ("Fixed", "Floating", "Zero Coupon"),
                key="cas3_target_bond_type",
            )
            coupon_type = st.selectbox(
                text("Type de coupon", "Coupon type"),
                ("Fixed", "Floating", "Zero Coupon"),
                key="cas3_target_coupon_type",
            )
        st.caption(
            text(
                "Swaps EUR 6M au pair, une ligne par point « années;taux % » "
                "(ex. « 1;2.20 »). La courbe zéro est bootstrapée depuis ces taux.",
                "EUR 6M par swaps, one line per point 'years;rate %' "
                "(e.g. '1;2.20'). The zero curve is bootstrapped from these rates.",
            )
        )
        swap_text_1 = st.text_area(
            text("Swaps — première date", "Swaps — first date")
            + f" ({first_date.isoformat()})",
            value=_swap_text_for(first_date),
            key=f"cas3_swaps_{first_date.isoformat()}",
            height=140,
        )
        swap_text_2 = st.text_area(
            text("Swaps — seconde date", "Swaps — second date")
            + f" ({second_date.isoformat()})",
            value=_swap_text_for(second_date),
            key=f"cas3_swaps_{second_date.isoformat()}",
            height=140,
        )
        submitted = st.form_submit_button(
            text("Estimer le Z-spread et le yield", "Estimate Z-spread and yield"),
            type="primary",
            key="cas3_run_pipeline",
        )

    if submitted:
        if first_date >= second_date:
            st.error(
                text(
                    "La seconde date doit être postérieure à la première.",
                    "The second date must be after the first.",
                )
            )
            return
        if currency.strip().upper() != "EUR":
            st.error(
                text(
                    "Ce pipeline ne traite que les obligations en EUR.",
                    "This pipeline only handles EUR bonds.",
                )
            )
            return
        try:
            swap_points_1 = _parse_swap_text(swap_text_1)
            swap_points_2 = _parse_swap_text(swap_text_2)
            curves = {
                first_date: bootstrap_zero_curve(swap_points_1),
                second_date: bootstrap_zero_curve(swap_points_2),
            }
        except ValueError as exc:
            st.error(str(exc))
            return
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
        target = PipelineTarget(
            isin=isin.strip(),
            issuer=issuer.strip(),
            sector=sector.strip(),
            rating=rating.strip(),
            seniority=seniority.strip(),
            currency=currency.strip().upper(),
            maturity_date=maturity,
            coupon=coupon_rate / 100,
            nominal=nominal,
            frequency=int(frequency),
            bond_type=bond_type,
            coupon_type=coupon_type,
        )
        try:
            report = run_pricing_pipeline(
                target,
                candidates,
                curves,
                [first_date, second_date],
                limit=MAX_CANDIDATES,
                issue_spread_adjustment_bps=issue_spread_adjustment_bps,
                curve_provenance={
                    first_date: _curve_provenance_for_input(
                        first_date, swap_text_1, swap_points_1
                    ),
                    second_date: _curve_provenance_for_input(
                        second_date, swap_text_2, swap_points_2
                    ),
                },
            )
        except ValueError as exc:
            st.error(str(exc))
            return
        st.session_state[REPORT_KEY] = report
        st.session_state.pop(JUDGE_KEY, None)
        st.session_state.pop("cas3_mistral_consent", None)
        st.session_state.pop("cas3_email_consent", None)

    report = st.session_state.get(REPORT_KEY)
    if not report:
        return

    tabs = st.tabs(
        [
            f"{text('Date 1', 'Date 1')} · {report['observation_dates'][0]}",
            f"{text('Date 2', 'Date 2')} · {report['observation_dates'][1]}",
        ]
    )
    for tab, iso_date in zip(tabs, report["observation_dates"]):
        with tab:
            _render_date_result(
                iso_date,
                report["dates"][iso_date],
                report["target"]["currency"],
                report["target"]["nominal"],
            )

    _render_judge(report)
    _render_audit_delivery(report)
