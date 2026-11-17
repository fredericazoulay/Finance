"""Interface Streamlit pour le prototype de pricing obligataire."""

import os
from datetime import date, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

import pandas as pd
import streamlit as st

from localization import LANGUAGE_KEY, current_language, error_text, text
from pricing import (
    DayCount,
    DAY_COUNT_CONVENTIONS,
    SpreadObservation,
    bond_price,
    confidence_score,
    theoretical_yield,
    weighted_spread,
)
from valuation_ui import (
    render_history,
    render_valuation,
)

DAY_COUNTS: tuple[DayCount, ...] = DAY_COUNT_CONVENTIONS
PANEL_NAME_COLUMN = "Obligation"
PANEL_SPREAD_COLUMN = "Spread (pb)"
PANEL_SIMILARITY_COLUMN = "Similarité (0-100)"
PANEL_YTM_COLUMN = "YTM (%)"
API_BASE_URL = os.environ.get("PRICER_API_URL", "http://127.0.0.1:8000").rstrip("/")


@st.cache_data(ttl=10, show_spinner=False)
def _check_api_health(base_url: str) -> tuple[bool, str]:
    try:
        with urlopen(f"{base_url}/health", timeout=1) as response:
            if response.status != 200:
                return False, f"HTTP {response.status}"
    except HTTPError as exc:
        return False, f"HTTP {exc.code}"
    except (URLError, TimeoutError) as exc:
        return False, str(getattr(exc, "reason", exc))
    return True, "HTTP 200"


def _clear_language_dependent_export() -> None:
    st.session_state.pop("obligation_catalogue_xlsx", None)


def _render_theme_styles(theme: str) -> None:
    palettes = {
        "light": {
            "background": "#F8FAFC",
            "surface": "#FFFFFF",
            "sidebar": "#F1F5F9",
            "text": "#172033",
            "primary": "#087F68",
            "border": "#D8E0E8",
        },
        "dark": {
            "background": "#101820",
            "surface": "#1B2835",
            "sidebar": "#16212C",
            "text": "#E6EDF3",
            "primary": "#39B99A",
            "border": "#344454",
        },
    }
    palette = palettes[theme]
    st.html(
        f"""
        <style>
        [data-testid="stAppViewContainer"] {{
            --background-color: {palette["background"]};
            --secondary-background-color: {palette["surface"]};
            --text-color: {palette["text"]};
            --primary-color: {palette["primary"]};
            --border-color: {palette["border"]};
            color-scheme: {theme};
            background-color: var(--background-color);
            color: var(--text-color);
        }}
        [data-testid="stSidebar"] {{
            --background-color: {palette["sidebar"]};
            --secondary-background-color: {palette["surface"]};
            --text-color: {palette["text"]};
            --primary-color: {palette["primary"]};
            --border-color: {palette["border"]};
            background-color: var(--background-color);
            color: var(--text-color);
        }}
        </style>
        """
    )


def _render_bond_pricing() -> None:
    st.subheader(text("Caractéristiques de l'obligation", "Bond details"))
    st.caption(
        text(
            "Saisissez les paramètres de marché. Les taux sont exprimés en pourcentage "
            "dans le formulaire et convertis en taux décimaux pour le calcul.",
            "Enter market parameters. Rates are shown as percentages in this form "
            "and converted to decimals for the calculation.",
        )
    )

    with st.form("bond_pricing_form"):
        col_instrument, col_dates = st.columns(2)
        with col_instrument:
            issuer = st.text_input(text("Émetteur", "Issuer"), placeholder="Ex. EDF")
            isin = st.text_input(text("ISIN (facultatif)", "ISIN (optional)"))
            coupon_pct = st.number_input(
                text("Coupon annuel (%)", "Annual coupon (%)"),
                min_value=0.0,
                value=3.75,
                step=0.05,
            )
            ytm_pct = st.number_input(
                text("Rendement actuariel — YTM (%)", "Yield to maturity — YTM (%)"),
                value=4.25,
                step=0.05,
            )
        with col_dates:
            today = date.today()
            settlement_date = st.date_input(
                text("Date de règlement", "Settlement date"), value=today
            )
            maturity_date = st.date_input(
                text("Date d'échéance", "Maturity date"),
                value=today + timedelta(days=365 * 8),
            )
            nominal = st.number_input(
                text("Nominal", "Nominal"), min_value=0.01, value=100.0, step=100.0
            )
            redemption_percent = st.number_input(
                text(
                    "Prix de remboursement (% du nominal)",
                    "Redemption price (% of nominal)",
                ),
                min_value=0.01,
                value=100.0,
            )
            language_code = current_language()
            frequency = st.selectbox(
                text("Fréquence des coupons", "Coupon frequency"),
                options=(1, 2, 4, 12),
                index=1,
                format_func=lambda value: {
                    1: text("Annuelle", "Annual", language_code),
                    2: text("Semestrielle", "Semiannual", language_code),
                    4: text("Trimestrielle", "Quarterly", language_code),
                    12: text("Mensuelle", "Monthly", language_code),
                }[value],
            )

        day_count = st.selectbox(
            text("Convention de décompte", "Day-count convention"),
            DAY_COUNTS,
            index=0,
            format_func=lambda value: value.value,
        )
        submitted = st.form_submit_button(
            text("Calculer le prix théorique", "Calculate theoretical price"),
            type="primary",
            use_container_width=True,
        )

    if not submitted:
        return
    if settlement_date >= maturity_date:
        st.error(
            text(
                "La date de règlement doit être antérieure à la date d'échéance.",
                "The settlement date must be before the maturity date.",
            )
        )
        return

    try:
        result = bond_price(
            coupon=coupon_pct / 100,
            ytm=ytm_pct / 100,
            settlement_date=settlement_date,
            maturity_date=maturity_date,
            nominal=nominal,
            frequency=frequency,
            day_count=day_count,
            redemption_percent=redemption_percent,
        )
    except ValueError as exc:
        st.error(error_text(str(exc)))
        return

    st.divider()
    st.subheader(text("Résultat du pricing", "Pricing result"))
    if issuer or isin:
        st.caption(" · ".join(value for value in (issuer, isin) if value))

    clean_per_100 = result["clean_price"] / nominal * 100
    dirty_per_100 = result["dirty_price"] / nominal * 100
    clean_metric, dirty_metric, accrued_metric = st.columns(3)
    clean_metric.metric(text("Prix clean", "Clean price"), f"{result['clean_price']:,.4f}")
    dirty_metric.metric(text("Prix dirty", "Dirty price"), f"{result['dirty_price']:,.4f}")
    accrued_metric.metric(
        text("Intérêts courus", "Accrued interest"),
        f"{result['accrued_interest']:,.4f}",
    )
    st.caption(
        text(
            f"Cours clean : {clean_per_100:,.4f} % du nominal · "
            f"Cours dirty : {dirty_per_100:,.4f} % du nominal",
            f"Clean price: {clean_per_100:,.4f}% of nominal · "
            f"Dirty price: {dirty_per_100:,.4f}% of nominal",
        )
    )


def _render_comparables() -> None:
    st.subheader(text("Panel de comparables", "Comparable panel"))
    st.caption(
        text(
            "Renseignez vos données de marché. Le score de similarité sert de poids "
            "pour la moyenne et peut être exprimé sur une échelle de 0 à 100.",
            "Enter market data. The similarity score weights the average and can "
            "be entered on a scale from 0 to 100.",
        )
    )

    initial_panel = pd.DataFrame(
        [
            {
                PANEL_NAME_COLUMN: "",
                PANEL_SPREAD_COLUMN: None,
                PANEL_SIMILARITY_COLUMN: None,
                PANEL_YTM_COLUMN: None,
            }
            for _ in range(3)
        ]
    )
    with st.form("comparables_form"):
        edited_panel = st.data_editor(
            initial_panel,
            num_rows="dynamic",
            hide_index=True,
            use_container_width=True,
            column_config={
                PANEL_NAME_COLUMN: st.column_config.TextColumn(
                    text(PANEL_NAME_COLUMN, "Bond")
                ),
                PANEL_SPREAD_COLUMN: st.column_config.NumberColumn(
                    text(PANEL_SPREAD_COLUMN, "Spread (bps)"),
                    help=text(
                        "Spread observé en points de base.",
                        "Observed spread in basis points.",
                    ),
                ),
                PANEL_SIMILARITY_COLUMN: st.column_config.NumberColumn(
                    text(PANEL_SIMILARITY_COLUMN, "Similarity (%)"),
                    min_value=0,
                    max_value=100,
                ),
                PANEL_YTM_COLUMN: st.column_config.NumberColumn(
                    text(PANEL_YTM_COLUMN, "YTM (%)"),
                    help=text(
                        "Rendement annuel du comparable en pourcentage.",
                        "Comparable's annual yield as a percentage.",
                    ),
                ),
            },
        )
        risk_free_pct = st.number_input(
            text("Taux sans risque (%)", "Risk-free rate (%)"),
            value=2.5,
            step=0.05,
            key="risk_free_pct",
        )
        submitted = st.form_submit_button(
            text("Calculer les indicateurs du panel", "Calculate panel metrics"),
            type="primary",
            use_container_width=True,
        )

    if not submitted:
        return

    observations: list[SpreadObservation] = []
    valid_rows: list[dict[str, object]] = []
    try:
        for row in edited_panel.to_dict("records"):
            spread_bps = row[PANEL_SPREAD_COLUMN]
            similarity = row[PANEL_SIMILARITY_COLUMN]
            if pd.isna(spread_bps) and pd.isna(similarity):
                continue
            if pd.isna(spread_bps) or pd.isna(similarity):
                raise ValueError(
                    text(
                        "Chaque comparable renseigné doit avoir un spread et un score de similarité.",
                        "Each entered comparable must have a spread and a similarity score.",
                    )
                )
            spread = float(spread_bps)
            weight = float(similarity)
            observations.append(
                SpreadObservation(spread_bps=spread, similarity_score=weight)
            )
            valid_rows.append(
                {
                    PANEL_NAME_COLUMN: str(row[PANEL_NAME_COLUMN] or "Comparable"),
                    PANEL_SPREAD_COLUMN: spread,
                    PANEL_SIMILARITY_COLUMN: weight,
                    PANEL_YTM_COLUMN: row[PANEL_YTM_COLUMN],
                }
            )

        spread = weighted_spread(observations)
        target_yield = theoretical_yield(risk_free_pct / 100, spread)
    except (ValueError, TypeError) as exc:
        st.error(error_text(str(exc)))
        return

    spread_metric, yield_metric = st.columns(2)
    spread_metric.metric(
        text("Spread pondéré", "Weighted spread"), f"{spread:,.2f} pb"
    )
    yield_metric.metric(
        text("Rendement théorique", "Theoretical yield"),
        f"{target_yield * 100:,.4f} %",
    )

    panel_frame = pd.DataFrame(valid_rows)
    if not panel_frame.empty and panel_frame[PANEL_YTM_COLUMN].notna().any():
        yield_rows = panel_frame.dropna(subset=[PANEL_YTM_COLUMN])
        best_row = yield_rows.loc[yield_rows[PANEL_YTM_COLUMN].idxmax()]
        st.info(
            text(
                "Meilleur rendement observé dans le panel : "
                f"{best_row[PANEL_NAME_COLUMN]} — "
                f"{best_row[PANEL_YTM_COLUMN]:.4f} %.",
                "Highest yield observed in the panel: "
                f"{best_row[PANEL_NAME_COLUMN]} — "
                f"{best_row[PANEL_YTM_COLUMN]:.4f}%.",
            )
        )
    panel_frame = panel_frame.rename(
        columns={
            PANEL_NAME_COLUMN: text(PANEL_NAME_COLUMN, "Bond"),
            PANEL_SPREAD_COLUMN: text(PANEL_SPREAD_COLUMN, "Spread (bps)"),
            PANEL_SIMILARITY_COLUMN: text(
                PANEL_SIMILARITY_COLUMN, "Similarity (%)"
            ),
            PANEL_YTM_COLUMN: text(PANEL_YTM_COLUMN, "YTM (%)"),
        }
    )
    st.dataframe(panel_frame, hide_index=True, use_container_width=True)
    st.caption(
        text(
            "Le meilleur rendement affiché est le YTM le plus élevé saisi. "
            "Il ne remplace pas l'analyse de risque ni la sélection du rendement cible.",
            "The best observed yield is the highest YTM entered. It does not replace "
            "risk analysis or target-yield selection.",
        )
    )


def _render_confidence() -> None:
    st.subheader(text("Niveau de confiance", "Confidence level"))
    st.caption(
        text(
            "Le score combine le nombre de comparables, leur similarité moyenne, "
            "la qualité des données et la liquidité.",
            "The score combines the number of comparables, average similarity, "
            "data quality, and liquidity.",
        )
    )

    with st.form("confidence_form"):
        col_left, col_right = st.columns(2)
        with col_left:
            nb_comparables = st.number_input(
                text("Nombre de comparables", "Number of comparables"),
                min_value=0,
                value=3,
                step=1,
            )
            avg_similarity_pct = st.slider(
                text("Similarité moyenne (%)", "Average similarity (%)"),
                min_value=0,
                max_value=100,
                value=80,
            )
        with col_right:
            data_quality_pct = st.slider(
                text("Qualité des données (%)", "Data quality (%)"),
                min_value=0,
                max_value=100,
                value=90,
            )
            liquidity_pct = st.slider(
                text("Liquidité (%)", "Liquidity (%)"),
                min_value=0,
                max_value=100,
                value=70,
            )
        submitted = st.form_submit_button(
            text("Calculer le score de confiance", "Calculate confidence score"),
            type="primary",
            use_container_width=True,
        )

    if submitted:
        score = confidence_score(
            nb_comparables=int(nb_comparables),
            avg_similarity=avg_similarity_pct / 100,
            data_quality=data_quality_pct / 100,
            liquidity=liquidity_pct / 100,
        )
        st.metric(text("Confiance estimée", "Estimated confidence"), f"{score:.1%}")
        st.progress(score)
        st.caption(
            text(
                "À partir de 5 comparables, le facteur « nombre » est plafonné.",
                "The comparable-count factor is capped at 5 comparables.",
            )
        )


def _render_header(page_title: str) -> None:
    language_code = current_language()
    with st.container(border=True):
        (
            brand,
            profile,
            environment,
            theme,
            group,
            language,
            api,
        ) = st.columns(
            [2.4, 1.25, 1.2, 1.05, 0.9, 0.8, 1.3],
            vertical_alignment="center",
        )
        with brand:
            st.markdown("### Finance Pricer")
            st.caption(page_title)
        with profile:
            st.caption(text("PROFIL", "PROFILE"))
            st.markdown(f"**{text('Local · Admin', 'Local · Admin')}**")
            st.caption(text("Sans authentification", "No sign-in"))
        with environment:
            st.caption(text("ENVIRONNEMENT", "ENVIRONMENT"))
            st.selectbox(
                text("Environnement", "Environment"),
                ("INT", "REC", "PREX", "PROD"),
                key="app_environment",
                help=text(
                    "Indicateur visuel uniquement : la connexion reste locale.",
                    "Display only: the database connection remains local.",
                ),
                label_visibility="collapsed",
            )
        with theme:
            st.caption(text("THÈME", "THEME"))
            st.selectbox(
                text("Thème", "Theme"),
                ("light", "dark"),
                format_func=lambda value: (
                    text("Clair", "Light", language_code)
                    if value == "light"
                    else text("Sombre", "Dark", language_code)
                ),
                key="app_theme",
                label_visibility="collapsed",
            )
        with group:
            st.caption(text("GROUPE", "GROUP"))
            st.markdown("**BO_CASH**")
        with language:
            st.caption(text("LANGUE", "LANGUAGE"))
            st.selectbox(
                text("Langue", "Language"),
                ("FR", "EN"),
                key=LANGUAGE_KEY,
                on_change=_clear_language_dependent_export,
                label_visibility="collapsed",
            )
        with api:
            online, detail = _check_api_health(API_BASE_URL)
            status_label = text("EN LIGNE", "ONLINE") if online else text(
                "HORS LIGNE", "OFFLINE"
            )
            color = "green" if online else "red"
            st.caption(text("API", "API"))
            st.markdown(f":{color}[**{status_label}**]")
            if not online:
                st.caption(
                    text(
                        f"Indisponible : {detail}",
                        f"Unavailable: {detail}",
                    )
                )


def _render_footer() -> None:
    with st.bottom:
        with st.container(
            border=True,
            horizontal=True,
            horizontal_alignment="distribute",
            vertical_alignment="center",
        ):
            st.caption(text("Finance Pricer · Prototype", "Finance Pricer · Prototype"))
            st.caption(
                text(
                    "Données de démonstration — ne pas utiliser comme conseil financier.",
                    "Demo data — not financial advice.",
                )
            )


def main() -> None:
    st.set_page_config(
        page_title=text("Pricing obligataire", "Bond pricing"),
        page_icon="📈",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    st.session_state.setdefault("app_environment", "INT")
    st.session_state.setdefault("app_theme", "light")
    st.session_state.setdefault(LANGUAGE_KEY, "FR")
    theme = st.session_state["app_theme"]
    theme = {
        "Clair": "light",
        "Sombre": "dark",
        "Light": "light",
        "Dark": "dark",
    }.get(theme, theme)
    if theme not in ("light", "dark"):
        st.warning(
            text(
                f"Thème enregistré inconnu ({theme}) ; le thème clair est utilisé.",
                f"Unknown saved theme ({theme}); using the light theme.",
            )
        )
        theme = "light"
    st.session_state["app_theme"] = theme
    _render_theme_styles(theme)

    page = st.navigation(
        {
            text("OBLIGATIONS", "BONDS"): [
                st.Page(
                    render_valuation,
                    title=text("Valorisation par Z-spread", "Z-spread valuation"),
                    icon=":material/home:",
                    help=text(
                        "Valoriser une obligation à partir d'une courbe zéro et de comparables saisis.",
                        "Value a bond using a zero curve and entered comparables.",
                    ),
                    default=True,
                ),
                st.Page(
                    _render_bond_pricing,
                    title=text("Calcul direct", "Direct pricing"),
                    icon=":material/bar_chart:",
                    help=text(
                        "Calculer le prix clean et dirty d'une obligation.",
                        "Calculate a bond's clean and dirty prices.",
                    ),
                ),
                st.Page(
                    "pages/catalogue.py",
                    title=text("Catalogue PostgreSQL", "PostgreSQL catalogue"),
                    icon=":material/description:",
                    help=text(
                        "Rechercher les obligations enregistrées dans PostgreSQL en lecture seule.",
                        "Search the PostgreSQL bond catalogue in read-only mode.",
                    ),
                ),
            ],
            text("ANALYSE", "ANALYSIS"): [
                st.Page(
                    _render_comparables,
                    title=text("Spread et rendement", "Spread and yield"),
                    icon=":material/bar_chart:",
                    help=text(
                        "Calculer le spread pondéré et le rendement théorique d'un panel.",
                        "Calculate the weighted spread and theoretical yield for a panel.",
                    ),
                ),
                st.Page(
                    _render_confidence,
                    title=text("Confiance indicative", "Indicative confidence"),
                    icon=":material/settings:",
                    help=text(
                        "Estimer un score indicatif à partir des comparables et de la qualité des données.",
                        "Estimate a score from comparables and data quality.",
                    ),
                ),
            ],
            text("HISTORIQUE", "HISTORY"): [
                st.Page(
                    render_history,
                    title=text("Historique", "History"),
                    icon=":material/description:",
                    help=text(
                        "Consulter les fiches et rapports de valorisation enregistrés localement.",
                        "Review locally saved bond records and valuation reports.",
                    ),
                ),
            ],
        },
        position="sidebar",
        expanded=True,
    )

    _render_header(page.title)
    with st.sidebar:
        st.divider()
        st.caption(text("Catalogue PostgreSQL · accès en lecture seule", "PostgreSQL catalogue · read-only"))
        st.caption(
            text(
                "Les comparables et données de marché restent saisis manuellement.",
                "Comparables and market data are entered manually.",
            )
        )

    page.run()
    _render_footer()


if __name__ == "__main__":
    main()
