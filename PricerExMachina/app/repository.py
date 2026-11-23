"""Read-only adapter for the existing bp2s PostgreSQL schema."""

from __future__ import annotations

import os
from datetime import date
from typing import Any


# Fixed SQL only: user input is always passed as driver parameters. This adapter
# intentionally follows FinanceCalculatorBackend/db/init/03- and 04-*.sql.
PEERS_SQL = """
SELECT isin, issuer, issuer_type, currency, maturity_date, rating, seniority,
       spread_bps, market_date, source_name, data_status
FROM bp2s.market_observation
WHERE currency = %s
  AND market_date = %s
  AND isin <> %s
  AND data_status = 'official'
  AND spread_bps IS NOT NULL
  AND maturity_date IS NOT NULL
ORDER BY isin
LIMIT %s
"""

SWAP_PAR_CURVE_SQL = """
SELECT years, par_rate, source_name, data_status
FROM bp2s.swap_curve
WHERE curve_date = %s
ORDER BY years, source_name
LIMIT %s
"""


class PostgresRepository:
    def __init__(self, database_url: str | None = None, connect_factory: Any = None):
        self.database_url = database_url or os.getenv("DATABASE_URL")
        self.connect_factory = connect_factory

    def _connect(self):
        if not self.database_url:
            raise RuntimeError("DATABASE_URL is not configured; PostgreSQL pricing data is unavailable")
        factory = self.connect_factory
        if factory is None:
            try:
                import psycopg
            except ImportError as exc:
                raise RuntimeError("Install the optional PostgreSQL adapter: pip install '.[postgres]'") from exc
            factory = psycopg.connect
        return factory(self.database_url)

    def fetch_date_inputs(self, target: dict[str, Any], observation_date: str) -> dict[str, Any]:
        with self._connect() as connection:
            connection.execute("SET TRANSACTION READ ONLY")
            peer_cursor = connection.execute(
                PEERS_SQL,
                (target["currency"], date.fromisoformat(observation_date), target["isin"], 5000),
            )
            peers = self._mapping_rows(peer_cursor)
            curve_cursor = connection.execute(SWAP_PAR_CURVE_SQL, (date.fromisoformat(observation_date), 1000))
            par_curve = self._mapping_rows(curve_cursor)
        return {"peers": peers, "swap_par_curve": par_curve}

    @staticmethod
    def _mapping_rows(cursor: Any) -> list[dict[str, Any]]:
        rows = cursor.fetchall()
        if not rows:
            return []
        if isinstance(rows[0], dict):
            return [dict(row) for row in rows]
        columns = [column.name if hasattr(column, "name") else column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in rows]
