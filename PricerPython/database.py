"""Accès en lecture seule au catalogue PostgreSQL des obligations."""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from typing import Any

from curve import SwapPoint
import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

PROJECT_DIRECTORY = Path(__file__).resolve().parent
OBLIGATION_COLUMNS = (
    "isin",
    "produit",
    "type_obl",
    "cusip",
    "obligation",
    "emetteur",
    "famille",
    "sousfamille",
    "secteur",
    "type_bbg",
    "convention_int",
    "date_premier_cpn",
    "date_maturite",
    "date_maturite_attendue",
    "date_annonce",
    "prix_remboursement",
    "montant_emission",
    "type_conversion",
    "calendrier",
    "coupon_hybride",
    "convention_calc",
    "devise",
    "prix_emission",
    "lei",
)
MARKET_OBSERVATION_COLUMNS = (
    "observation_id",
    "isin",
    "issuer",
    "issuer_type",
    "bond_type",
    "currency",
    "issue_date",
    "maturity_date",
    "coupon_type",
    "coupon_rate_pct",
    "day_count",
    "payment_frequency",
    "is_callable",
    "is_putable",
    "is_convertible",
    "is_perpetual",
    "is_inflation_linked",
    "is_green_bond",
    "is_social_bond",
    "is_sustainability_bond",
    "is_sustainability_linked",
    "is_secured",
    "seniority",
    "rating_agency",
    "rating",
    "country",
    "market",
    "face_value",
    "yield_to_maturity_pct",
    "spread_bps",
    "esg_score",
    "provider_claim",
    "reference_rate",
    "market_date",
    "source_name",
    "data_status",
    "clean_price",
)


class DatabaseConfigurationError(RuntimeError):
    """Configuration PostgreSQL absente ou invalide."""


def load_local_environment() -> None:
    configured_env_file = os.environ.get("POSTGRES_ENV_FILE")
    if configured_env_file:
        env_file = Path(configured_env_file).expanduser()
        if not env_file.is_file():
            raise DatabaseConfigurationError(
                f"Le fichier POSTGRES_ENV_FILE est introuvable : {env_file}"
            )
        load_dotenv(env_file, override=False)
        return

    for env_file in (
        PROJECT_DIRECTORY / ".env",
        PROJECT_DIRECTORY.parent / "FinanceCalculatorBackend" / ".env",
    ):
        if env_file.is_file():
            load_dotenv(env_file, override=False)
            return


def _connect() -> psycopg.Connection[dict[str, Any]]:
    load_local_environment()
    password = os.environ.get("POSTGRES_PASSWORD")
    if not password:
        raise DatabaseConfigurationError(
            "POSTGRES_PASSWORD est absent. Configurez l'environnement ou "
            "POSTGRES_ENV_FILE avec le fichier .env du backend."
        )

    try:
        port = int(os.environ.get("POSTGRES_PORT", "5432"))
    except ValueError as exc:
        raise DatabaseConfigurationError("POSTGRES_PORT doit être un entier.") from exc

    return psycopg.connect(
        host=os.environ.get("POSTGRES_HOST", "127.0.0.1"),
        port=port,
        dbname=os.environ.get("POSTGRES_DB", "finance_pricer"),
        user=os.environ.get("POSTGRES_USER", "finance_pricer"),
        password=password,
        connect_timeout=5,
        options="-c default_transaction_read_only=on",
        row_factory=dict_row,
    )


def search_obligations(
    search: str | None = None, *, limit: int = 100
) -> list[dict[str, Any]]:
    """Recherche le catalogue par ISIN, émetteur ou nom d'obligation."""
    if not 1 <= limit <= 500:
        raise ValueError("La limite doit être comprise entre 1 et 500.")

    columns = ", ".join(OBLIGATION_COLUMNS)
    query = f"SELECT {columns} FROM bp2s.obligation"
    parameters: tuple[str | int, ...]
    normalized_search = search.strip() if search else ""
    if normalized_search:
        query += " WHERE isin ILIKE %s OR emetteur ILIKE %s OR obligation ILIKE %s"
        pattern = f"%{normalized_search}%"
        parameters = (pattern, pattern, pattern, limit)
    else:
        parameters = (limit,)
    query += " ORDER BY isin LIMIT %s"

    with _connect() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return list(rows)


def list_all_obligations() -> list[dict[str, Any]]:
    """Lit toutes les obligations pour l'export, sans modifier la base."""
    columns = ", ".join(OBLIGATION_COLUMNS)
    with _connect() as connection:
        rows = connection.execute(
            f"SELECT {columns} FROM bp2s.obligation ORDER BY isin",
            (),
        ).fetchall()
    return list(rows)


def list_market_observations(*, limit: int = 5000) -> list[dict[str, Any]]:
    """Lit le référentiel de marché avec ses champs de provenance."""
    if not 1 <= limit <= 10000:
        raise ValueError("La limite doit être comprise entre 1 et 10 000.")

    columns = ", ".join(MARKET_OBSERVATION_COLUMNS)
    with _connect() as connection:
        rows = connection.execute(
            f"""
            SELECT {columns}
            FROM bp2s.market_observation
            ORDER BY currency, maturity_date, isin
            LIMIT %s
            """,
            (limit,),
        ).fetchall()
    return list(rows)



def list_swap_curves(*, source_name: str | None = None) -> dict[date, list[SwapPoint]]:
    """Lire les taux swap EUR au pair par date d'observation (courbe EUR 6M)."""
    query = "SELECT curve_date, years, par_rate FROM bp2s.swap_curve"
    parameters: tuple[str, ...] = ()
    if source_name:
        query += " WHERE source_name = %s"
        parameters = (source_name,)
    query += " ORDER BY curve_date, years"
    with _connect() as connection:
        rows = connection.execute(query, parameters).fetchall()
    curves: dict[date, list[SwapPoint]] = {}
    for row in rows:
        curves.setdefault(row["curve_date"], []).append(
            SwapPoint(float(row["years"]), float(row["par_rate"]))
        )
    return curves
