"""Streamlit interface for submitting pricing requests and reviewing results."""

from __future__ import annotations

import json
import os
from typing import Any

import httpx
import matplotlib.pyplot as plt
import numpy as np
import streamlit as st


st.set_page_config(page_title="PricerExMachina", layout="wide")
API_URL = os.getenv("PRICER_API_URL", "http://127.0.0.1:8080").rstrip("/")
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _show_spread_charts(result: dict[str, Any]) -> None:
    for valuation in result.get("valuations", []):
        comparables = valuation.get("comparables") or []
        if not comparables:
            continue
        spreads = np.asarray([item["spread_bps"] for item in comparables], dtype=np.float64)
        labels = [item["isin"] for item in comparables]
        figure, axis = plt.subplots(figsize=(max(6, len(labels) * 0.6), 3.5))
        axis.bar(labels, spreads, color="#4472C4")
        if valuation.get("z_spread_bps") is not None:
            axis.axhline(
                valuation["z_spread_bps"],
                color="#C00000",
                linestyle="--",
                label=f"Z-spread estimé: {valuation['z_spread_bps']:.1f} bps",
            )
            axis.legend()
        axis.set_title(f"Comparables — {valuation['observation_date']}")
        axis.set_ylabel("Spread (bps)")
        axis.tick_params(axis="x", labelrotation=45)
        figure.tight_layout()
        st.pyplot(figure)
        plt.close(figure)


st.title("PricerExMachina")
st.caption("Analyse explicable d’obligations comparables. Les résultats dépendent des données et conventions fournies.")

with st.expander("Prévisualiser un classeur de marché (.xlsx)"):
    uploaded_file = st.file_uploader("Classeur à valider", type=["xlsx"])
    if uploaded_file is not None and st.button("Prévisualiser le classeur"):
        try:
            response = httpx.post(
                f"{API_URL}/api/market-data/preview",
                content=uploaded_file.getvalue(),
                headers={"Content-Type": XLSX_CONTENT_TYPE},
                timeout=30,
            )
            response.raise_for_status()
            st.json(response.json())
            st.info("La prévisualisation est en lecture seule : aucune donnée n’est importée dans PostgreSQL.")
        except httpx.HTTPError as exc:
            st.error(f"Service de prévisualisation indisponible : {exc}")

st.subheader("Demande de pricing")
request_json = st.text_area(
    "Corps JSON pour POST /api/pricing",
    height=360,
    placeholder='{"target": {...}, "observation_dates": ["YYYY-MM-DD", "YYYY-MM-DD"], "selection": {...}}',
)
calculate_clicked = st.button("Calculer")
if calculate_clicked and request_json.strip():
    try:
        payload = json.loads(request_json)
    except json.JSONDecodeError as exc:
        st.error(f"JSON invalide : {exc}")
    else:
        try:
            response = httpx.post(f"{API_URL}/api/pricing", json=payload, timeout=60)
            response.raise_for_status()
            result = response.json()
        except httpx.HTTPStatusError as exc:
            st.error(f"Le service a refusé la demande : {exc.response.text}")
        except httpx.HTTPError as exc:
            st.error(f"Service de pricing indisponible : {exc}")
        else:
            st.json(result)
            _show_spread_charts(result)
elif calculate_clicked:
    st.warning("Saisissez une demande JSON avant de lancer le calcul.")

with st.expander("État du service et de l’audit"):
    if st.button("Vérifier l’état"):
        try:
            health = httpx.get(f"{API_URL}/health", timeout=5)
            health.raise_for_status()
            st.json(health.json())
            mailpit = httpx.get(f"{API_URL}/api/audit/mailpit", timeout=10)
            mailpit.raise_for_status()
            st.json(mailpit.json())
        except httpx.HTTPError as exc:
            st.error(f"Vérification indisponible : {exc}")
