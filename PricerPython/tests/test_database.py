import pytest

import database


class FakeConnection:
    def __init__(self):
        self.query = ""
        self.parameters = ()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def execute(self, query, parameters):
        self.query = query
        self.parameters = parameters
        return self

    def fetchall(self):
        return [{"isin": "XS1000000002", "devise": "EUR"}]


def test_search_obligations_uses_parameterized_read_only_connection(monkeypatch):
    monkeypatch.delenv("POSTGRES_ENV_FILE", raising=False)
    monkeypatch.setenv("POSTGRES_HOST", "127.0.0.1")
    monkeypatch.setenv("POSTGRES_PORT", "5432")
    monkeypatch.setenv("POSTGRES_DB", "finance_pricer")
    monkeypatch.setenv("POSTGRES_USER", "finance_pricer")
    monkeypatch.setenv("POSTGRES_PASSWORD", "test-password")
    fake_connection = FakeConnection()
    connection_options = {}

    def fake_connect(**options):
        connection_options.update(options)
        return fake_connection

    monkeypatch.setattr(database.psycopg, "connect", fake_connect)

    rows = database.search_obligations("XS' OR TRUE --", limit=7)

    assert rows == [{"isin": "XS1000000002", "devise": "EUR"}]
    assert "ILIKE %s OR emetteur ILIKE %s OR obligation ILIKE %s" in fake_connection.query
    assert fake_connection.parameters == (
        "%XS' OR TRUE --%",
        "%XS' OR TRUE --%",
        "%XS' OR TRUE --%",
        7,
    )
    assert connection_options["options"] == "-c default_transaction_read_only=on"


def test_search_obligations_rejects_invalid_limit():
    with pytest.raises(ValueError, match="entre 1 et 500"):
        database.search_obligations(limit=501)
