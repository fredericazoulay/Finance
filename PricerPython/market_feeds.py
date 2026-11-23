"""Adaptateurs pour les fichiers de données de marché publics."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from data_import import parse_euronext_csv_content

EURONEXT_DELAYED_DATA_URL = (
    "https://marketdata.euronext.com/data-reporting-service/trades-file"
)


def parse_euronext_bonds_export(
    content: bytes,
    filename: str,
    *,
    confirmed_internal_noncommercial_use: bool = False,
) -> list[dict[str, Any]]:
    """Parser un export Euronext Bonds après confirmation de son statut."""
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("Le fichier Euronext doit être encodé en UTF-8.") from exc

    safe_filename = Path(filename).name.strip()
    if not safe_filename:
        raise ValueError("Le nom du fichier Euronext est absent.")

    digest = hashlib.sha256(content).hexdigest()[:12]
    source_name = f"Euronext Bonds export · {safe_filename} · {digest}"
    data_status = (
        "official" if confirmed_internal_noncommercial_use else "unverified"
    )
    return parse_euronext_csv_content(
        decoded,
        source_name=source_name,
        data_status=data_status,
    )
