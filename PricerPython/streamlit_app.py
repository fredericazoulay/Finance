"""Interface Streamlit pour le prototype de pricing obligataire."""

from datetime import date, timedelta

import pandas as pd
import streamlit as st

from pricing import (
    DayCount,
    DAY_COUNT_CONVENTIONS,
    SpreadObservation,
    bond_price,
    confidence_score,
    theoretical_yield,
    weighted_spread,
)

DAY_COUNTS: tuple[DayCount, ...] = DAY_COUNT_CONVENTIONS
PANEL_NAME_COLUMN = "Obligation"
PANEL_SPREAD_COLUMN = "Spread (pb)"
PANEL_SIMILARITY_COLUMN = "Similarité (0-100)"
PANEL_YTM_COLUMN = "YTM (%)"


def _render_bond_pricing() -> None:
    st.subheader("Caractéristiques de l'obligation")
    st.caption(
        "Saisissez les paramètres de marché. Les taux sont exprimés en pourcentage "
        "dans le formulaire et convertis en taux décimaux pour le calcul."
    )

    with st.form("bond_pricing_form"):
        col_instrument, col_dates = st.columns(2)
        with col_instrument:
            issuer = st.text_input("Émetteur", placeholder="Ex. EDF")
            isin = st.text_input("ISIN (facultatif)")
            coupon_pct = st.number_input(
                "Coupon annuel (%)", min_value=0.0, value=3.75, step=0.05
            )
            ytm_pct = st.number_input(
                "Rendement actuariel — YTM (%)", value=4.25, step=0.05
            )
        with col_dates:
            today = date.today()
            settlement_date = st.date_input("Date de règlement", value=today)
            maturity_date = st.date_input(
                "Date d'échéance", value=today + timedelta(days=365 * 8)
            )
            nominal = st.number_input(
                "Nominal", min_value=0.01, value=100.0, step=100.0
            )
            frequency = st.selectbox(
                "Fréquence des coupons",
                options=(1, 2, 4, 12),
                index=1,
                format_func=lambda value: {
                    1: "Annuelle",
                    2: "Semestrielle",
                    4: "Trimestrielle",
                    12: "Mensuelle",
                }[value],
            )

        day_count = st.selectbox(
            "Convention de décompte",
            DAY_COUNTS,
            index=0,
            format_func=lambda value: value.value,
        )
        submitted = st.form_submit_button(
            "Calculer le prix théorique", type="primary", use_container_width=True
        )

    if not submitted:
        return
    if settlement_date >= maturity_date:
        st.error("La date de règlement doit être antérieure à la date d'échéance.")
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
        )
    except ValueError as exc:
        st.error(str(exc))
        return

    st.divider()
    st.subheader("Résultat du pricing")
    if issuer or isin:
        st.caption(" · ".join(value for value in (issuer, isin) if value))

    clean_per_100 = result["clean_price"] / nominal * 100
    dirty_per_100 = result["dirty_price"] / nominal * 100
    clean_metric, dirty_metric, accrued_metric = st.columns(3)
    clean_metric.metric("Prix clean", f"{result['clean_price']:,.4f}")
    dirty_metric.metric("Prix dirty", f"{result['dirty_price']:,.4f}")
    accrued_metric.metric("Intérêts courus", f"{result['accrued_interest']:,.4f}")
    st.caption(
        f"Cours clean : {clean_per_100:,.4f} % du nominal · "
        f"Cours dirty : {dirty_per_100:,.4f} % du nominal"
    )


def _render_comparables() -> None:
    st.subheader("Panel de comparables")
    st.caption(
        "Renseignez vos données de marché. Le score de similarité sert de poids "
        "pour la moyenne et peut être exprimé sur une échelle de 0 à 100."
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
                PANEL_NAME_COLUMN: st.column_config.TextColumn(PANEL_NAME_COLUMN),
                PANEL_SPREAD_COLUMN: st.column_config.NumberColumn(
                    PANEL_SPREAD_COLUMN, help="Spread observé en points de base."
                ),
                PANEL_SIMILARITY_COLUMN: st.column_config.NumberColumn(
                    PANEL_SIMILARITY_COLUMN, min_value=0, max_value=100
                ),
                PANEL_YTM_COLUMN: st.column_config.NumberColumn(
                    PANEL_YTM_COLUMN,
                    help="Rendement annuel du comparable en pourcentage.",
                ),
            },
        )
        risk_free_pct = st.number_input(
            "Taux sans risque (%)", value=2.5, step=0.05, key="risk_free_pct"
        )
        submitted = st.form_submit_button(
            "Calculer les indicateurs du panel",
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
                    "Chaque comparable renseigné doit avoir un spread et un score de similarité."
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
        st.error(str(exc))
        return

    spread_metric, yield_metric = st.columns(2)
    spread_metric.metric("Spread pondéré", f"{spread:,.2f} pb")
    yield_metric.metric("Rendement théorique", f"{target_yield * 100:,.4f} %")

    panel_frame = pd.DataFrame(valid_rows)
    if not panel_frame.empty and panel_frame[PANEL_YTM_COLUMN].notna().any():
        yield_rows = panel_frame.dropna(subset=[PANEL_YTM_COLUMN])
        best_row = yield_rows.loc[yield_rows[PANEL_YTM_COLUMN].idxmax()]
        st.info(
            "Meilleur rendement observé dans le panel : "
            f"{best_row[PANEL_NAME_COLUMN]} — "
            f"{best_row[PANEL_YTM_COLUMN]:.4f} %."
        )
    st.dataframe(panel_frame, hide_index=True, use_container_width=True)
    st.caption(
        "Le meilleur rendement affiché est le YTM le plus élevé saisi. "
        "Il ne remplace pas l'analyse de risque ni la sélection du rendement cible."
    )


def _render_confidence() -> None:
    st.subheader("Niveau de confiance")
    st.caption(
        "Le score combine le nombre de comparables, leur similarité moyenne, "
        "la qualité des données et la liquidité."
    )

    with st.form("confidence_form"):
        col_left, col_right = st.columns(2)
        with col_left:
            nb_comparables = st.number_input(
                "Nombre de comparables", min_value=0, value=3, step=1
            )
            avg_similarity_pct = st.slider(
                "Similarité moyenne (%)", min_value=0, max_value=100, value=80
            )
        with col_right:
            data_quality_pct = st.slider(
                "Qualité des données (%)", min_value=0, max_value=100, value=90
            )
            liquidity_pct = st.slider("Liquidité (%)", min_value=0, max_value=100, value=70)
        submitted = st.form_submit_button(
            "Calculer le score de confiance",
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
        st.metric("Confiance estimée", f"{score:.1%}")
        st.progress(score)
        st.caption("À partir de 5 comparables, le facteur « nombre » est plafonné.")


def main() -> None:
    st.set_page_config(
        page_title="Pricing obligataire",
        page_icon="📈",
        layout="wide",
    )
    st.title("Pricing obligataire")
    st.caption(
        "Prototype d'aide à la valorisation par comparables — sans connexion "
        "à une source de marché."
    )

    pricing_tab, comparables_tab, confidence_tab = st.tabs(
        ("Valoriser une obligation", "Comparables & rendement", "Confiance")
    )
    with pricing_tab:
        _render_bond_pricing()
    with comparables_tab:
        _render_comparables()
    with confidence_tab:
        _render_confidence()


if __name__ == "__main__":
    main()
