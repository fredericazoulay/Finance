"""Terminal de marché inspiré des écrans Bloomberg du frontend :
finder SECF (filtres + recherche), fiche DES (description) et écran YAS
(rendement, spreads, sensibilités, relative value), plus un graphique Z-spread."""

from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd
import psycopg
import streamlit as st

from comparator_ui import (
    DEFAULT_SWAPS,
    _bond_label,
    _curves,
    _metrics_for,
    _observation_view,
)
from database import DatabaseConfigurationError, list_market_observations
from localization import text
from sensitivities import rating_bucket, relative_value_status

FILTERED_KEY = "terminal_filtered"
METRICS_KEY = "terminal_metrics"
CHART_KEY = "terminal_chart"
MAX_CHART_POINTS = 400

_FINDER_COLUMNS = [
    "isin", "issuer", "issuer_type", "rating", "seniority", "currency",
    "maturity_date", "coupon_rate_pct", "yield_to_maturity_pct", "clean_price",
    "spread_bps", "market_date", "data_status", "source_name",
]


def _filter_observations(
    observations: list[dict[str, Any]],
    *,
    search: str,
    currency: str,
    rating: str,
    sector: str,
    data_status: str,
    market_date: str,
) -> list[dict[str, Any]]:
    search = search.strip().casefold()
    filtered = []
    for obs in observations:
        if currency != "Toutes" and str(obs.get("currency") or "").upper() != currency:
            continue
        if rating != "Toutes" and str(obs.get("rating") or "") != rating:
            continue
        if data_status != "Tous" and str(obs.get("data_status") or "") != data_status:
            continue
        if market_date != "Toutes" and str(obs.get("market_date") or "") != market_date:
            continue
        if sector:
            sector_text = str(obs.get("issuer_type") or obs.get("sector") or "").casefold()
            if sector.strip().casefold() not in sector_text:
                continue
        if search:
            haystack = " ".join(
                str(obs.get(field) or "")
                for field in ("isin", "issuer", "name", "issuer_type", "rating", "source_name")
            ).casefold()
            if search not in haystack:
                continue
        filtered.append(obs)
    return filtered


def _chart_data(
    filtered: list[dict[str, Any]], zero_fn, par_fn
) -> pd.DataFrame:
    rows = []
    for obs in filtered:
        if len(rows) >= MAX_CHART_POINTS:
            break
        metrics = _metrics_for(obs, zero_fn, par_fn)
        if not metrics or metrics.get("z_spread_bps") is None:
            continue
        rows.append(
            {
                "years": round(metrics["years_to_maturity"], 3),
                "z_spread_bps": metrics["z_spread_bps"],
                "rating_bucket": rating_bucket(obs.get("rating")),
                "label": _bond_label(obs),
            }
        )
    return pd.DataFrame(rows)


def _render_des(obs: dict[str, Any]) -> None:
    st.markdown(f"#### DES — {text('Description du titre', 'Security description')}")
    fields = [
        ("ISIN", obs.get("isin")),
        ("Émetteur", obs.get("issuer")),
        ("Secteur / type", obs.get("issuer_type")),
        ("Devise", obs.get("currency")),
        ("Notation", obs.get("rating")),
        ("Agence", obs.get("rating_agency")),
        ("Séniorité", obs.get("seniority")),
        ("Type", obs.get("bond_type")),
        ("Coupon", f"{obs.get('coupon_rate_pct')} % · {obs.get('coupon_type')}"),
        ("Fréquence", obs.get("payment_frequency")),
        ("Convention", obs.get("day_count")),
        ("Échéance", obs.get("maturity_date")),
        ("Date de marché", obs.get("market_date")),
        ("YTM (%)", obs.get("yield_to_maturity_pct")),
        ("Prix clean (%)", obs.get("clean_price")),
        ("Spread source (bp)", obs.get("spread_bps")),
        ("ESG", obs.get("esg_score")),
        ("Green/Social/SLB", ", ".join(
            name for name, flag in (
                ("Green", obs.get("is_green_bond")),
                ("Social", obs.get("is_social_bond")),
                ("Sustainability", obs.get("is_sustainability_bond")),
                ("SLB", obs.get("is_sustainability_linked")),
            ) if flag
        ) or "—"),
        ("Callable", obs.get("is_callable")),
        ("Marché", obs.get("market")),
        ("Pays", obs.get("country")),
        ("Source", obs.get("source_name")),
        ("Fournisseur déclaré", obs.get("provider_claim")),
        ("Statut données", obs.get("data_status")),
    ]
    left, right = st.columns(2)
    for index, (label, value) in enumerate(fields):
        with (left if index % 2 == 0 else right):
            st.caption(f"**{label}** — {value if value not in (None, '') else '—'}")


def _render_yas(obs: dict[str, Any], metrics: dict[str, Any], rv: dict[str, Any] | None) -> None:
    st.markdown(f"#### YAS — {text('Rendement et spread', 'Yield and spread analysis')}")
    cols = st.columns(4)
    cols[0].metric("YTM (%)", f"{metrics['ytm'] * 100:.4f}")
    cols[1].metric(text("Prix clean", "Clean price"), f"{metrics['clean_price']:.4f}")
    cols[2].metric(text("Prix dirty", "Dirty price"), f"{metrics['dirty_price']:.4f}")
    cols[3].metric(text("Intérêts courus", "Accrued"), f"{metrics['accrued_interest']:.4f}")
    cols = st.columns(4)
    cols[0].metric(text("Écart YTM / zéro EUR (bp)", "YTM / EUR zero gap (bps)"), f"{metrics.get('g_spread_bps'):+.1f}" if metrics.get("g_spread_bps") is not None else "—")
    cols[1].metric("I-Spread (bp)", f"{metrics.get('i_spread_bps'):+.1f}" if metrics.get("i_spread_bps") is not None else "—")
    cols[2].metric("Z-Spread (bp)", f"{metrics.get('z_spread_bps'):+.1f}" if metrics.get("z_spread_bps") is not None else "—")
    cols[3].metric(text("Rendement courant (%)", "Current yield (%)"), f"{(metrics['current_yield'] or 0) * 100:.4f}")
    cols = st.columns(4)
    cols[0].metric(text("Duration modifiée (ans)", "Modified duration (y)"), f"{metrics['modified_duration']:.4f}")
    cols[1].metric(text("Duration Macaulay (ans)", "Macaulay duration (y)"), f"{metrics['macaulay_duration']:.4f}")
    cols[2].metric("Convexité", f"{metrics['convexity']:.4f}")
    cols[3].metric("DV01 / 100k", f"{metrics['dv01_per_100k']:.2f}")
    if rv and rv["peer_count"]:
        status = rv["status"]
        st.caption(
            text(
                f"Statut relative value : {status} ({rv['residue_bps']:+.0f} bp vs moyenne de "
                f"{rv['peer_count']} pair(s) même notation/maturité ±2 ans)",
                f"Relative value status: {status} ({rv['residue_bps']:+.0f} bps vs average of "
                f"{rv['peer_count']} peer(s) same rating/maturity ±2y)",
            )
        )
    else:
        st.caption(
            text(
                "Statut relative value indisponible : Z-spread ou pairs comparables absents.",
                "Relative value status unavailable: no Z-spread or comparable peers.",
            )
        )


def render_terminal() -> None:
    st.subheader(
        text("Terminal marché — SECF / DES / YAS", "Market terminal — SECF / DES / YAS")
    )
    st.caption(
        text(
            "Finder de titres (SECF) avec filtres, fiche de description (DES) et écran "
            "rendement & spread (YAS) calculés sur la courbe zéro EUR bootstrappée depuis "
            "les swaps au pair. Données du référentiel PostgreSQL.",
            "Security finder (SECF) with filters, description screen (DES) and yield & "
            "spread screen (YAS) computed on the EUR zero curve bootstrapped from par "
            "swaps. Data from the PostgreSQL reference.",
        )
    )

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
    if curve_label == "default":
        st.warning(
            text(
                "Courbe de démonstration non datée : résultats indicatifs, pas des données de marché.",
                "Undated demonstration curve: indicative results, not market data.",
            )
        )

    options = {_bond_label(obs): str(obs.get("isin") or "") for obs in observations if obs.get("isin")}
    if not options:
        st.info(text("Aucun titre avec ISIN dans le référentiel.", "No bond with an ISIN in the reference."))
        return
    choice = st.selectbox(
        text("Choisir un titre (DES / YAS)", "Pick a bond (DES / YAS)"),
        list(options),
        key="terminal_selected",
    )
    obs = next(o for o in observations if str(o.get("isin") or "") == options[choice])
    finder_tab, des_tab, yas_tab, chart_tab = st.tabs(
        ["SECF", "DES", "YAS", text("Graphique", "Chart")],
        key="terminal_screen",
        on_change="rerun",
    )
    if finder_tab.open:
        with finder_tab:
            st.markdown(f"#### SECF — {text('Security Finder', 'Security Finder')}")
            saved_filters = st.session_state.get("terminal_saved_filters", {})
            for key, value in saved_filters.items():
                st.session_state.setdefault(key, value)
            search = st.text_input(
                text("Recherche (émetteur, ISIN, notation, source…)", "Search (issuer, ISIN, rating, source…)"),
                key="terminal_search",
            )
            currencies = sorted({str(o.get("currency") or "") for o in observations if o.get("currency")})
            ratings = sorted({str(o.get("rating") or "") for o in observations if o.get("rating")})
            statuses = sorted({str(o.get("data_status") or "") for o in observations if o.get("data_status")})
            market_dates = sorted(
                {str(o.get("market_date")) for o in observations if o.get("market_date")}, reverse=True
            )
            cols = st.columns(5)
            currency = cols[0].selectbox(text("Devise", "Currency"), ["Toutes"] + currencies, key="terminal_currency")
            rating = cols[1].selectbox("Rating", ["Toutes"] + ratings, key="terminal_rating")
            data_status = cols[2].selectbox(text("Statut données", "Data status"), ["Tous"] + statuses, key="terminal_status")
            market_date = cols[3].selectbox(text("Date de marché", "Market date"), ["Toutes"] + market_dates, key="terminal_date")
            sector = cols[4].text_input(text("Secteur", "Sector"), key="terminal_sector")
            st.session_state["terminal_saved_filters"] = {
                "terminal_search": search,
                "terminal_currency": currency,
                "terminal_rating": rating,
                "terminal_status": data_status,
                "terminal_date": market_date,
                "terminal_sector": sector,
            }
            filtered = _filter_observations(
                observations, search=search, currency=currency, rating=rating,
                sector=sector, data_status=data_status, market_date=market_date,
            )
            st.session_state[FILTERED_KEY] = filtered
            st.caption(
                f"{len(filtered)} / {len(observations)} "
                + text("titres · courbe zéro : swaps EUR au pair", "bonds · zero curve: EUR par swaps")
                + f" ({curve_label})"
            )
            frame = pd.DataFrame(
                [{column: item.get(column) for column in _FINDER_COLUMNS} for item in filtered]
            )
            st.dataframe(frame, width="stretch", hide_index=True)

    filtered = st.session_state.get(FILTERED_KEY, observations)
    if des_tab.open:
        with des_tab:
            _render_des(obs)

    if yas_tab.open:
        with yas_tab:
            metrics = _metrics_for(obs, zero_fn, par_fn)
            if metrics is None:
                st.session_state.pop(METRICS_KEY, None)
                st.warning(
                    text(
                        "Métriques YAS indisponibles : titre échu ou données de valorisation insuffisantes.",
                        "YAS metrics unavailable: the bond has matured or valuation data is insufficient.",
                    )
                )
            else:
                if str(obs.get("currency") or "").upper() != "EUR":
                    st.caption(
                        text(
                            "Spreads sur la courbe EUR indisponibles pour un titre non libellé en EUR.",
                            "EUR curve spreads are unavailable for a non-EUR bond.",
                        )
                    )
                peers = []
                maturity = obs.get("maturity_date")
                bucket = rating_bucket(obs.get("rating"))
                if isinstance(maturity, date) and metrics.get("z_spread_bps") is not None:
                    for other in filtered:
                        if str(other.get("isin") or "") == str(obs.get("isin") or ""):
                            continue
                        if other.get("currency") != obs.get("currency"):
                            continue
                        if rating_bucket(other.get("rating")) != bucket:
                            continue
                        other_maturity = other.get("maturity_date")
                        if not isinstance(other_maturity, date):
                            continue
                        if abs((other_maturity - maturity).days) / 365 > 2:
                            continue
                        other_metrics = _metrics_for(other, zero_fn, par_fn)
                        if other_metrics and other_metrics.get("z_spread_bps") is not None:
                            peers.append(other_metrics["z_spread_bps"])
                rv = (
                    relative_value_status(metrics["z_spread_bps"], peers)
                    if metrics.get("z_spread_bps") is not None
                    else None
                )
                st.session_state[METRICS_KEY] = {"isin": obs.get("isin"), "metrics": metrics, "rv": rv}
                _render_yas(obs, metrics, rv)

    if chart_tab.open:
        with chart_tab:
            st.markdown(f"#### {text('Graphique — Z-spread vs maturité', 'Chart — Z-spread vs maturity')}")
            chart = _chart_data(filtered, zero_fn, par_fn)
            st.session_state[CHART_KEY] = chart
            if not chart.empty:
                st.scatter_chart(chart, x="years", y="z_spread_bps", color="rating_bucket")
            else:
                st.info(
                    text(
                        "Aucun point Z-spread calculable pour les titres EUR de la sélection courante.",
                        "No computable Z-spread point for EUR bonds in the current selection.",
                    )
                )
