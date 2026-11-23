"""Read-only validation and preview for market workbooks."""

from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
import math
from typing import Any
from zipfile import BadZipFile

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException


MARKET_SHEET = "market_observations"
CURVE_SHEET = "zero_curve"
MARKET_REQUIRED = {
    "isin", "currency", "maturity_date", "market_date",
    "spread_bps", "source_name", "data_status",
}
CURVE_REQUIRED = {"observation_date", "tenor_years", "zero_rate", "source_name", "data_status"}


class WorkbookValidationError(ValueError):
    """Raised when a workbook cannot be safely previewed."""


def _cell_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def _read_sheet(sheet: Any, required_columns: set[str]) -> tuple[list[dict[str, Any]], list[str]]:
    iterator = sheet.iter_rows(values_only=True)
    header_row = next(iterator, None)
    if not header_row:
        raise WorkbookValidationError(f"Worksheet '{sheet.title}' is empty")
    headers = [
        str(value).strip().casefold() if value is not None else ""
        for value in header_row
    ]
    if len(set(header for header in headers if header)) != len([header for header in headers if header]):
        raise WorkbookValidationError(f"Worksheet '{sheet.title}' has duplicate column names")
    missing = sorted(required_columns.difference(headers))
    if missing:
        raise WorkbookValidationError(
            f"Worksheet '{sheet.title}' is missing required columns: {', '.join(missing)}"
        )

    records: list[dict[str, Any]] = []
    errors: list[str] = []
    for row_number, values in enumerate(iterator, start=2):
        if not any(value is not None for value in values):
            continue
        record = {
            header: _cell_value(values[index]) if index < len(values) else None
            for index, header in enumerate(headers)
            if header
        }
        missing_values = sorted(
            column for column in required_columns
            if record.get(column) is None or str(record.get(column)).strip() == ""
        )
        if missing_values:
            errors.append(f"Row {row_number}: missing {', '.join(missing_values)}")
            continue
        try:
            for date_field in ("maturity_date", "market_date", "observation_date"):
                if date_field in record:
                    date.fromisoformat(str(record[date_field]))
            number_fields = (
                ("spread_bps",) if "spread_bps" in record
                else ("tenor_years", "zero_rate")
            )
            for field in number_fields:
                number = float(record[field])
                if not math.isfinite(number):
                    raise ValueError(f"{field} must be finite")
                record[field] = number
            if "tenor_years" in record and record["tenor_years"] <= 0:
                raise ValueError("tenor_years must be positive")
        except (TypeError, ValueError) as exc:
            errors.append(f"Row {row_number}: {exc}")
            continue
        records.append(record)
    return records, errors


def preview_market_workbook(content: bytes) -> dict[str, Any]:
    """Validate supported worksheet headers and return a bounded, read-only preview."""
    if not content:
        raise WorkbookValidationError("Workbook is empty")
    try:
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    except (BadZipFile, InvalidFileException, OSError, ValueError) as exc:
        raise WorkbookValidationError("File is not a readable Excel workbook") from exc

    try:
        if MARKET_SHEET not in workbook.sheetnames:
            raise WorkbookValidationError(f"Workbook must contain a '{MARKET_SHEET}' worksheet")
        market_rows, market_errors = _read_sheet(workbook[MARKET_SHEET], MARKET_REQUIRED)
        curve_rows: list[dict[str, Any]] = []
        curve_errors: list[str] = []
        if CURVE_SHEET in workbook.sheetnames:
            curve_rows, curve_errors = _read_sheet(workbook[CURVE_SHEET], CURVE_REQUIRED)
        return {
            "market_observations": {
                "valid_rows": len(market_rows),
                "invalid_rows": market_errors[:20],
                "preview": market_rows[:10],
            },
            "zero_curve_nodes": {
                "valid_rows": len(curve_rows),
                "invalid_rows": curve_errors[:20],
                "preview": curve_rows[:10],
            },
            "writes_performed": False,
            "warnings": (
                ["No 'zero_curve' worksheet was found; par-rate curves are not converted."]
                if CURVE_SHEET not in workbook.sheetnames else []
            ),
        }
    finally:
        workbook.close()
