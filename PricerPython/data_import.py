"""Import des jeux de données de marché fournis vers PostgreSQL (deux dates d'observation)."""

from __future__ import annotations

import csv
import hashlib
import re
from datetime import date
from pathlib import Path
from typing import Any, Iterable

from curve import SwapPoint
from database import MARKET_OBSERVATION_COLUMNS

_PERCENT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")
_ISO_DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")
_COUPON_BEFORE_DATE_RE = re.compile(r"(\d{1,2}(?:[.,]\d{1,3})?)\s+\d{1,2}/\d{1,2}/\d{2,4}\b")
_COUPON_AFTER_BOND_RE = re.compile(r"\bBOND\s+(\d{1,2}(?:[.,]\d{1,3})?)\b", re.IGNORECASE)


def _parse_decimal(value: Any) -> float | None:
    """Parser un nombre français ou anglais : « 1.234,56 », « 98.15 », « 2,40 »."""
    text = str(value or "").strip()
    if not text or text == "-":
        return None
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _parse_percent(value: Any) -> float | None:
    """Parser un pourcentage « 2,40% » en nombre décimal de points (2.40)."""
    match = _PERCENT_RE.search(str(value or ""))
    if not match:
        return None
    return _parse_decimal(match.group(1))


def _parse_iso_date(value: Any) -> date | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _parse_fr_date(value: Any) -> date | None:
    """Parser une date « 26/10/2026 » ou « 22/05/2028 »."""
    text = str(value or "").strip()
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
    if not match:
        return None
    day, month, year = (int(part) for part in match.groups())
    try:
        return date(year, month, day)
    except ValueError:
        return None


_MONTHS_EN = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _parse_report_date(value: Any) -> date | None:
    """Parser la date de rapport Euronext « 27-oct-26 » (2e ligne du fichier)."""
    text = str(value or "").strip().lower()
    match = re.fullmatch(r"(\d{1,2})-([a-z]{3})-(\d{2,4})", text)
    if not match:
        return None
    day, month_name, year = match.groups()
    month = _MONTHS_EN.get(month_name)
    year_int = int(year)
    if year_int < 100:
        year_int += 2000
    if month is None:
        return None
    try:
        return date(year_int, month, int(day))
    except ValueError:
        return None


def _parse_coupon_from_name(name: str) -> float | None:
    """Extraire le coupon du libellé Euronext.

    Formats observés : « A2A 1.625% CALL 19 », « DBR 2.10 11/15/2034 »,
    « A2A GREEN BOND 4,5 », « 4MOVBIO12%17JUN27 ».
    """
    percent = _parse_percent(name)
    if percent is not None:
        return percent
    for pattern in (_COUPON_BEFORE_DATE_RE, _COUPON_AFTER_BOND_RE):
        match = pattern.search(name or "")
        if match:
            return _parse_decimal(match.group(1))
    return None


def _pseudo_isin(security_id: str) -> str:
    """ISIN déterministe (12 caractères) quand le fichier ne fournit que le libellé."""
    if len(security_id) <= 12:
        return security_id
    return "L" + hashlib.md5(security_id.encode("utf-8")).hexdigest()[:11].upper()


def _observation(
    *,
    isin: str,
    market_date: date,
    source_name: str,
    data_status: str,
    **fields: Any,
) -> dict[str, Any]:
    row: dict[str, Any] = {column: None for column in MARKET_OBSERVATION_COLUMNS}
    row.update(
        isin=isin,
        market_date=market_date,
        source_name=source_name,
        data_status=data_status,
        **fields,
    )
    return row


def parse_light_csv(
    path: str | Path,
    *,
    market_date: date | None = None,
    source_name: str = "Liste_obligations_light.csv",
    data_status: str = "unverified",
) -> list[dict[str, Any]]:
    """Parser « Liste_obligations_light.csv » (séparateur ';', BOM, dates ISO).

    Le champ « source » (ex. « Bloomberg / 2026-10-24 ») fournit la date de
    marché quand ``market_date`` n'est pas renseignée.
    """
    rows: list[dict[str, Any]] = []
    with open(path, newline="", encoding="utf-8-sig") as handle:
        for record in csv.DictReader(handle, delimiter=";"):
            security_id = (record.get("securityId") or "").strip()
            if not security_id:
                continue
            source = (record.get("source") or "").strip()
            observation_date = market_date
            if observation_date is None:
                match = _ISO_DATE_RE.search(source)
                observation_date = date.fromisoformat(match.group(1)) if match else None
            if observation_date is None:
                raise ValueError(
                    f"Date de marché introuvable pour {security_id} ; passez market_date."
                )
            rating = (record.get("rating") or "").strip()
            rows.append(
                _observation(
                    isin=_pseudo_isin(security_id),
                    market_date=observation_date,
                    source_name=source_name,
                    data_status=data_status,
                    issuer=(record.get("issuer") or "").strip() or None,
                    issuer_type=(record.get("sector") or "").strip() or None,
                    bond_type="Fixed",
                    currency=(record.get("currency") or "").strip() or None,
                    issue_date=_parse_iso_date(record.get("emissionDate")),
                    maturity_date=_parse_iso_date(record.get("maturityDate")),
                    coupon_type="Fixed",
                    coupon_rate_pct=_parse_percent(record.get("couponRate")),
                    day_count="ACT/ACT",
                    payment_frequency=int(_parse_decimal(record.get("couponFrequency")) or 2),
                    seniority=(record.get("seniority") or "").strip() or None,
                    rating=rating or None,
                    rating_agency="SIM" if rating.startswith("SIM") else None,
                    country="FR",
                    market="OTC",
                    face_value=1000,
                    yield_to_maturity_pct=_parse_percent(record.get("yieldToMaturity")),
                    spread_bps=_parse_decimal(record.get("spreadBps")),
                    clean_price=_parse_decimal(record.get("cleanPrice")),
                    esg_score=_parse_decimal(record.get("esgScore")),
                    provider_claim=source or None,
                )
            )
    return rows


def parse_euronext_csv(
    path: str | Path,
    *,
    market_date: date | None = None,
    source_name: str = "Euronext_Bonds_2026-10-27.csv",
    data_status: str = "official",
    default_currency: str = "EUR",
) -> list[dict[str, Any]]:
    """Parser le fichier Euronext (4 lignes d'en-tête, séparateur ';').

    La date de marché est lue dans « Closing Price DateTime » quand
    ``market_date`` n'est pas renseignée ; à défaut, la date de rapport du
    fichier (2e ligne, ex. « 27-oct-26 ») est utilisée. Les doublons d'ISIN
    (plusieurs marchés) sont dédupliqués en gardant la ligne qui a un prix.
    """
    with open(path, encoding="utf-8-sig") as handle:
        lines = handle.read().splitlines()
    header_index = next(
        (index for index, line in enumerate(lines) if line.startswith("Name;")),
        None,
    )
    if header_index is None:
        raise ValueError("En-tête Euronext introuvable (ligne « Name;... »).")
    report_date = (
        _parse_report_date(lines[1].split(";")[0]) if len(lines) > 1 else None
    )

    best_by_isin: dict[str, dict[str, Any]] = {}
    reader = csv.DictReader(lines[header_index:], delimiter=";")
    for record in reader:
        isin = (record.get("ISIN") or "").strip()
        if not isin:
            continue
        name = (record.get("Name") or "").strip()
        price = _parse_decimal(record.get("last Price"))
        if price is None:
            price = _parse_decimal(record.get("Closing Price"))
        observation_date = (
            market_date
            or _parse_fr_date(record.get("Closing Price DateTime"))
            or report_date
        )
        currency = (record.get("Currency") or "").strip()
        if currency in {"", "%"}:
            currency = default_currency
        upper_name = name.upper()
        row = _observation(
            isin=isin,
            market_date=observation_date,
            source_name=source_name,
            data_status=data_status,
            issuer=(record.get("Issuer") or "").strip() or None,
            bond_type="Fixed",
            currency=currency,
            maturity_date=_parse_fr_date(record.get("Maturity")),
            coupon_type="Fixed",
            coupon_rate_pct=_parse_coupon_from_name(name),
            day_count="ACT/ACT",
            payment_frequency=1,
            is_callable="CALL" in upper_name,
            is_green_bond="GREEN" in upper_name,
            is_sustainability_linked="SLB" in upper_name,
            market=(record.get("Market") or "").strip() or None,
            face_value=100,
            clean_price=price,
            provider_claim="Euronext",
        )
        existing = best_by_isin.get(isin)
        if existing is None or (existing["clean_price"] is None and price is not None):
            best_by_isin[isin] = row
    return list(best_by_isin.values())


def parse_swap_curve_csv(path: str | Path) -> dict[date, list[SwapPoint]]:
    """Parser une courbe de swaps « date;years;par_rate » (séparateur ';' ou ',')."""
    with open(path, newline="", encoding="utf-8-sig") as handle:
        sample = handle.read(4096)
        handle.seek(0)
        delimiter = ";" if sample.count(";") >= sample.count(",") else ","
        reader = csv.DictReader(handle, delimiter=delimiter)
        curves: dict[date, list[SwapPoint]] = {}
        for record in reader:
            curve_date = _parse_iso_date(
                record.get("date") or record.get("curve_date") or ""
            )
            years = _parse_decimal(record.get("years"))
            par_rate = _parse_decimal(record.get("par_rate"))
            if curve_date is None or years is None or par_rate is None:
                continue
            curves.setdefault(curve_date, []).append(SwapPoint(years, round(par_rate / 100, 10)))
    for points in curves.values():
        points.sort(key=lambda point: point.years)
    return curves


_UPSERT_OBSERVATION_SQL = (
    "INSERT INTO bp2s.market_observation ({columns}) VALUES ({placeholders}) "
    "ON CONFLICT (isin, source_name) DO UPDATE SET "
    "issuer = EXCLUDED.issuer, issuer_type = EXCLUDED.issuer_type, "
    "bond_type = EXCLUDED.bond_type, currency = EXCLUDED.currency, "
    "issue_date = EXCLUDED.issue_date, maturity_date = EXCLUDED.maturity_date, "
    "coupon_type = EXCLUDED.coupon_type, coupon_rate_pct = EXCLUDED.coupon_rate_pct, "
    "day_count = EXCLUDED.day_count, payment_frequency = EXCLUDED.payment_frequency, "
    "is_callable = EXCLUDED.is_callable, is_green_bond = EXCLUDED.is_green_bond, "
    "is_sustainability_linked = EXCLUDED.is_sustainability_linked, "
    "seniority = EXCLUDED.seniority, rating = EXCLUDED.rating, "
    "rating_agency = EXCLUDED.rating_agency, market = EXCLUDED.market, "
    "face_value = EXCLUDED.face_value, yield_to_maturity_pct = EXCLUDED.yield_to_maturity_pct, "
    "spread_bps = EXCLUDED.spread_bps, clean_price = EXCLUDED.clean_price, "
    "esg_score = EXCLUDED.esg_score, provider_claim = EXCLUDED.provider_claim, "
    "market_date = EXCLUDED.market_date, data_status = EXCLUDED.data_status"
)


def _upsert_observations(connection, rows: Iterable[dict[str, Any]]) -> int:
    columns = ", ".join(MARKET_OBSERVATION_COLUMNS)
    placeholders = ", ".join(f"%({column})s" for column in MARKET_OBSERVATION_COLUMNS)
    sql = _UPSERT_OBSERVATION_SQL.format(columns=columns, placeholders=placeholders)
    count = 0
    with connection.cursor() as cursor:
        for row in rows:
            cursor.execute(sql, row)
            count += 1
    return count


def upsert_market_observations(
    rows: Iterable[dict[str, Any]],
    *,
    connect=None,
) -> int:
    """Insérer/mettre à jour des observations de marché (upsert par (isin, source_name))."""
    if connect is None:
        from database import _connect

        with _connect() as connection:
            return _upsert_observations(connection, rows)
    with connect as connection:
        return _upsert_observations(connection, rows)


def upsert_swap_curve(
    curves: dict[date, list[SwapPoint]],
    *,
    source_name: str,
    connect=None,
) -> int:
    """Insérer/mettre à jour les taux swap EUR au pair par date."""
    sql = (
        "INSERT INTO bp2s.swap_curve (curve_date, years, par_rate, source_name) "
        "VALUES (%s, %s, %s, %s) "
        "ON CONFLICT (curve_date, years, source_name) DO UPDATE SET par_rate = EXCLUDED.par_rate"
    )
    parameters = [
        (curve_date, point.years, point.par_rate, source_name)
        for curve_date, points in curves.items()
        for point in points
    ]
    if not parameters:
        return 0

    def _run(connection) -> int:
        with connection.cursor() as cursor:
            for params in parameters:
                cursor.execute(sql, params)
        return len(parameters)

    if connect is None:
        from database import _connect

        with _connect() as connection:
            return _run(connection)
    with connect as connection:
        return _run(connection)
