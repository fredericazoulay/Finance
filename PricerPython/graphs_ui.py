"""Tableau de bord graphique des obligations du référentiel marché."""

from __future__ import annotations

import math
from datetime import date
from typing import Any

import altair as alt
import pandas as pd
import psycopg
import streamlit as st

from comparator_ui import _curves
from database import (
    DatabaseConfigurationError,
    list_all_obligations,
    list_market_observations,
)
from localization import text
from pricing import DayCount, _coupon_dates_around, bond_price
from sensitivities import bond_metrics, rating_bucket

_UNSUPPORTED_FLAGS = (
    "is_callable",
    "is_putable",
    "is_convertible",
    "is_perpetual",
    "is_inflation_linked",
)


@st.cache_data(ttl=300)
def _load_observations() -> list[dict[str, Any]]:
    return list_market_observations(limit=5000)


@st.cache_data(ttl=300)
def _load_family_by_isin() -> dict[str, str]:
    families = {}
    for obligation in list_all_obligations():
        isin = str(obligation.get("isin") or "").strip().upper()
        if isin:
            families[isin] = str(obligation.get("famille") or "").strip()
    return families


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _flag_enabled(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    normalized = str(value).strip().casefold()
    if normalized in {"", "false", "no", "non", "n", "0", "off"}:
        return False
    if normalized in {"true", "yes", "oui", "y", "1", "on"}:
        return True
    return True


def _day_count(value: Any) -> DayCount | None:
    if isinstance(value, DayCount):
        return value
    if value is None:
        return None
    normalized = str(value).strip().upper()
    if normalized == "ACT/365F":
        return DayCount.ACT_365
    try:
        return DayCount(normalized)
    except ValueError:
        return None


def _bond_terms(observation: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    if any(_flag_enabled(observation.get(flag)) for flag in _UNSUPPORTED_FLAGS):
        return None, text(
            "Structure optionnelle, convertible, perpétuelle ou indexée non prise en charge.",
            "Optional, convertible, perpetual, or inflation-linked structure is not supported.",
        )
    if str(observation.get("bond_type") or "").strip().casefold() != "fixed":
        return None, text(
            "Le type d'obligation n'est pas à taux fixe.",
            "The bond type is not fixed-rate.",
        )
    if str(observation.get("coupon_type") or "").strip().casefold() != "fixed":
        return None, text(
            "Le type de coupon n'est pas fixe.",
            "The coupon type is not fixed.",
        )

    settlement = observation.get("market_date")
    maturity = observation.get("maturity_date")
    if not isinstance(settlement, date) or not isinstance(maturity, date):
        return None, text(
            "Dates de marché ou d'échéance absentes.",
            "Market or maturity date is missing.",
        )
    if maturity <= settlement:
        return None, text(
            "L'obligation est échue ou sa date d'échéance est invalide.",
            "The bond has matured or its maturity date is invalid.",
        )

    coupon_pct = _number(observation.get("coupon_rate_pct"))
    if coupon_pct is None or coupon_pct < 0:
        return None, text(
            "Taux de coupon absent ou invalide.",
            "Coupon rate is missing or invalid.",
        )
    frequency_value = _number(observation.get("payment_frequency"))
    if (
        frequency_value is None
        or not frequency_value.is_integer()
        or int(frequency_value) not in (1, 2, 4, 12)
    ):
        return None, text(
            "Fréquence de coupon absente ou non prise en charge.",
            "Coupon frequency is missing or unsupported.",
        )
    day_count = _day_count(observation.get("day_count"))
    if day_count is None:
        return None, text(
            "Convention de décompte absente ou non prise en charge.",
            "Day-count convention is missing or unsupported.",
        )

    ytm_pct = _number(observation.get("yield_to_maturity_pct"))
    clean_price = _number(observation.get("clean_price"))
    if ytm_pct is None and (clean_price is None or clean_price <= 0):
        return None, text(
            "Un YTM ou un prix clean valide est nécessaire.",
            "A valid YTM or clean price is required.",
        )
    return {
        "settlement": settlement,
        "maturity": maturity,
        "coupon": coupon_pct / 100,
        "frequency": int(frequency_value),
        "day_count": day_count,
        "ytm": ytm_pct / 100 if ytm_pct is not None else None,
        "clean_price": clean_price,
    }, None


def _filtered_observations(
    observations: list[dict[str, Any]],
    *,
    currency: str,
    ratings: list[str],
    market_date: str,
    statuses: list[str],
    query: str,
) -> list[dict[str, Any]]:
    normalized_query = query.strip().casefold()
    filtered = []
    for observation in observations:
        observation_currency = str(observation.get("currency") or "—").upper()
        observation_rating = str(observation.get("rating") or "NR")
        observation_status = str(observation.get("data_status") or "unknown")
        observation_date = str(observation.get("market_date") or "")
        if currency != "Toutes" and observation_currency != currency:
            continue
        if ratings and observation_rating not in ratings:
            continue
        if market_date != "Toutes" and observation_date != market_date:
            continue
        if statuses and observation_status not in statuses:
            continue
        if normalized_query:
            searchable = " ".join(
                str(observation.get(field) or "")
                for field in ("isin", "issuer", "issuer_type", "rating", "source_name")
            ).casefold()
            if normalized_query not in searchable:
                continue
        filtered.append(observation)
    return filtered


def _panel_frame(
    observations: list[dict[str, Any]],
    family_by_isin: dict[str, str],
) -> pd.DataFrame:
    rows = []
    for observation in observations:
        isin = str(observation.get("isin") or "—").strip()
        settlement = observation.get("market_date")
        maturity = observation.get("maturity_date")
        years = (
            (maturity - settlement).days / 365
            if isinstance(settlement, date)
            and isinstance(maturity, date)
            else None
        )
        if years is None:
            maturity_bucket = "Non renseignée"
        elif years <= 0:
            maturity_bucket = "Échue"
        elif years <= 5:
            maturity_bucket = "0–5 ans"
        elif years <= 10:
            maturity_bucket = "5–10 ans"
        elif years <= 20:
            maturity_bucket = "10–20 ans"
        else:
            maturity_bucket = "20 ans et +"

        rows.append(
            {
                "isin": isin,
                "issuer": str(observation.get("issuer") or "—"),
                "currency": str(observation.get("currency") or "—").upper(),
                "family": family_by_isin.get(isin.upper()) or "Non renseignée",
                "rating": str(observation.get("rating") or "NR"),
                "rating_bucket": rating_bucket(observation.get("rating")),
                "years_to_maturity": years,
                "maturity_bucket": maturity_bucket,
                "coupon_pct": _number(observation.get("coupon_rate_pct")),
                "ytm_pct": _number(observation.get("yield_to_maturity_pct")),
                "source_spread_bps": _number(observation.get("spread_bps")),
                "esg_score": _number(observation.get("esg_score")),
            }
        )
    return pd.DataFrame(
        rows,
        columns=(
            "isin",
            "issuer",
            "currency",
            "family",
            "rating",
            "rating_bucket",
            "years_to_maturity",
            "maturity_bucket",
            "coupon_pct",
            "ytm_pct",
            "source_spread_bps",
            "esg_score",
        ),
    )


def _share_frame(frame: pd.DataFrame, column: str) -> pd.DataFrame:
    counts: dict[str, int] = {}
    for value in frame[column]:
        name = str(value or "Non renseigné")
        counts[name] = counts.get(name, 0) + 1
    shares = pd.DataFrame(
        [
            {"category": name, "bond_count": count}
            for name, count in sorted(counts.items())
        ]
    )
    shares["share"] = shares["bond_count"] / shares["bond_count"].sum()
    return shares


def _render_share_chart(
    frame: pd.DataFrame,
    column: str,
    description: str,
) -> None:
    category_label = text("Catégorie", "Category")
    shares = _share_frame(frame, column)
    base = alt.Chart(shares)
    pie = base.mark_arc(outerRadius=88).encode(
        theta=alt.Theta("bond_count:Q", stack=True),
        color=alt.Color(
            "category:N",
            legend=alt.Legend(title=None, orient="bottom", columns=2),
        ),
        order=alt.Order("bond_count:Q", sort="descending"),
        tooltip=[
            alt.Tooltip("category:N", title=category_label),
            alt.Tooltip(
                "bond_count:Q",
                title=text("Nombre d'obligations", "Number of bonds"),
            ),
            alt.Tooltip("share:Q", title=text("Part", "Share"), format=".1%"),
        ],
    )
    labels = (
        base.transform_filter(alt.datum.share >= 0.04)
        .mark_text(radius=58, color="white")
        .encode(
            theta=alt.Theta("bond_count:Q", stack=True),
            text=alt.Text("share:Q", format=".0%"),
        )
    )
    st.altair_chart(
        (pie + labels).properties(height=220),
        width="stretch",
        alt=description,
    )


def _render_panel_charts(frame: pd.DataFrame) -> None:
    st.subheader(text("Répartition du panel", "Panel composition"))
    if frame.empty:
        st.info(text("Aucune obligation ne correspond aux filtres.", "No bonds match the filters."))
        return

    st.caption(
        text(
            "Parts calculées sur le nombre d’obligations filtrées. La famille est rapprochée du catalogue par ISIN ; les titres sans correspondance sont « Non renseignée ».",
            "Shares use the filtered bond count. Family is matched to the catalogue by ISIN; unmatched bonds are shown as Not reported.",
        )
    )
    distributions = (
        (
            "currency",
            text("Obligations par devise", "Bonds by currency"),
            text("Part des obligations par devise.", "Share of bonds by currency."),
        ),
        (
            "family",
            text("Obligations par famille", "Bonds by family"),
            text("Part des obligations par famille.", "Share of bonds by family."),
        ),
        (
            "rating",
            text("Obligations par notation", "Bonds by rating"),
            text("Part des obligations par notation.", "Share of bonds by rating."),
        ),
        (
            "maturity_bucket",
            text("Obligations par échéance", "Bonds by maturity"),
            text("Part des obligations par tranche de maturité.", "Share of bonds by maturity bucket."),
        ),
    )
    for index in range(0, len(distributions), 2):
        columns = st.columns(2)
        for column, (field, title, description) in zip(
            columns, distributions[index : index + 2]
        ):
            with column:
                st.markdown(f"**{title}**")
                _render_share_chart(frame, field, description)

    yield_frame = frame.dropna(subset=["years_to_maturity", "ytm_pct"])
    coupon_frame = frame.dropna(subset=["coupon_pct", "ytm_pct"])
    spread_frame = frame.dropna(subset=["years_to_maturity", "source_spread_bps"])
    second_row = st.columns(2)
    with second_row[0]:
        st.markdown(f"**{text('YTM selon l’échéance', 'YTM by maturity')}**")
        if yield_frame.empty:
            st.info(text("Échéance future et YTM requis.", "A future maturity and YTM are required."))
        else:
            st.scatter_chart(
                yield_frame,
                x="years_to_maturity",
                y="ytm_pct",
                color="rating_bucket",
                alt=text(
                    "Rendement actuariel selon les années restantes, coloré par catégorie de notation.",
                    "Yield to maturity by remaining years, colored by rating bucket.",
                ),
            )
    with second_row[1]:
        st.markdown(f"**{text('YTM selon le coupon', 'YTM by coupon')}**")
        if coupon_frame.empty:
            st.info(text("Coupon et YTM requis.", "Coupon and YTM are required."))
        else:
            st.scatter_chart(
                coupon_frame,
                x="coupon_pct",
                y="ytm_pct",
                color="rating_bucket",
                alt=text(
                    "Rendement actuariel selon le coupon annuel, coloré par notation.",
                    "Yield to maturity by annual coupon, colored by rating.",
                ),
            )

    third_row = st.columns(2)
    with third_row[0]:
        st.markdown(f"**{text('Spread de la source selon l’échéance', 'Source spread by maturity')}**")
        if spread_frame.empty:
            st.info(text("Aucun spread source et échéance disponibles.", "No source spreads with maturity are available."))
        else:
            st.scatter_chart(
                spread_frame,
                x="years_to_maturity",
                y="source_spread_bps",
                color="rating_bucket",
                alt=text(
                    "Spreads fournis par la source selon l’échéance ; ils ne sont pas recalculés comme Z-spreads.",
                    "Source-provided spreads by maturity; these are not recalculated Z-spreads.",
                ),
            )
            st.caption(
                text(
                    "Spread source uniquement : il ne s'agit pas nécessairement d'un Z-spread.",
                    "Source spread only; it is not necessarily a Z-spread.",
                )
            )
    with third_row[1]:
        st.markdown(f"**{text('ESG selon le rendement', 'ESG by yield')}**")
        esg_frame = frame.dropna(subset=["esg_score", "ytm_pct"])
        if esg_frame.empty:
            st.info(text("Aucun score ESG et YTM disponibles.", "No ESG scores with YTM are available."))
        else:
            st.scatter_chart(
                esg_frame,
                x="esg_score",
                y="ytm_pct",
                color="rating_bucket",
                alt=text(
                    "Score ESG fourni selon le rendement actuariel par notation.",
                    "Source-provided ESG score by yield to maturity and rating.",
                ),
            )
            st.caption(
                text(
                    "Les scores ESG sont affichés tels que fournis et ne sont pas validés par l’application.",
                    "ESG scores are displayed as supplied and are not validated by the application.",
                )
            )


def _display_value(value: Any, suffix: str = "", decimals: int = 2) -> str:
    numeric = _number(value)
    if numeric is None:
        return "—"
    return f"{numeric:.{decimals}f}{suffix}"


def _render_selected_bond(
    observation: dict[str, Any],
    zero_fn,
    par_fn,
    curve_label: str,
) -> None:
    st.subheader(text("Fiche obligataire et sensibilités", "Bond profile and sensitivities"))
    terms, reason = _bond_terms(observation)
    if terms is None:
        st.warning(reason or text("Calcul indisponible.", "Calculation unavailable."))
        return

    currency = str(observation.get("currency") or "").upper()
    years = (terms["maturity"] - terms["settlement"]).days / 365
    use_eur_curve = currency == "EUR"
    try:
        accrued = 0.0
        dirty_price = None
        if terms["ytm"] is None:
            accrued = bond_price(
                terms["coupon"],
                0,
                terms["settlement"],
                terms["maturity"],
                100,
                terms["frequency"],
                terms["day_count"],
            )["accrued_interest"]
            dirty_price = float(terms["clean_price"]) + accrued
        metrics = bond_metrics(
            settlement_date=terms["settlement"],
            maturity_date=terms["maturity"],
            coupon=terms["coupon"],
            nominal=100,
            frequency=terms["frequency"],
            day_count=terms["day_count"],
            ytm=terms["ytm"],
            dirty_price=dirty_price,
            zero_fn=zero_fn if use_eur_curve else None,
            swap_rate_at_maturity=par_fn(years) if use_eur_curve else None,
        )
    except ValueError as exc:
        st.warning(
            text(
                f"Métriques indisponibles avec les données fournies : {exc}",
                f"Metrics unavailable for the supplied data: {exc}",
            )
        )
        return

    if not use_eur_curve:
        st.info(
            text(
                "Les spreads de courbe sont affichés uniquement pour les obligations EUR.",
                "Curve spreads are available only for EUR bonds.",
            )
        )
    elif curve_label == "default":
        st.warning(
            text(
                "Courbe de démonstration non datée : les spreads calculés sont indicatifs.",
                "Undated demonstration curve: calculated spreads are indicative.",
            )
        )
    elif observation.get("market_date") and str(observation["market_date"]) != curve_label:
        st.warning(
            text(
                f"Date de la courbe ({curve_label}) différente de la date de marché du titre ({observation['market_date']}).",
                f"Curve date ({curve_label}) differs from the bond market date ({observation['market_date']}).",
            )
        )

    if str(observation.get("data_status") or "").casefold() != "official":
        st.warning(
            text(
                "Données non marquées official : résultats indicatifs.",
                "Data is not marked official: results are indicative.",
            )
        )

    st.caption(
        f"{observation.get('isin') or '—'} · {observation.get('issuer') or '—'} · "
        f"{currency or '—'} · {observation.get('market_date') or '—'} · "
        f"{text('source', 'source')}: {observation.get('source_name') or '—'}"
    )
    top_metrics = st.columns(4)
    top_metrics[0].metric(text("YTM observé (%)", "Observed YTM (%)"), _display_value(observation.get("yield_to_maturity_pct"), "%"))
    top_metrics[1].metric(text("Prix clean observé", "Observed clean price"), _display_value(observation.get("clean_price")))
    top_metrics[2].metric(text("Coupon (%)", "Coupon (%)"), _display_value(observation.get("coupon_rate_pct"), "%"))
    top_metrics[3].metric(text("Années restantes", "Years remaining"), f"{years:.2f}")

    risk_metrics = st.columns(4)
    risk_metrics[0].metric(text("Rendement courant (%)", "Current yield (%)"), _display_value(metrics.get("current_yield", 0) * 100 if metrics.get("current_yield") is not None else None, "%"))
    risk_metrics[1].metric(text("Duration modifiée (ans)", "Modified duration (years)"), _display_value(metrics.get("modified_duration"), decimals=3))
    risk_metrics[2].metric("DV01 / 100k", _display_value(metrics.get("dv01_per_100k")))
    risk_metrics[3].metric(text("Convexité", "Convexity"), _display_value(metrics.get("convexity"), decimals=3))

    spread_metrics = st.columns(3)
    spread_metrics[0].metric("G-Spread (pb)", _display_value(metrics.get("g_spread_bps"), " pb"))
    spread_metrics[1].metric("I-Spread (pb)", _display_value(metrics.get("i_spread_bps"), " pb"))
    spread_metrics[2].metric("Z-Spread (pb)", _display_value(metrics.get("z_spread_bps"), " pb"))

    yield_shocks = (-100, -50, 0, 50, 100, 200)
    price_rows = []
    for shock in yield_shocks:
        scenario_ytm = metrics["ytm"] + shock / 10000
        if 1 + scenario_ytm / terms["frequency"] <= 0:
            continue
        scenario_price = bond_price(
            terms["coupon"],
            scenario_ytm,
            terms["settlement"],
            terms["maturity"],
            100,
            terms["frequency"],
            terms["day_count"],
        )["clean_price"]
        price_rows.append(
            {
                text("Choc de rendement (pb)", "Yield shock (bps)"): shock,
                text("Prix clean exact", "Exact clean price"): scenario_price,
            }
        )
    if price_rows:
        st.markdown(f"**{text('Prix selon le choc de rendement', 'Price by yield shock')}**")
        st.line_chart(
            pd.DataFrame(price_rows),
            x=text("Choc de rendement (pb)", "Yield shock (bps)"),
            y=text("Prix clean exact", "Exact clean price"),
            alt=text(
                "Prix clean recalculé exactement pour plusieurs chocs de rendement.",
                "Clean price repriced exactly for several yield shocks.",
            ),
        )
        st.caption(
            text(
                "Repricing des flux fixes selon les conventions disponibles ; le choc porte sur le YTM total.",
                "Fixed-cash-flow repricing with available conventions; the shock applies to total YTM.",
            )
        )

    _, _, payment_dates = _coupon_dates_around(
        terms["settlement"], terms["maturity"], terms["frequency"]
    )
    coupon_amount = 100 * terms["coupon"] / terms["frequency"]
    cashflow_rows = [
        {
            text("Date", "Date"): payment_date,
            text("Coupon estimé", "Estimated coupon"): coupon_amount,
            text("Remboursement estimé", "Estimated redemption"): (
                100.0 if payment_date == terms["maturity"] else 0.0
            ),
        }
        for payment_date in payment_dates
    ]
    if cashflow_rows:
        st.markdown(f"**{text('Flux futurs estimés par nominal 100', 'Estimated future cash flows per 100 face')}**")
        st.bar_chart(
            pd.DataFrame(cashflow_rows),
            x=text("Date", "Date"),
            y=[
                text("Coupon estimé", "Estimated coupon"),
                text("Remboursement estimé", "Estimated redemption"),
            ],
            alt=text(
                "Coupons estimés et remboursement à l’échéance pour un nominal de 100.",
                "Estimated coupons and maturity redemption for 100 face value.",
            ),
        )
        st.caption(
            text(
                "Projection simple à partir de la maturité ; sans calendrier, ajustement de jours ouvrés, stub, amortissement ni option.",
                "Simple maturity-anchored projection; excludes calendars, business-day adjustments, stubs, amortization, and options.",
            )
        )


def render_graphs() -> None:
    st.title(text("Graphiques obligataires", "Bond charts"), icon=":material/monitoring:")
    st.caption(
        text(
            "Répartition du référentiel, rendements, spreads source et analyse de risque d’une obligation sélectionnée.",
            "Reference-panel distributions, yields, source spreads, and risk analysis for a selected bond.",
        )
    )
    with st.container(horizontal=True, vertical_alignment="center"):
        st.caption(
            text(
                "Données en lecture seule · actualisation en cache toutes les 5 minutes.",
                "Read-only data · cached refresh every 5 minutes.",
            )
        )
        if st.button(
            text("Actualiser", "Refresh"),
            icon=":material/refresh:",
            key="graphs_refresh",
        ):
            _load_observations.clear()
            _load_family_by_isin.clear()
            st.rerun()

    try:
        observations = _load_observations()
        family_by_isin = _load_family_by_isin() if observations else {}
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
        st.info(text("Aucune obligation dans le référentiel marché.", "No bonds in the market reference."))
        return

    currencies = sorted({str(item.get("currency") or "—").upper() for item in observations})
    ratings = sorted({str(item.get("rating") or "NR") for item in observations})
    statuses = sorted({str(item.get("data_status") or "unknown") for item in observations})
    market_dates = sorted(
        {str(item.get("market_date")) for item in observations if item.get("market_date")},
        reverse=True,
    )
    filters = st.columns(4)
    currency = filters[0].selectbox(
        text("Devise", "Currency"),
        ["Toutes", *currencies],
        key="graphs_currency",
    )
    selected_ratings = filters[1].multiselect(
        text("Notations", "Ratings"),
        ratings,
        default=ratings,
        key="graphs_ratings",
    )
    selected_date = filters[2].selectbox(
        text("Date de marché", "Market date"),
        ["Toutes", *market_dates],
        index=1 if market_dates else 0,
        key="graphs_market_date",
    )
    selected_statuses = filters[3].multiselect(
        text("Statut des données", "Data status"),
        statuses,
        default=statuses,
        key="graphs_statuses",
    )
    query = st.text_input(
        text("Rechercher par ISIN, émetteur ou source", "Search by ISIN, issuer, or source"),
        type="search",
        key="graphs_search",
    )

    filtered = _filtered_observations(
        observations,
        currency=currency,
        ratings=selected_ratings,
        market_date=selected_date,
        statuses=selected_statuses,
        query=query,
    )
    frame = _panel_frame(filtered, family_by_isin)
    ytm_values = [value for value in frame.get("ytm_pct", pd.Series(dtype=float)).dropna()]
    coupon_values = [value for value in frame.get("coupon_pct", pd.Series(dtype=float)).dropna()]
    official_count = sum(
        str(item.get("data_status") or "").casefold() == "official"
        for item in filtered
    )
    median_ytm = float(pd.Series(ytm_values).median()) if ytm_values else None
    median_coupon = float(pd.Series(coupon_values).median()) if coupon_values else None

    kpis = st.columns(4)
    kpis[0].metric(text("Obligations filtrées", "Filtered bonds"), str(len(filtered)))
    kpis[1].metric(text("Devises", "Currencies"), str(frame["currency"].nunique()) if not frame.empty else "0")
    kpis[2].metric(text("YTM médian (%)", "Median YTM (%)"), _display_value(median_ytm, "%"))
    kpis[3].metric(text("Données marquées official", "Data marked official"), f"{official_count} / {len(filtered)}")

    if frame["currency"].nunique() > 1:
        st.warning(
            text(
                "Le filtre contient plusieurs devises : les niveaux de rendement ne sont pas directement comparables entre devises.",
                "The filter contains multiple currencies: yield levels are not directly comparable across currencies.",
            )
        )
    if len({str(item.get("market_date")) for item in filtered if item.get("market_date")}) > 1:
        st.warning(
            text(
                "Le filtre contient plusieurs dates de marché : les observations ne sont pas synchronisées.",
                "The filter contains multiple market dates: observations are not synchronized.",
            )
        )
    if any(str(item.get("data_status") or "").casefold() != "official" for item in filtered):
        st.info(
            text(
                "Le panel contient des données non marquées official ; les résultats restent indicatifs.",
                "The panel contains data not marked official; results remain indicative.",
            )
        )

    _render_panel_charts(frame)
    st.divider()

    if not filtered:
        return
    labels = []
    observations_by_label = {}
    for index, item in enumerate(filtered):
        label = (
            f"{item.get('isin') or '?'} · {item.get('issuer') or '?'} · "
            f"{item.get('market_date') or 'date inconnue'} · {item.get('rating') or 'NR'} · {index + 1}"
        )
        labels.append(label)
        observations_by_label[label] = item
    selected_label = st.selectbox(
        text("Choisir une obligation pour l’analyse de risque", "Select a bond for risk analysis"),
        labels,
        key="graphs_selected_bond",
    )
    selected_observation = observations_by_label[selected_label]
    zero_fn, par_fn, curve_label = _curves()
    _render_selected_bond(selected_observation, zero_fn, par_fn, curve_label)

    st.divider()
    st.subheader(text("Données de marché détaillées", "Detailed market data"))
    display_columns = {
        "isin": "ISIN",
        "issuer": text("Émetteur", "Issuer"),
        "issuer_type": text("Secteur / type d'émetteur", "Sector / issuer type"),
        "currency": text("Devise", "Currency"),
        "bond_type": text("Type", "Type"),
        "coupon_type": text("Type de coupon", "Coupon type"),
        "coupon_rate_pct": text("Coupon (%)", "Coupon (%)"),
        "payment_frequency": text("Fréquence", "Frequency"),
        "day_count": text("Convention", "Day count"),
        "maturity_date": text("Échéance", "Maturity"),
        "yield_to_maturity_pct": "YTM (%)",
        "clean_price": text("Prix clean", "Clean price"),
        "spread_bps": text("Spread source (pb)", "Source spread (bps)"),
        "esg_score": "ESG",
        "is_callable": "Callable",
        "is_putable": "Putable",
        "is_convertible": text("Convertible", "Convertible"),
        "is_perpetual": text("Perpétuelle", "Perpetual"),
        "is_inflation_linked": text("Indexée inflation", "Inflation linked"),
        "is_green_bond": "Green",
        "is_social_bond": "Social",
        "is_sustainability_bond": "Sustainability",
        "is_sustainability_linked": "SLB",
        "seniority": text("Séniorité", "Seniority"),
        "rating_agency": text("Agence de notation", "Rating agency"),
        "rating": text("Notation", "Rating"),
        "country": text("Pays", "Country"),
        "market": text("Marché", "Market"),
        "market_date": text("Date de marché", "Market date"),
        "reference_rate": text("Taux de référence", "Reference rate"),
        "source_name": text("Source", "Source"),
        "provider_claim": text("Fournisseur déclaré", "Provider claim"),
        "data_status": text("Statut des données", "Data status"),
    }
    export_frame = pd.DataFrame(
        [
            {label: item.get(column) for column, label in display_columns.items()}
            for item in filtered
        ]
    )
    st.dataframe(
        export_frame,
        hide_index=True,
        alt=text(
            "Données de marché et caractéristiques des obligations filtrées.",
            "Market data and characteristics for filtered bonds.",
        ),
    )
    st.download_button(
        text("Exporter les obligations filtrées (CSV)", "Export filtered bonds (CSV)"),
        data=export_frame.to_csv(index=False).encode("utf-8-sig"),
        file_name="obligations_filtrees.csv",
        mime="text/csv",
        icon=":material/download:",
        key="graphs_export_csv",
    )
