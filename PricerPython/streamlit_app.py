"""Interface Streamlit pour le prototype de pricing obligataire."""

import os
from datetime import date, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

import pandas as pd
import streamlit as st

import QuantLib as ql
import sklearn as sk
import matplotlib as mpl
import numpy as np 
import scipy as sp

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
GROUP_OPTIONS = (
    "BO",
    "BO_ANALYSE",
    "BO_CASH",
    "BO_COMPTA",
    "BO_EOD",
    "BO_EXT",
    "BO_EXTOTPL",
    "BO_EXTPEPL",
    "BO_EXTEPEL",
    "BO_EXTVMPL",
    "BO_EXT_OTC",
    "BO_EXT_PE",
    "BO_EXT_VMO",
    "BO_MANAGER",
    "BO_OPS",
    "BO_OPS_FLX",
    "BO_OTC",
    "BO_OTC_APP",
    "BO_OTC_SUP",
    "BO_SEC",
    "BO_SPE",
    "BO_STL",
    "BO_SUP",
    "BO_TPO_IMP",
    "BO_TPO_OST",
    "BO_VALO",
    "BO_VMOB",
    "BO_VMOB_AP",
    "BO_VMOB_SU",
    "COLLATERAL",
    "CONFIG",
    "CONTRL-INT",
    "CONTROL",
    "DEOFIP",
    "DFFE",
    "DFFE_GES",
    "DFFE_ST",
    "DFI",
    "DFINB2",
    "DFINB3",
    "DFINF",
    "DFINF_ST",
    "DPFGPA-DR",
    "DPFGPA-WI",
    "DPFGPTAUX",
    "DPFIDS-DR",
    "DPFIDS-WI",
    "FO",
    "FO FI",
    "FO_AM",
    "FO_COM",
    "FO_CRD",
    "FO_EOD",
    "FO_EQD",
    "FO_EXT",
    "FO_FI",
    "FO_FXD_SA",
    "FO_FXD_TR",
    "FO_FXMM_SA",
    "FO_FXMM_TR",
    "FO_FX_FWD",
    "FO_FX_SPT",
    "FO_IRD",
    "FO_MM",
    "FO_MM_TR",
    "FO_OAT",
    "FO_PERF",
    "FO_PL_CTRL",
    "FO_SALES",
    "FO_SF",
    "FRR",
    "GDAFCT",
    "GDAPT",
    "GDAPTC",
    "GDAPTH",
    "GDAPTS",
    "GDAPTT",
    "HOUSEKEEP",
    "INTERMED",
    "LICADMIN",
    "MIG_MO",
    "MLC_ADMIN",
    "MLC_CONFIG",
    "MLC_EU",
    "MLC_OPS",
    "MLC_SUP",
    "MLC_SUPP",
    "MO",
    "MO-ACPR",
    "MO-ANALYSE",
    "MO-BCH_CPL",
    "MO-CLT_EXT",
    "MO-DPFSM2",
    "MO-EQ_NC",
    "MO-OST_INS",
    "MO-SUPGEST",
    "MO2",
    "MOASUPP_BO",
    "MOASUPP_FO",
    "MOASUPP_MO",
    "MOA_CONFIG",
)
PANEL_NAME_COLUMN = "Obligation"
PANEL_SPREAD_COLUMN = "Spread (pb)"
PANEL_SIMILARITY_COLUMN = "Similarité (0-100)"
PANEL_YTM_COLUMN = "YTM (%)"
API_BASE_URL = os.environ.get("PRICER_API_URL", "http://127.0.0.1:8000").rstrip("/")
APP_DIRECTORY = Path(__file__).resolve().parent
CAISSE_LOGO_PATH = APP_DIRECTORY / "assets" / "logoCaisse2026.png"
CDC_INFORMATIQUE_LOGO_PATH = APP_DIRECTORY / "assets" / "logo_CDC_Informatique.jpg"
THEME_OPTIONS = (
    "light",
    "dark",
    "rainbow",
    "neon",
    "pop",
    "bloomberg",
    "compagny_murex",
    "compagny_mistral_ai",
    "compagny_cdc_group",
    "compagny_cdc_informatique",
    "dc-comics_batman",
    "dc-comics_superman",
    "dc-comics_flash",
    "dc-comics_greenlantern",
    "dc-comics_aquaman",
    "dc-comics_cyborg",
    "dc-comics_shazam",
    "dc-comics_greenarrow",
    "dc-comics_blackadam",
    "dc-comics_chaos",
    "dc-comics_batgirl",
    "dc-comics_robin",
    "dc-comics_nightwing",
    "dc-comics_wonderwoman",
    "marvel_ironman",
    "marvel_captainamerica",
    "marvel_thor",
    "marvel_hulk",
    "marvel_blackwidow",
    "marvel_hawkeye",
    "marvel_scarletwitch",
    "marvelvision",
    "marvelblackpanther",
    "marvelantman",
    "marvelwasp",
    "marvelfalcon",
    "marvelwintersoldier",
    "marveldoctorstrange",
    "marvelspiderman",
    "cyberpunk",
    "futuristic",
    "retro",
    "vintage",
    "minimal",
    "dystopian",
    "steampunk",
    "solarized",
    "monokai",
    "gruvbox",
    "dracula",
    "atom",
    "blink",
    "solid",
    "glass",
    "wood",
    "marble",
    "concrete",
    "brutalist",
    "fantasy",
    "cybergoth",
    "vaporwave",
    "retrofuture",
    "retrowave",
    "synthwave",
    "lofi",
    "chromatic",
    "prismatic",
    "holographic",
    "nebula",
    "galaxy",
    "universe",
    "multiverse",
    "omniverse",
    "metaverse",
    "arcade",
    "pixel",
    "8bit",
    "16bit",
    "32bit",
    "64bit",
    "128bit",
)
THEME_LABEL_OVERRIDES = {
    "compagny_cdc_group": "COMPAGNY CDC GROUP(Caisse des Dépôts et Consignations)",
    "dc-comics_greenlantern": "DC-COMICS GREEN LANTERN",
    "dc-comics_greenarrow": "DC-COMICS GREEN ARROW",
    "dc-comics_blackadam": "DC-COMICS BLACK ADAM",
    "marvel_captainamerica": "MARVEL CAPTAIN AMERICA",
    "marvel_blackwidow": "MARVEL BLACK WIDOW",
    "marvel_scarletwitch": "MARVEL SCARLET WITCH",
    "marvelvision": "MARVEL VISION",
    "marvelblackpanther": "MARVEL BLACK PANTHER",
    "marvelantman": "MARVEL ANT MAN",
    "marvelwintersoldier": "MARVEL WINTER SOLDIER",
    "marveldoctorstrange": "MARVEL DOCTOR STRANGE",
    "marvelspiderman": "MARVEL SPIDER MAN",
}
CUSTOM_THEME_ACCENTS = {
    "compagny_murex": "#3bc3c8",
    "compagny_mistral_ai": "#f07852",
    "compagny_cdc_group": "#df5c42",
    "compagny_cdc_informatique": "#57b78c",
    "dc-comics_batman": "#f3c64e",
    "dc-comics_superman": "#4388ef",
    "dc-comics_flash": "#f2574b",
    "dc-comics_greenlantern": "#59d66c",
    "dc-comics_aquaman": "#35c5c6",
    "dc-comics_cyborg": "#46a9ee",
    "dc-comics_shazam": "#f1b83d",
    "dc-comics_greenarrow": "#8ebc4b",
    "dc-comics_blackadam": "#d6a838",
    "dc-comics_chaos": "#dc62ca",
    "dc-comics_batgirl": "#ef70b1",
    "dc-comics_robin": "#ee5f53",
    "dc-comics_nightwing": "#438ee8",
    "dc-comics_wonderwoman": "#dc5d64",
    "marvel_ironman": "#e65f4d",
    "marvel_captainamerica": "#528ee8",
    "marvel_thor": "#78a8e8",
    "marvel_hulk": "#69c65a",
    "marvel_blackwidow": "#d95658",
    "marvel_hawkeye": "#9b76d1",
    "marvel_scarletwitch": "#dd5c72",
    "marvelvision": "#5ac1a1",
    "marvelblackpanther": "#a184d6",
    "marvelantman": "#d8584f",
    "marvelwasp": "#e8c34b",
    "marvelfalcon": "#5b9dde",
    "marvelwintersoldier": "#8298b0",
    "marveldoctorstrange": "#db744d",
    "marvelspiderman": "#ef5149",
    "cyberpunk": "#f05bd5",
    "futuristic": "#54c8e8",
    "retro": "#e9a44e",
    "vintage": "#c69a62",
    "minimal": "#b8c2c8",
    "dystopian": "#c96c53",
    "steampunk": "#c58a4b",
    "solarized": "#2aa198",
    "monokai": "#a6d94d",
    "gruvbox": "#fabd2f",
    "dracula": "#bd93f9",
    "atom": "#61afef",
    "blink": "#f0d95c",
    "solid": "#ed6a52",
    "glass": "#71c9da",
    "wood": "#d09a62",
    "marble": "#b5c7d2",
    "concrete": "#a9b0b4",
    "brutalist": "#f1d34e",
    "fantasy": "#b987ec",
    "cybergoth": "#e14f9c",
    "vaporwave": "#ee78d1",
    "retrofuture": "#f5a94f",
    "retrowave": "#ed6a8b",
    "synthwave": "#c273ef",
    "lofi": "#88b68d",
    "chromatic": "#f16e62",
    "prismatic": "#74c9b0",
    "holographic": "#73cde8",
    "nebula": "#ad82e6",
    "galaxy": "#7989ed",
    "universe": "#69a9df",
    "multiverse": "#d982ca",
    "omniverse": "#e08b62",
    "metaverse": "#65c9c4",
    "arcade": "#f35e52",
    "pixel": "#6ed681",
    "8bit": "#ffd64f",
    "16bit": "#53c6cf",
    "32bit": "#f07852",
    "64bit": "#a77ce5",
    "128bit": "#76c78b",
}
CUSTOM_THEME_SURFACES = {
    "vintage": ("#1b1815", "#26211b", "#342b21"),
    "solarized": ("#002b36", "#073642", "#164b55"),
    "gruvbox": ("#1d2021", "#282828", "#3c3836"),
    "glass": ("#10191d", "rgba(32, 48, 54, 0.88)", "rgba(255, 255, 255, 0.08)"),
    "wood": ("#1a1511", "#261d16", "#35271c"),
    "marble": ("#191c20", "#23272b", "#30363a"),
    "concrete": ("#1c1d1e", "#27292a", "#36393a"),
    "lofi": ("#171914", "#20231c", "#303329"),
}
THEME_STANDARD_PALETTES = {
    "light": {
        "background": "#f6f8fa",
        "surface": "#ffffff",
        "sidebar": "#f0f4f7",
        "text": "#183b3d",
        "muted": "#5a7585",
        "primary": "#0b8f6b",
        "action_ink": "#ffffff",
        "border": "#dce8e5",
        "field": "#fbfdfb",
        "raised": "#e9f6f4",
        "accent_soft": "#e2f3ed",
        "scheme": "light",
        "header": "#f9fcfb",
        "header_shadow": "0 6px 18px rgba(7, 20, 29, 0.06)",
        "font_family": '"Segoe UI", system-ui, -apple-system, sans-serif',
    },
    "dark": {
        "background": "#07141d",
        "surface": "#0d1b25",
        "sidebar": "rgba(7, 20, 29, 0.95)",
        "text": "#eaf6ff",
        "muted": "#8eaec5",
        "primary": "#3ae374",
        "action_ink": "#062116",
        "border": "rgba(124, 181, 255, 0.2)",
        "field": "#0c1b27",
        "raised": "#102532",
        "accent_soft": "rgba(58, 227, 116, 0.12)",
        "scheme": "dark",
        "header": "#0d1b25",
        "header_shadow": "0 8px 24px rgba(0, 0, 0, 0.12)",
        "font_family": '"Segoe UI", system-ui, -apple-system, sans-serif',
    },
    "rainbow": {
        "background": "#171b2b",
        "surface": "#23283c",
        "sidebar": "#211f37",
        "text": "#f2eff8",
        "muted": "#c1a7ca",
        "primary": "#ffae62",
        "action_ink": "#33221c",
        "border": "rgba(255, 174, 98, 0.3)",
        "field": "#1c2034",
        "raised": "#302d47",
        "accent_soft": "rgba(255, 174, 98, 0.13)",
        "scheme": "dark",
        "header": "linear-gradient(100deg, #192038, #222044 48%, #38223a)",
        "header_shadow": "0 6px 18px rgba(0, 0, 0, 0.18)",
        "font_family": '"Segoe UI", system-ui, -apple-system, sans-serif',
    },
    "neon": {
        "background": "#0a1820",
        "surface": "#10252d",
        "sidebar": "#10252d",
        "text": "#e4fff8",
        "muted": "#8dbdb9",
        "primary": "#40efdd",
        "action_ink": "#102a2a",
        "border": "rgba(64, 239, 221, 0.28)",
        "field": "#0d2028",
        "raised": "#15323a",
        "accent_soft": "rgba(64, 239, 221, 0.12)",
        "scheme": "dark",
        "header": "#101b2a",
        "header_shadow": "0 5px 24px rgba(33, 230, 215, 0.1)",
        "font_family": '"Segoe UI", system-ui, -apple-system, sans-serif',
    },
    "pop": {
        "background": "#f1f7f3",
        "surface": "#fffdf6",
        "sidebar": "#e3f0e9",
        "text": "#25373b",
        "muted": "#5f7777",
        "primary": "#ef6a57",
        "action_ink": "#ffffff",
        "border": "#ccddd5",
        "field": "#ffffff",
        "raised": "#ffe28a",
        "accent_soft": "#fff0d6",
        "scheme": "light",
        "header": "#fff8e9",
        "header_shadow": "0 6px 18px rgba(7, 20, 29, 0.06)",
        "font_family": '"Segoe UI", system-ui, -apple-system, sans-serif',
    },
    "bloomberg": {
        "background": "#101010",
        "surface": "#181818",
        "sidebar": "#101010",
        "text": "#f2f2f2",
        "muted": "#a6a6a6",
        "primary": "#ff8c00",
        "action_ink": "#111111",
        "border": "#454545",
        "field": "#111111",
        "raised": "#252525",
        "accent_soft": "rgba(255, 140, 0, 0.14)",
        "scheme": "dark",
        "header": "#101010",
        "header_shadow": "inset 0 -1px 0 #ff8c00, 0 8px 24px rgba(0, 0, 0, 0.3)",
        "font_family": '"Consolas", "Courier New", monospace',
    },
}


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


def _theme_label(theme: str) -> str:
    return THEME_LABEL_OVERRIDES.get(theme, theme.upper().replace("_", " "))


def _theme_palette(theme: str) -> dict[str, str]:
    if theme in THEME_STANDARD_PALETTES:
        return THEME_STANDARD_PALETTES[theme]

    background, surface, raised = CUSTOM_THEME_SURFACES.get(
        theme,
        ("#141414", "#1d1d1d", "#2a2a2a"),
    )
    accent = CUSTOM_THEME_ACCENTS[theme]
    return {
        "background": background,
        "surface": surface,
        "sidebar": background,
        "text": "#f2f2f2",
        "muted": "#b3b3b3",
        "primary": accent,
        "border": f"color-mix(in srgb, {accent} 26%, #454545)",
        "field": "#111111",
        "raised": raised,
        "accent_soft": f"color-mix(in srgb, {accent} 14%, transparent)",
        "scheme": "dark",
        "header": surface,
        "header_shadow": "0 5px 18px rgba(0, 0, 0, 0.2)",
        "font_family": '"Segoe UI", system-ui, -apple-system, sans-serif',
    }


def _render_theme_styles(theme: str) -> None:
    palette = _theme_palette(theme)
    st.html(
        f"""
        <style>
        [data-testid="stAppViewContainer"] {{
            --background-color: {palette["background"]};
            --secondary-background-color: {palette["surface"]};
            --text-color: {palette["text"]};
            --primary-color: {palette["primary"]};
            --border-color: {palette["border"]};
            --muted-text-color: {palette["muted"]};
            --field-background-color: {palette["field"]};
            --raised-background-color: {palette["raised"]};
            --accent-soft-color: {palette["accent_soft"]};
            --header-background-color: {palette["header"]};
            color-scheme: {palette["scheme"]};
            background-color: var(--background-color);
            color: var(--text-color);
            font-family: {palette["font_family"]};
        }}
        [data-testid="stSidebar"] {{
            --background-color: {palette["sidebar"]};
            --secondary-background-color: {palette["surface"]};
            --text-color: {palette["text"]};
            --primary-color: {palette["primary"]};
            --border-color: {palette["border"]};
            --muted-text-color: {palette["muted"]};
            --field-background-color: {palette["field"]};
            --raised-background-color: {palette["raised"]};
            --accent-soft-color: {palette["accent_soft"]};
            background-color: var(--background-color);
            color: var(--text-color);
            border-right: 1px solid var(--border-color);
        }}
        [data-testid="stHeader"] {{
            display: none;
        }}
        [data-testid="stAppViewContainer"] [data-baseweb="select"] > div,
        [data-testid="stAppViewContainer"] input,
        [data-testid="stAppViewContainer"] textarea {{
            background-color: var(--field-background-color);
            border-color: var(--border-color);
            color: var(--text-color);
        }}
        [data-testid="stAppViewContainer"] [data-testid="stCaptionContainer"] {{
            color: var(--muted-text-color);
        }}
        [data-testid="stAppViewContainer"] [data-testid="stBaseButton-secondary"] {{
            border-color: var(--border-color);
            background-color: var(--raised-background-color);
            color: var(--text-color);
        }}
        [data-testid="stAppViewContainer"] [data-testid="stBaseButton-primary"] {{
            border-color: var(--primary-color);
            background-color: var(--primary-color);
            color: {palette.get("action_ink", "#111111")};
        }}
        .st-key-global-header,
        .st-key-global-footer {{
            position: fixed;
            left: 0;
            right: 0;
            box-sizing: border-box;
            z-index: 1000000;
            padding-left: 1rem;
            padding-right: 1rem;
            background: var(--header-background-color);
            border-radius: 0;
        }}
        .st-key-global-header {{
            top: 0;
            border-bottom: 1px solid var(--border-color);
            box-shadow: {palette["header_shadow"]};
        }}
        .st-key-global-footer {{
            bottom: 0;
            min-height: 3.375rem;
            border-top: 1px solid var(--border-color);
            background: var(--secondary-background-color);
        }}
        .st-key-global-header h3 {{
            margin: 0;
            font-size: 1rem;
            line-height: 1.2;
        }}
        .st-key-global-header [data-testid="stVerticalBlock"] {{
            gap: 0.25rem;
        }}
        .st-key-global-header [data-testid="stCaptionContainer"],
        .st-key-global-footer [data-testid="stCaptionContainer"] {{
            line-height: 1.2;
        }}
        .st-key-global-header [data-testid="stSelectbox"] {{
            margin-bottom: 0;
        }}
        .st-key-global-header [data-baseweb="select"] > div {{
            min-height: 2rem;
            border-radius: 4px;
        }}
        .st-key-global-footer p {{
            margin: 0;
            font-size: 0.72rem;
        }}
        [data-testid="stSidebar"] a[data-testid="stPageLink-NavLink"] {{
            border-radius: 4px;
            color: var(--text-color);
            text-decoration: none;
        }}
        [data-testid="stSidebar"] a[data-testid="stPageLink-NavLink"]:hover {{
            background: var(--raised-background-color);
            color: var(--primary-color);
        }}
        [data-testid="stSidebar"] a[data-testid="stPageLink-NavLink"] span {{
            color: inherit;
        }}
        [data-testid="stSidebar"] a:hover {{
            border-radius: 4px;
            background: var(--secondary-background-color);
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
            width="stretch",
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
            width="stretch",
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
            width="stretch",
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
    st.dataframe(panel_frame, hide_index=True, width="stretch")
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
            width="stretch",
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


def _render_header() -> None:
    with st.container(key="global-header"):
        (
            brand,
            profile,
            environment,
            theme,
            group,
            language,
            api,
        ) = st.columns(
            [3.6, 1.15, 1.2, 1.05, 0.9, 0.8, 1.15],
            vertical_alignment="center",
        )
        with brand:
            brand_text, caisse_logo, cdc_logo = st.columns(
                [1.8, 0.35, 1.25],
                gap="small",
                vertical_alignment="center",
            )
            with brand_text:
                st.markdown("### Finance Pricer · Terminal")
                st.caption("Hackathon GDA 2026 JARVIS - Team PricerExMachina")
            with caisse_logo:
                st.image(
                    CAISSE_LOGO_PATH,
                    alt="Logo Caisse des Dépôts",
                    width=48,
                )
            with cdc_logo:
                st.image(
                    CDC_INFORMATIQUE_LOGO_PATH,
                    alt="Logo CDC Informatique",
                    width=220,
                )
        with profile:
            st.caption(
                text(
                    "PROFIL · SANS AUTHENTIFICATION",
                    "PROFILE · NO SIGN-IN",
                )
            )
            st.markdown(f"**{text('Local · Admin', 'Local · Admin')}**")
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
                THEME_OPTIONS,
                format_func=_theme_label,
                key="app_theme",
                label_visibility="collapsed",
            )
        with group:
            st.caption(text("GROUPE", "GROUP"))
            st.selectbox(
                text("Groupe", "Group"),
                GROUP_OPTIONS,
                index=GROUP_OPTIONS.index("BO_CASH"),
                key="app_group",
                label_visibility="collapsed",
            )
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
    with st.container(key="global-footer"):
        with st.container(
            horizontal=True,
            horizontal_alignment="distribute",
            vertical_alignment="center",
        ):
            st.caption(
                text(
                    "Finance Pricer · Fixed income & dérivés",
                    "Finance Pricer · Fixed income & derivatives",
                )
            )
            st.caption(
                text(
                    "Prototype · données de démonstration — ne pas utiliser comme conseil financier.",
                    "Prototype · demo data — not financial advice.",
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
    stored_theme = st.session_state["app_theme"]
    theme = str(stored_theme).strip().casefold()
    theme = {"clair": "light", "sombre": "dark"}.get(theme, theme)
    if theme not in THEME_OPTIONS:
        st.warning(
            text(
                f"Thème enregistré inconnu ({stored_theme}) ; le thème clair est utilisé.",
                f"Unknown saved theme ({stored_theme}); using the light theme.",
            )
        )
        theme = "light"
    st.session_state["app_theme"] = theme
    st.session_state["app_theme_palette"] = _theme_palette(theme)
    _render_theme_styles(theme)

    navigation_groups = {
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
            st.Page(
                "pages/panel_automatique.py",
                title=text("Panel automatique", "Automatic panel"),
                icon=":material/search:",
                help=text(
                    "Classer et expliquer les comparables du référentiel marché.",
                    "Rank and explain comparables from the market reference.",
                ),
            ),
            st.Page(
                "pages/pipeline_cas3.py",
                title=text("Z-spread à deux dates", "Z-spread at two dates"),
                icon=":material/timeline:",
                help=text(
                    "Estimer le Z-spread et le yield d'une nouvelle obligation à deux dates d'observation.",
                    "Estimate a new bond's Z-spread and yield at two observation dates.",
                ),
            ),
            st.Page(
                "pages/comparateur.py",
                title=text("Comparateur", "Comparator"),
                icon=":material/compare_arrows:",
                help=text(
                    "Matrice comparative côte-à-côte, sensibilités et choc de taux.",
                    "Side-by-side comparison matrix, sensitivities and rate shock.",
                ),
            ),
            st.Page(
                "pages/terminal_marche.py",
                title=text("Terminal marché", "Market terminal"),
                icon=":material/monitor:",
                help=text(
                    "Finder SECF, fiches DES/YAS et graphique Z-spread du référentiel.",
                    "SECF finder, DES/YAS sheets and Z-spread chart of the reference panel.",
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
        text("GRAPHIQUES", "CHARTS"): [
            st.Page(
                "pages/graphiques.py",
                title=text("Graphiques obligataires", "Bond charts"),
                icon=":material/monitoring:",
                help=text(
                    "Explorer la répartition du panel, les rendements, spreads source, flux et sensibilités obligataires.",
                    "Explore panel distributions, yields, source spreads, cash flows and bond sensitivities.",
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
    }
    page = st.navigation(navigation_groups, position="hidden")

    _render_header()
    st.space(32)
    with st.sidebar:
        st.space(88)
        for section, navigation_pages in navigation_groups.items():
            st.caption(section)
            for navigation_page in navigation_pages:
                st.page_link(
                    navigation_page,
                    label=navigation_page.title,
                    icon=navigation_page.icon,
                    help=navigation_page.help,
                    width="stretch",
                )
        st.divider()
        st.caption(text("Catalogue PostgreSQL · accès en lecture seule", "PostgreSQL catalogue · read-only"))
        st.caption(
            text(
                "Les comparables et données de marché restent saisis manuellement.",
                "Comparables and market data are entered manually.",
            )
        )
        st.space(56)

    page.run()
    st.space(56)
    _render_footer()


if __name__ == "__main__":
    main()
