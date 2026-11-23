"""Explicit, deterministic peer eligibility and Z-spread aggregation."""

from __future__ import annotations

from datetime import date
import math
from typing import Any


SUPPORTED_MATCH_FIELDS = ("issuer", "issuer_type", "rating", "seniority")


def _month_distance(left: date, right: date) -> int:
    return abs((left.year - right.year) * 12 + left.month - right.month)


def _normal(value: Any) -> str:
    return " ".join(str(value).strip().casefold().split()) if value is not None else ""


def eligible_peers(
    target: dict[str, Any],
    candidates: list[dict[str, Any]],
    observation_date: date,
    maturity_tolerance_months: int,
    match_fields: list[str],
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Return eligible rows and explainable exclusions; never ranks the target itself."""
    peers: list[dict[str, Any]] = []
    excluded: list[dict[str, str]] = []
    target_isin = _normal(target.get("isin"))

    for row in candidates:
        isin = str(row.get("isin") or "")
        reason: str | None = None
        try:
            peer_maturity = date.fromisoformat(str(row["maturity_date"]))
            peer_date = date.fromisoformat(str(row["market_date"]))
            spread = float(row["spread_bps"])
            if not math.isfinite(spread):
                raise ValueError
        except (KeyError, TypeError, ValueError):
            reason = "missing or invalid market date, maturity, or spread"
        else:
            if not isin.strip():
                reason = "missing security identifier"
            elif _normal(isin) == target_isin:
                reason = "target bond excluded"
            elif peer_date != observation_date:
                reason = "observation date does not match"
            elif _normal(row.get("currency")) != _normal(target.get("currency")):
                reason = "currency does not match"
            elif _normal(row.get("data_status")) != "official":
                reason = "market observation is not marked official"
            elif _month_distance(peer_maturity, date.fromisoformat(target["maturity_date"])) > maturity_tolerance_months:
                reason = "maturity is outside the requested tolerance"
            else:
                for field in match_fields:
                    if not _normal(target.get(field)) or not _normal(row.get(field)):
                        reason = f"required {field} is missing"
                        break
                    if _normal(target.get(field)) != _normal(row.get(field)):
                        reason = f"{field} does not match"
                        break

        if reason:
            excluded.append({"isin": isin, "reason": reason})
        else:
            peers.append(row)

    peers.sort(key=lambda row: str(row["isin"]).casefold())
    return peers, excluded


def median_spread_bps(peers: list[dict[str, Any]]) -> float:
    if not peers:
        raise ValueError("Cannot estimate a spread without eligible comparables")
    values = sorted(float(peer["spread_bps"]) for peer in peers)
    middle = len(values) // 2
    if len(values) % 2:
        return values[middle]
    return (values[middle - 1] + values[middle]) / 2.0
