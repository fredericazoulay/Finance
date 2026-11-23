from datetime import date

import pytest

import database
from curve import SwapPoint
from data_import import (
    parse_euronext_csv,
    parse_euronext_csv_content,
    parse_light_csv,
    parse_swap_curve_csv,
    upsert_market_observations,
    upsert_swap_curve,
)
from market_feeds import parse_euronext_bonds_export

LIGHT_CSV = (
    "securityId;currency;maturityDate;yieldToMaturity;emissionDate;issuer;rating;source;"
    "settlementDate;spreadBps;sector;esgScore;couponRate;couponFrequency;cleanPrice;seniority\n"
    "FRTR 0.50 05/25/2029;EUR;2029-05-25;2,40%;2025-05-25;Demo Issuer 01;SIM-AAA;"
    "Bloomberg / 2026-10-24;2026-10-25;18;Souverain (demo);88;0.50%;2;95.4677;Sovereign senior\n"
    "XS1234567890;EUR;2030-01-01;3,10%;2024-01-01;Demo Issuer 02;BBB;"
    "Bloomberg / 2026-10-24;2026-10-25;108;Corporate;59;1.75%;1;86.3455;Senior\n"
)

EURONEXT_CSV = (
    "European Bonds;;;;;;;;;;;;\n"
    "27-oct-26;;;;;;;;;;;;\n"
    "All datapoints provided as of end of last active trading day.;;;;;;;;;;;;;\n"
    "Name;ISIN;Market;Maturity;Currency;last Price;last Trade MIC Time;Time Zone;Volume;"
    "Issuer;Closing Price;Closing Price DateTime\n"
    "A2A 1.625% CALL 19;XS1701884204;EuroTLX;19/10/2027;%;98.50;13/07/2026 13:08;CET;300000;"
    "A2A S.p.A.;98.67;26/10/2026\n"
    "A2A 1.625% CALL 19;XS1701884204;MOT;19/10/2027;%;-;13/07/2026 13:08;CET;100000;"
    "A2A S.p.A.;98.67;26/10/2026\n"
    "DBR 2.10 11/15/2034;DE0001102341;Xetra;15/11/2034;EUR;101.25;10/10/2026 10:00;CET;1000;"
    "Bundesrepublik;101.00;27/10/2026\n"
)

SWAP_CSV = (
    "date;years;par_rate\n"
    "2026-01-02;0.5;2.0\n"
    "2026-01-02;1;2.2\n"
    "2026-02-02;0.5;2.1\n"
)


def test_parse_light_csv_maps_fields_and_extracts_market_date(tmp_path):
    path = tmp_path / "light.csv"
    path.write_text(LIGHT_CSV, encoding="utf-8")

    rows = parse_light_csv(path)

    assert len(rows) == 2
    first, second = rows
    assert len(first["isin"]) == 12 and first["isin"].startswith("L")
    assert second["isin"] == "XS1234567890"
    assert first["market_date"] == date(2026, 10, 24)
    assert first["yield_to_maturity_pct"] == pytest.approx(2.40)
    assert first["coupon_rate_pct"] == pytest.approx(0.50)
    assert first["payment_frequency"] == 2
    assert first["clean_price"] == pytest.approx(95.4677)
    assert first["rating"] == "SIM-AAA"
    assert first["rating_agency"] == "SIM"
    assert first["data_status"] == "unverified"
    assert first["provider_claim"] == "Bloomberg / 2026-10-24"
    assert first["maturity_date"] == date(2029, 5, 25)


def test_parse_light_csv_requires_a_market_date(tmp_path):
    path = tmp_path / "light.csv"
    path.write_text(
        LIGHT_CSV.replace("Bloomberg / 2026-10-24", "Bloomberg"), encoding="utf-8"
    )

    with pytest.raises(ValueError, match="Date de marché"):
        parse_light_csv(path)


def test_parse_euronext_csv_deduplicates_and_reads_coupon_and_price(tmp_path):
    path = tmp_path / "euronext.csv"
    path.write_text(EURONEXT_CSV, encoding="utf-8")

    rows = parse_euronext_csv(path)

    assert len(rows) == 2
    by_isin = {row["isin"]: row for row in rows}
    a2a = by_isin["XS1701884204"]
    assert a2a["clean_price"] == pytest.approx(98.50)
    assert a2a["coupon_rate_pct"] == pytest.approx(1.625)
    assert a2a["is_callable"] is True
    assert a2a["currency"] == "EUR"
    assert a2a["market_date"] == date(2026, 10, 26)
    assert a2a["maturity_date"] == date(2027, 10, 19)
    assert a2a["data_status"] == "unverified"
    dbr = by_isin["DE0001102341"]
    assert dbr["coupon_rate_pct"] == pytest.approx(2.10)
    assert dbr["market_date"] == date(2026, 10, 27)


def test_parse_euronext_csv_market_date_override(tmp_path):
    path = tmp_path / "euronext.csv"
    path.write_text(EURONEXT_CSV, encoding="utf-8")

    rows = parse_euronext_csv(path, market_date=date(2026, 10, 27))

    assert all(row["market_date"] == date(2026, 10, 27) for row in rows)


def test_parse_euronext_csv_content_defaults_to_unverified():
    rows = parse_euronext_csv_content(EURONEXT_CSV)

    assert rows[0]["data_status"] == "unverified"
    assert rows[0]["market_date"] == date(2026, 10, 26)


def test_parse_euronext_csv_content_rejects_unknown_status():
    with pytest.raises(ValueError, match="data_status"):
        parse_euronext_csv_content(EURONEXT_CSV, data_status="trusted")


def test_parse_euronext_bonds_export_preserves_provenance_and_attestation():
    content = EURONEXT_CSV.encode("utf-8")

    unverified = parse_euronext_bonds_export(content, "daily.csv")
    confirmed = parse_euronext_bonds_export(
        content,
        "daily.csv",
        confirmed_internal_noncommercial_use=True,
    )

    assert unverified[0]["data_status"] == "unverified"
    assert confirmed[0]["data_status"] == "official"
    assert "Euronext Bonds export · daily.csv ·" in confirmed[0]["source_name"]
    assert confirmed[0]["provider_claim"] == "Euronext"
    assert confirmed[0]["source_name"] == unverified[0]["source_name"]


def test_parse_euronext_bonds_export_rejects_non_utf8_file():
    with pytest.raises(ValueError, match="UTF-8"):
        parse_euronext_bonds_export(b"\xff", "daily.csv")


def test_parse_euronext_csv_falls_back_to_report_date(tmp_path):
    csv_text = EURONEXT_CSV.replace(
        "Bundesrepublik;101.00;27/10/2026", "Bundesrepublik;101.00;-"
    )
    path = tmp_path / "euronext.csv"
    path.write_text(csv_text, encoding="utf-8")

    rows = parse_euronext_csv(path)
    by_isin = {row["isin"]: row for row in rows}

    # Ligne sans « Closing Price DateTime » : repli sur la date de rapport (27-oct-26).
    assert by_isin["DE0001102341"]["market_date"] == date(2026, 10, 27)
    assert by_isin["DE0001102341"]["coupon_rate_pct"] == pytest.approx(2.10)


def test_parse_swap_curve_csv_groups_by_date(tmp_path):
    path = tmp_path / "swaps.csv"
    path.write_text(SWAP_CSV, encoding="utf-8")

    curves = parse_swap_curve_csv(path)

    assert set(curves) == {date(2026, 1, 2), date(2026, 2, 2)}
    assert curves[date(2026, 1, 2)] == [SwapPoint(0.5, 0.02), SwapPoint(1.0, 0.022)]
    assert curves[date(2026, 2, 2)] == [SwapPoint(0.5, 0.021)]


class _FakeCursor:
    def __init__(self):
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, sql, params):
        self.executed.append((sql, params))


class _FakeConnection:
    def __init__(self):
        self.cursor_obj = _FakeCursor()

    def cursor(self):
        return self.cursor_obj

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_upsert_market_observations_runs_one_upsert_per_row(tmp_path):
    path = tmp_path / "light.csv"
    path.write_text(LIGHT_CSV, encoding="utf-8")
    rows = parse_light_csv(path)
    connection = _FakeConnection()

    count = upsert_market_observations(rows, connect=connection)

    assert count == 2
    assert len(connection.cursor_obj.executed) == 2
    sql, params = connection.cursor_obj.executed[0]
    assert "ON CONFLICT (isin, source_name) DO UPDATE" in sql
    assert params["isin"] == rows[0]["isin"]
    assert params["clean_price"] == pytest.approx(95.4677)


def test_upsert_market_observations_uses_write_connection(monkeypatch):
    connection = _FakeConnection()
    connection_options = []
    monkeypatch.setattr(
        database,
        "_connect",
        lambda **options: connection_options.append(options) or connection,
    )

    count = upsert_market_observations(parse_euronext_csv_content(EURONEXT_CSV))

    assert count == 2
    assert connection_options == [{"read_only": False}]


def test_upsert_swap_curve_inserts_points():
    connection = _FakeConnection()

    count = upsert_swap_curve(
        {date(2026, 1, 2): [SwapPoint(0.5, 0.02), SwapPoint(1.0, 0.022)]},
        source_name="courbe-test",
        data_status="official",
        connect=connection,
    )

    assert count == 2
    sql, params = connection.cursor_obj.executed[0]
    assert "bp2s.swap_curve" in sql
    assert params == (
        date(2026, 1, 2),
        0.5,
        0.02,
        "courbe-test",
        "official",
    )


def test_upsert_swap_curve_rejects_unknown_status():
    with pytest.raises(ValueError, match="data_status"):
        upsert_swap_curve(
            {date(2026, 1, 2): [SwapPoint(0.5, 0.02)]},
            source_name="courbe-test",
            data_status="trusted",
        )


def test_upsert_swap_curve_rejects_empty_source():
    with pytest.raises(ValueError, match="source_name"):
        upsert_swap_curve(
            {date(2026, 1, 2): [SwapPoint(0.5, 0.02)]},
            source_name=" ",
        )
