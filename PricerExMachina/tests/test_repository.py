import unittest
from pathlib import Path
from datetime import date

from app.repository import PEERS_SQL, SWAP_PAR_CURVE_SQL, PostgresRepository


class Cursor:
    description = []

    def __init__(self, rows=()):
        self.rows = rows

    def fetchall(self):
        return self.rows


class Connection:
    def __init__(self):
        self.statements = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, params=None):
        self.statements.append((query, params))
        return Cursor()


class RepositorySafetyTests(unittest.TestCase):
    def test_market_queries_are_fixed_parameterized_read_queries(self):
        source = (Path(__file__).parents[1] / "app" / "repository.py").read_text(encoding="utf-8")
        self.assertIn("SET TRANSACTION READ ONLY", source)
        self.assertIn("currency = %s", PEERS_SQL)
        self.assertIn("market_date = %s", PEERS_SQL)
        self.assertIn("isin <> %s", PEERS_SQL)
        self.assertIn("LIMIT %s", PEERS_SQL)
        self.assertIn("curve_date = %s", SWAP_PAR_CURVE_SQL)
        self.assertNotIn("{", PEERS_SQL)
        self.assertNotIn(";", PEERS_SQL)

    def test_adapter_enforces_read_only_and_binds_all_user_values(self):
        connection = Connection()
        repository = PostgresRepository("postgresql://unused", lambda _url: connection)
        repository.fetch_date_inputs(
            {"currency": "EUR", "isin": "TARGET"},
            "2026-10-27",
        )
        self.assertEqual(connection.statements[0], ("SET TRANSACTION READ ONLY", None))
        self.assertEqual(
            connection.statements[1][1],
            ("EUR", date(2026, 10, 27), "TARGET", 5000),
        )
        self.assertEqual(connection.statements[1][0], PEERS_SQL)
        self.assertEqual(connection.statements[2][1], (date(2026, 10, 27), 1000))
        self.assertEqual(connection.statements[2][0], SWAP_PAR_CURVE_SQL)


if __name__ == "__main__":
    unittest.main()
