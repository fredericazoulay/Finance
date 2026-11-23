"""Explicit, deterministic peer eligibility and Z-spread aggregation."""

from __future__ import annotations

from datetime import date
import math
from typing import Any

import numpy as np
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler


SUPPORTED_MATCH_FIELDS = ("issuer", "issuer_type", "rating", "seniority")
_RATING_NOTCH = {
    "aaa": 0, "aa+": 1, "aa": 2, "aa-": 3,
    "a+": 4, "a": 5, "a-": 6,
    "bbb+": 7, "bbb": 8, "bbb-": 9,
    "bb+": 10, "bb": 11, "bb-": 12,
    "b+": 13, "b": 14, "b-": 15,
    "ccc+": 16, "ccc": 17, "ccc-": 18, "cc": 19, "c": 20, "d": 21,
}


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


def rank_peers(
    target: dict[str, Any],
    peers: list[dict[str, Any]],
    maximum_comparables: int,
) -> list[dict[str, Any]]:
    """Keep the closest eligible peers using standardized maturity and rating distance."""
    if not peers:
        return []

    target_maturity = date.fromisoformat(target["maturity_date"])
    target_rating = _RATING_NOTCH.get(_normal(target.get("rating")).replace(" ", ""))
    use_rating = target_rating is not None and all(
        _RATING_NOTCH.get(_normal(peer.get("rating")).replace(" ", "")) is not None
        for peer in peers
    )

    target_features = [target_maturity.toordinal() / 365.25]
    feature_rows = []
    for peer in peers:
        peer_maturity = date.fromisoformat(str(peer["maturity_date"]))
        feature_rows.append([peer_maturity.toordinal() / 365.25])
        if use_rating:
            peer_rating = _RATING_NOTCH[_normal(peer.get("rating")).replace(" ", "")]
            feature_rows[-1].append(float(peer_rating))
    if use_rating:
        target_features.append(float(target_rating))

    scaler = StandardScaler()
    matrix = scaler.fit_transform(np.asarray(feature_rows, dtype=np.float64))
    query = scaler.transform(np.asarray([target_features], dtype=np.float64))
    count = min(maximum_comparables, len(peers))
    neighbors = NearestNeighbors(n_neighbors=count, algorithm="brute", metric="euclidean")
    neighbors.fit(matrix)
    distances, indices = neighbors.kneighbors(query)
    selected = sorted(
        zip(distances[0].tolist(), indices[0].tolist()),
        key=lambda item: (item[0], str(peers[item[1]]["isin"]).casefold()),
    )
    return [peers[index] for _, index in selected]
