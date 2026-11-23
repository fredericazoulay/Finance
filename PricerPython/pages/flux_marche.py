"""Import manuel d'un fichier obligataire Euronext différé."""

import pandas as pd
import psycopg
import streamlit as st

from data_import import upsert_market_observations
from database import DatabaseConfigurationError
from localization import text
from market_feeds import EURONEXT_DELAYED_DATA_URL, parse_euronext_bonds_export

st.subheader(text("Flux de marché différés", "Delayed market data"))
st.caption(
    text(
        "Import manuel d'un export obligataire Euronext au format "
        "« European Bonds » pris en charge par l'application. Les données "
        "différées sont gratuites pour un usage interne non commercial ; "
        "elles ne doivent pas être redistribuées.",
        "Manual import of an Euronext bond export in the application's "
        "supported 'European Bonds' format. Delayed data is free for internal "
        "non-commercial use and must not be redistributed.",
    )
)
st.link_button(
    text(
        "Accéder aux données différées Euronext (MiFID II)",
        "Open Euronext delayed data (MiFID II)",
    ),
    EURONEXT_DELAYED_DATA_URL,
)
st.info(
    text(
        "Le téléchargement Euronext s'effectue sur son site et sous ses "
        "conditions. Cette page ne se connecte pas à un flux temps réel et "
        "ne récupère pas automatiquement les fichiers ; les fichiers de "
        "transactions MiFID II dont le format diffère de l'export "
        "« European Bonds » ne sont pas pris en charge.",
        "Download files from Euronext under its terms. This page does not "
        "connect to a real-time feed or fetch files automatically; MiFID II "
        "trade files in a format different from the 'European Bonds' export "
        "are not supported.",
    ),
    title=text("Périmètre du connecteur", "Connector scope"),
)

uploaded_file = st.file_uploader(
    text("Fichier CSV Euronext Bonds", "Euronext Bonds CSV file"),
    type="csv",
    key="euronext_bonds_csv",
)

if uploaded_file is not None:
    confirmed = st.checkbox(
        text(
            "Je confirme que ce fichier provient d'Euronext et que son usage "
            "reste interne et non commercial, sans redistribution.",
            "I confirm this file comes from Euronext and will be used internally "
            "for non-commercial purposes only, without redistribution.",
        ),
        key="euronext_internal_use_confirmed",
    )
    try:
        rows = parse_euronext_bonds_export(
            uploaded_file.getvalue(),
            uploaded_file.name,
            confirmed_internal_noncommercial_use=confirmed,
        )
    except (UnicodeDecodeError, ValueError) as exc:
        st.error(str(exc))
    else:
        st.caption(
            text(
                f"{len(rows)} obligation(s) exploitable(s) · source "
                f"{rows[0]['source_name']} · statut "
                f"{rows[0]['data_status']}",
                f"{len(rows)} usable bond(s) · source "
                f"{rows[0]['source_name']} · status "
                f"{rows[0]['data_status']}",
            )
        )
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "ISIN": row["isin"],
                        "Émetteur": row["issuer"],
                        "Devise": row["currency"],
                        "Maturité": row["maturity_date"],
                        "Coupon (%)": row["coupon_rate_pct"],
                        "Prix clean": row["clean_price"],
                        "Date marché": row["market_date"],
                        "Statut": row["data_status"],
                    }
                    for row in rows
                ]
            ),
            hide_index=True,
            alt=text(
                "Aperçu des observations obligataires Euronext avant import",
                "Preview of Euronext bond observations before import",
            ),
        )
        if not confirmed:
            st.warning(
                text(
                    "Confirmez l'origine et l'usage autorisé pour marquer les "
                    "observations official. Sans confirmation, elles ne seront "
                    "pas importées.",
                    "Confirm the source and permitted use to mark observations "
                    "official. Without confirmation, they will not be imported.",
                )
            )
        if st.button(
            text("Importer les observations", "Import observations"),
            key="euronext_import",
            type="primary",
            disabled=not confirmed,
        ):
            try:
                imported = upsert_market_observations(rows)
            except DatabaseConfigurationError as exc:
                st.error(str(exc))
            except psycopg.Error as exc:
                st.error(
                    text(
                        f"Import PostgreSQL impossible : {exc}",
                        f"PostgreSQL import failed: {exc}",
                    )
                )
            else:
                st.success(
                    text(
                        f"{imported} observation(s) importée(s) dans PostgreSQL.",
                        f"{imported} observation(s) imported into PostgreSQL.",
                    )
                )
