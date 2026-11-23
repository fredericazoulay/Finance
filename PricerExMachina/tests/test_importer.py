from datetime import date
from io import BytesIO

import pytest
from openpyxl import Workbook

from app.importer import WorkbookValidationError, preview_market_workbook


def workbook_bytes():
    workbook = Workbook()
    market = workbook.active
    market.title = "market_observations"
    market.append(["isin", "currency", "maturity_date", "market_date", "spread_bps", "source_name", "data_status"])
    market.append(["PEER", "EUR", date(2030, 6, 1), date(2026, 10, 27), 100, "official", "official"])
    curve = workbook.create_sheet("zero_curve")
    curve.append(["observation_date", "tenor_years", "zero_rate", "source_name", "data_status"])
    curve.append([date(2026, 10, 27), 5, 0.025, "curve source", "official"])
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_workbook_preview_normalizes_dates_and_never_writes_to_database():
    result = preview_market_workbook(workbook_bytes())
    assert result["market_observations"]["valid_rows"] == 1
    assert result["market_observations"]["preview"][0]["market_date"] == "2026-10-27"
    assert result["zero_curve_nodes"]["valid_rows"] == 1
    assert result["writes_performed"] is False


def test_workbook_preview_rejects_missing_required_columns():
    workbook = Workbook()
    workbook.active.title = "market_observations"
    workbook.active.append(["isin", "currency"])
    buffer = BytesIO()
    workbook.save(buffer)
    with pytest.raises(WorkbookValidationError, match="missing required columns"):
        preview_market_workbook(buffer.getvalue())
