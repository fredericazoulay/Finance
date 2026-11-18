"""Comparateur synoptique d'obligations — inspiré de l'onglet « Comparateur » du frontend
(matrice côte-à-côte, simulateur de choc de taux, statut de relative value, export CSV)."""

from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd
import psycopg
import streamlit as st

from curve import SwapPoint, bootstrap_zero_curve, zero_rate_function
from database import (
    DatabaseConfigurationError,
    list_market_observations,
    list_swap_curves,
)
from localization import text
from pricing import DayCount, bond_price
from sensitivities import (
    bond_metrics,
    rate_shock,
    rating_bucket,
    relative_value_status,
)

MATRIX_KEY = "comparator_matrix"
SHOCK_KEY = "comparator_shock_results"
PENDING_SHOCK_KEY = "comparator_pending_shock"
MAX_BONDS = 5

DEFAULT_SWAPS = [
    SwapPoint(years, rate)
    for years, rate in (
        (0.5, 0.02), (1.0, 0.022), (2.0, 0.025), (3.0, 0.028),
        (5.0, 0.032), (7.0, 0.035), (10.0, 0.038),
    )
]

SHOCK_PRESETS = (-100, -50, 0, 50, 100, 200)


def _day_count(value: Any) -> DayCount:
    try:
        return DayCount(str(value).strip().upper())
    except ValueError:
        return DayCount.ACT_ACT


def _par_rate_fn(points: list[SwapPoint]):
    """Interpolation linéaire des taux swap au pair par maturité (I-spread)."""
    ordered = sorted(points, key=lambda p: p.years)

    def fn(years: float) -> float:
        if years <= ordered[0].years:
            return ordered[0].par_rate
        if years >= ordered[-1].years:
            return ordered[-1].par_rate
        for lower, upper in zip(ordered, ordered[1:]):
            if lower.years <= years <= upper.years:
                weight = (years - lower.years) / (upper.years - lower.years)
                return lower.par_rate + weight * (upper.par_rate - lower.par_rate)
        return ordered[-1].par_rate

    return fn


def _curves() -> tuple[Any, Any, str]:
    """Courbe zéro (bootstrap swaps) et taux au pair, depuis la base ou par défaut."""
    try:
        stored = list_swap_curves()
    except (DatabaseConfigurationError, psycopg.Error) as exc:
        st.warning(
            text(
                f"Lecture des courbes impossible : {exc}. Courbe de démonstration utilisée.",
                f"Unable to read curves: {exc}. Using a demonstration curve.",
            )
        )
        stored = {}
    if stored:
        curve_date = max(stored)
        points = stored[curve_date]
        return (
            zero_rate_function(bootstrap_zero_curve(points)),
            _par_rate_fn(points),
            curve_date.isoformat(),
        )
    return (
        zero_rate_function(bootstrap_zero_curve(DEFAULT_SWAPS)),
        _par_rate_fn(DEFAULT_SWAPS),
        "default",
    )


def _observation_view(obs: dict[str, Any]) -> dict[str, Any]:
    settlement = obs.get("market_date") or date.today()
    coupon_pct = obs.get("coupon_rate_pct")
    frequency = obs.get("payment_frequency") or 2
    if frequency not in (1, 2, 4, 12):
        frequency = 2
    coupon = float(coupon_pct) / 100 if coupon_pct is not None else None
    maturity = obs.get("maturity_date")
    ytm_pct = obs.get("yield_to_maturity_pct")
    clean_price = obs.get("clean_price")
    dirty_price = None
    ytm = None
    if ytm_pct is not None:
        ytm = float(ytm_pct) / 100
    elif (
        clean_price is not None
        and coupon is not None
        and isinstance(maturity, date)
        and settlement < maturity
        and maturity.year < 9999
    ):
        try:
            accrued = bond_price(
                coupon, 0, settlement, maturity, 100.0, frequency, _day_count(obs.get("day_count"))
            )["accrued_interest"]
        except ValueError:
            accrued = 0.0
        dirty_price = float(clean_price) + accrued
    return {
        "settlement": settlement,
        "maturity": maturity,
        "coupon": coupon,
        "frequency": frequency,
        "day_count": _day_count(obs.get("day_count")),
        "ytm": ytm,
        "dirty_price": dirty_price,
    }


def _metrics_for(
    obs: dict[str, Any], zero_fn, par_fn
) -> dict[str, Any] | None:
    view = _observation_view(obs)
    if view["coupon"] is None or not isinstance(view["maturity"], date):
        return None
    if view["maturity"] <= view["settlement"] or view["maturity"].year >= 9999:
        return None
    if view["ytm"] is None and view["dirty_price"] is None:
        return None
    years = (view["maturity"] - view["settlement"]).days / 365
    is_eur = str(obs.get("currency") or "").upper() == "EUR"
    try:
        return bond_metrics(
            settlement_date=view["settlement"],
            maturity_date=view["maturity"],
            coupon=view["coupon"],
            nominal=100.0,
            frequency=view["frequency"],
            day_count=view["day_count"],
            ytm=view["ytm"],
            dirty_price=view["dirty_price"],
            zero_fn=zero_fn if is_eur else None,
            swap_rate_at_maturity=par_fn(years) if is_eur else None,
        )
    except ValueError:
        return None


def _peer_z_spreads(
    obs: dict[str, Any],
    observations: list[dict[str, Any]],
    zero_fn,
    par_fn,
    metrics_cache: dict[str, dict[str, Any]],
) -> list[float]:
    """Z-spreads des pairs : même seau de notation, maturité à ± 2 ans."""
    maturity = obs.get("maturity_date")
    if not isinstance(maturity, date):
        return []
    bucket = rating_bucket(obs.get("rating"))
    peers: list[float] = []
    for other in observations:
        if str(other.get("isin") or "") == str(obs.get("isin") or ""):
            continue
        if rating_bucket(other.get("rating")) != bucket:
            continue
        if other.get("currency") != obs.get("currency"):
            continue
        other_maturity = other.get("maturity_date")
        if not isinstance(other_maturity, date):
            continue
        if abs((other_maturity - maturity).days) / 365 > 2:
            continue
        metrics = metrics_cache.get(str(other.get("isin")))
        if metrics and metrics.get("z_spread_bps") is not None:
            peers.append(metrics["z_spread_bps"])
    return peers


def _bond_label(obs: dict[str, Any]) -> str:
    return (
        f"{obs.get('isin') or '?'} · {obs.get('issuer') or obs.get('name') or '?'} "
        f"· {obs.get('rating') or 'NR'}"
    )


def build_matrix(
    selected: list[dict[str, Any]],
    observations: list[dict[str, Any]],
    zero_fn,
    par_fn,
) -> dict[str, Any]:
    """Construire la matrice comparative : sections -> critère -> {titre: valeur}."""
    metrics_cache: dict[str, dict[str, Any]] = {}
    for obs in selected:
        isin = str(obs.get("isin") or "")
        if isin and isin not in metrics_cache:
            metrics_cache[isin] = _metrics_for(obs, zero_fn, par_fn) or {}

    for other in observations:
        isin = str(other.get("isin") or "")
        maturity = other.get("maturity_date")
        if not isin or isin in metrics_cache or not isinstance(maturity, date):
            continue
        if any(
            metrics_cache.get(str(obs.get("isin") or ""), {}).get("z_spread_bps") is not None
            and other.get("currency") == obs.get("currency")
            and rating_bucket(other.get("rating")) == rating_bucket(obs.get("rating"))
            and isinstance(obs.get("maturity_date"), date)
            and abs((maturity - obs["maturity_date"]).days) <= 2 * 365
            for obs in selected
        ):
            metrics_cache[isin] = _metrics_for(other, zero_fn, par_fn) or {}

    bonds: dict[str, dict[str, Any]] = {}
    for obs in selected:
        label = _bond_label(obs)
        metrics = metrics_cache.get(str(obs.get("isin")), {})
        z_bps = metrics.get("z_spread_bps")
        rv = (
            relative_value_status(z_bps, _peer_z_spreads(obs, observations, zero_fn, par_fn, metrics_cache))
            if z_bps is not None
            else None
        )
        frequency = obs.get("payment_frequency") or 2
        freq_label = {1: "Annuel", 2: "Semestriel", 4: "Trimestriel", 12: "Mensuel"}.get(
            frequency, str(frequency)
        )
        esg_labels = [
            name
            for name, flag in (
                ("Green", obs.get("is_green_bond")),
                ("Social", obs.get("is_social_bond")),
                ("Sustainability", obs.get("is_sustainability_bond")),
                ("SLB", obs.get("is_sustainability_linked")),
            )
            if flag
        ]
        rating = str(obs.get("rating") or "")
        bucket = rating_bucket(rating)
        grade = "High Yield" if bucket in ("B", "C", "D") else "Investment Grade"
        bonds[label] = {
            "obs": obs,
            "metrics": metrics,
            "rv": rv,
            "rows": {
                "Émetteur": obs.get("issuer"),
                "ISIN": obs.get("isin"),
                "Devise": obs.get("currency"),
                "Secteur": obs.get("issuer_type") or obs.get("sector"),
                "Notation": f"{rating or 'Non notée'} ({grade})" if rating else "Non notée",
                "Séniorité": obs.get("seniority") or "Senior Unsecured",
                "Label ESG": ", ".join(esg_labels) if esg_labels else "Standard",
                "Échéance": (
                    f"{obs.get('maturity_date')} ({metrics['years_to_maturity']:.1f} ans)"
                    if metrics else obs.get("maturity_date")
                ),
                "Prix clean (%)": round(metrics["clean_price"], 4) if metrics else None,
                "Intérêts courus": round(metrics["accrued_interest"], 4) if metrics else None,
                "Prix dirty": round(metrics["dirty_price"], 4) if metrics else None,
                "Coupon annuel": (
                    f"{float(obs['coupon_rate_pct']):.3f} % ({freq_label})"
                    if obs.get("coupon_rate_pct") is not None else None
                ),
                "YTM (%)": round(metrics["ytm"] * 100, 4) if metrics else None,
                "Rendement courant (%)": (
                    round(metrics["current_yield"] * 100, 4)
                    if metrics and metrics["current_yield"] is not None else None
                ),
                "Écart YTM / zéro EUR (bp)": metrics.get("g_spread_bps"),
                "I-Spread (bp)": metrics.get("i_spread_bps"),
                "Z-Spread (bp)": metrics.get("z_spread_bps"),
                "Duration Macaulay (ans)": round(metrics["macaulay_duration"], 4) if metrics else None,
                "Duration modifiée (ans)": round(metrics["modified_duration"], 4) if metrics else None,
                "Convexité": round(metrics["convexity"], 4) if metrics else None,
                "DV01 (pour 100k)": round(metrics["dv01_per_100k"], 2) if metrics else None,
                "Ratio YTM/Dur. (%/an)": round(
                    metrics["ytm"] * 100 / metrics["modified_duration"], 4
                ) if metrics and metrics["modified_duration"] else None,
                "Statut RV": (
                    f"{rv['status']} ({rv['residue_bps']:+.0f} bp vs {rv['peer_count']} pair(s))"
                    if rv and rv["peer_count"] else None
                ),
            },
        }

    sections = {
        "Identification & structure": [
            "Émetteur", "ISIN", "Devise", "Secteur", "Notation", "Séniorité",
            "Label ESG", "Échéance",
        ],
        "Valorisation de marché & coupon": [
            "Prix clean (%)", "Intérêts courus", "Prix dirty", "Coupon annuel",
        ],
        "Rendements & spreads": [
            "YTM (%)", "Rendement courant (%)", "Écart YTM / zéro EUR (bp)", "I-Spread (bp)",
            "Z-Spread (bp)",
        ],
        "Sensibilités aux taux": [
            "Duration Macaulay (ans)", "Duration modifiée (ans)", "Convexité",
            "DV01 (pour 100k)",
        ],
        "Relative value": ["Ratio YTM/Dur. (%/an)", "Statut RV"],
    }
    matrix = {
        section: {
            criterion: {label: bond["rows"].get(criterion) for label, bond in bonds.items()}
            for criterion in criteria
        }
        for section, criteria in sections.items()
    }
    return {"sections": sections, "matrix": matrix, "bonds": bonds}


def _apply_pending_shock() -> None:
    pending = st.session_state.pop(PENDING_SHOCK_KEY, None)
    if pending is not None:
        st.session_state["comparator_shock_bps"] = pending


def render_comparator() -> None:
    st.subheader(
        text("Comparateur synoptique d'obligations", "Bond synoptic comparator")
    )
    st.caption(
        text(
            "Sélectionnez jusqu'à 5 titres du référentiel marché pour une matrice "
            "comparative côte-à-côte (identification, valorisation, rendements et "
            "spreads, sensibilités, relative value), puis simulez un choc de taux : "
            "ΔP/P ≈ -D_mod × Δy + ½ × Conv × (Δy)².",
            "Select up to 5 bonds from the market reference for a side-by-side "
            "comparison matrix (identification, valuation, yields and spreads, "
            "sensitivities, relative value), then simulate a rate shock: "
            "ΔP/P ≈ -D_mod × Δy + ½ × Conv × (Δy)².",
        )
    )

    _apply_pending_shock()

    try:
        observations = list_market_observations()
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
    if not observations:
        st.info(text("Aucun titre dans le référentiel.", "No bond in the reference."))
        return

    zero_fn, par_fn, curve_label = _curves()
    st.caption(
        text(
            f"Courbe de référence : swaps EUR au pair ({curve_label}), bootstrapée en taux zéro.",
            f"Reference curve: EUR par swaps ({curve_label}), bootstrapped to zero rates.",
        )
    )
    if curve_label == "default":
        st.warning(
            text(
                "Courbe de démonstration non datée : résultats indicatifs, pas des données de marché.",
                "Undated demonstration curve: indicative results, not market data.",
            )
        )

    options = {
        _bond_label(obs): obs
        for obs in observations
        if obs.get("isin")
    }
    selected_labels = st.multiselect(
        text(
            f"Titres à comparer (max {MAX_BONDS})",
            f"Bonds to compare (max {MAX_BONDS})",
        ),
        options=list(options.keys()),
        max_selections=MAX_BONDS,
        key="comparator_selected",
        format_func=lambda label: label,
    )
    selected = [options[label] for label in selected_labels]
    if len(selected) < 2:
        st.session_state.pop(MATRIX_KEY, None)
        st.session_state.pop(SHOCK_KEY, None)
        st.info(
            text(
                "Sélectionnez au moins 2 obligations pour afficher la matrice comparative.",
                "Select at least 2 bonds to display the comparison matrix.",
            )
        )
        return

    report = build_matrix(selected, observations, zero_fn, par_fn)
    st.session_state[MATRIX_KEY] = report
    bonds = report["bonds"]
    unavailable = [label for label, bond in bonds.items() if not bond["metrics"]]
    if unavailable:
        st.warning(
            text(
                "Métriques indisponibles pour les titres échus ou sans données suffisantes : ",
                "Metrics unavailable for matured bonds or bonds with insufficient data: ",
            )
            + ", ".join(unavailable)
        )
    if any(str(bond["obs"].get("currency") or "").upper() != "EUR" for bond in bonds.values()):
        st.caption(
            text(
                "Les spreads sur la courbe EUR ne sont pas calculés pour les titres non libellés en EUR.",
                "EUR curve spreads are not calculated for non-EUR bonds.",
            )
        )

    for section, criteria in report["sections"].items():
        st.markdown(f"**{section}**")
        frame = pd.DataFrame(report["matrix"][section]).transpose().astype("string").fillna("—")
        st.dataframe(frame, width="stretch")

    csv_buffer = io_csv(report)
    st.download_button(
        text("Exporter la matrice en CSV", "Export matrix as CSV"),
        data=csv_buffer,
        file_name="comparateur_obligations.csv",
        mime="text/csv",
        key="comparator_export_csv",
    )

    st.markdown(f"#### {text('Simulateur de choc de taux', 'Rate shock simulator')}")
    invested = st.number_input(
        text("Nominal investi", "Invested amount"),
        min_value=1000.0,
        value=100_000.0,
        step=5000.0,
        key="comparator_invested",
    )
    shock = st.slider(
        text("Choc de taux (bp)", "Rate shock (bps)"),
        min_value=-300,
        max_value=300,
        value=0,
        step=10,
        key="comparator_shock_bps",
    )
    preset_cols = st.columns(len(SHOCK_PRESETS))
    for col, preset in zip(preset_cols, SHOCK_PRESETS):
        if col.button(f"{preset:+d} bp", key=f"comparator_preset_{preset}"):
            st.session_state[PENDING_SHOCK_KEY] = preset
            st.rerun()

    shock_rows = []
    for label, bond in bonds.items():
        metrics = bond["metrics"]
        if not metrics:
            continue
        result = rate_shock(
            modified_duration=metrics["modified_duration"],
            convexity=metrics["convexity"],
            clean_price=metrics["clean_price"],
            shock_bps=shock,
            invested_amount=invested,
        )
        shock_rows.append(
            {
                "Titre": label,
                "ΔP/P (%)": round(result["pct_change"] * 100, 4),
                "Impact (montant)": round(result["monetary_change"], 2),
                "Nouveau prix (%)": round(result["new_price"], 4),
            }
        )
    st.session_state[SHOCK_KEY] = shock_rows
    if shock_rows:
        shock_frame = pd.DataFrame(shock_rows)
        st.dataframe(shock_frame, width="stretch", hide_index=True)
        st.bar_chart(shock_frame, x="Titre", y="ΔP/P (%)")
    else:
        st.info(text("Aucun titre calculable pour le choc de taux.", "No bond can be calculated for the rate shock."))


def io_csv(report: dict[str, Any]) -> str:
    import csv
    import io

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    labels = list(report["bonds"].keys())
    writer.writerow(["Critère"] + labels)
    for section, criteria in report["sections"].items():
        writer.writerow([section.upper()])
        for criterion in criteria:
            writer.writerow(
                [criterion] + [report["matrix"][section][criterion].get(label) for label in labels]
            )
    return buffer.getvalue()
