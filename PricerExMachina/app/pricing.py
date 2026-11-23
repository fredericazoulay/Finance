"""Request validation and deterministic, per-observation pricing flow."""

from __future__ import annotations

from datetime import date
import math
from typing import Any

from .peer_selection import SUPPORTED_MATCH_FIELDS, eligible_peers, median_spread_bps, rank_peers
from .valuation import value_cashflows


class RequestError(ValueError):
    pass


def _parse_date(value: Any, label: str) -> date:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError) as exc:
        raise RequestError(f"{label} must be an ISO YYYY-MM-DD date") from exc


def validate_request(payload: dict[str, Any]) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    if not isinstance(payload, dict):
        raise RequestError("JSON request body must be an object")
    target = payload.get("target")
    if not isinstance(target, dict):
        raise RequestError("target is required")
    for field in ("isin", "currency", "maturity_date"):
        if not isinstance(target.get(field), str) or not target[field].strip():
            raise RequestError(f"target.{field} is required")
    _parse_date(target["maturity_date"], "target.maturity_date")
    cashflows = target.get("cashflows")
    if cashflows is not None:
        if not isinstance(cashflows, list):
            raise RequestError("target.cashflows must be a list of dated cash-flow objects")
        for index, flow in enumerate(cashflows):
            if not isinstance(flow, dict) or "payment_date" not in flow or "amount" not in flow:
                raise RequestError(f"target.cashflows[{index}] requires payment_date and amount")
            payment_date = _parse_date(flow["payment_date"], f"target.cashflows[{index}].payment_date")
            if payment_date > date.fromisoformat(target["maturity_date"]):
                raise RequestError(f"target.cashflows[{index}] cannot fall after target.maturity_date")
            try:
                amount = float(flow["amount"])
            except (TypeError, ValueError) as exc:
                raise RequestError(f"target.cashflows[{index}].amount must be numeric") from exc
            if not math.isfinite(amount) or amount < 0:
                raise RequestError(f"target.cashflows[{index}].amount must be finite and non-negative")
    dates = payload.get("observation_dates")
    if not isinstance(dates, list) or len(dates) != 2:
        raise RequestError("observation_dates must contain exactly two ISO dates")
    parsed_dates = [_parse_date(value, "observation_dates item") for value in dates]
    if parsed_dates[0] == parsed_dates[1]:
        raise RequestError("observation_dates must be distinct")

    selection = payload.get("selection")
    if not isinstance(selection, dict):
        raise RequestError("selection is required; set explicit maturity_tolerance_months, match_fields and minimum_comparables")
    tolerance = selection.get("maturity_tolerance_months")
    minimum = selection.get("minimum_comparables")
    maximum = selection.get("maximum_comparables")
    match_fields = selection.get("match_fields")
    spread_measure = selection.get("spread_measure")
    if not isinstance(tolerance, int) or isinstance(tolerance, bool) or tolerance < 0 or tolerance > 240:
        raise RequestError("selection.maturity_tolerance_months must be an explicit integer from 0 to 240")
    if not isinstance(minimum, int) or isinstance(minimum, bool) or minimum < 1:
        raise RequestError("selection.minimum_comparables must be an explicit positive integer")
    if (
        not isinstance(maximum, int)
        or isinstance(maximum, bool)
        or maximum < minimum
        or maximum > 500
    ):
        raise RequestError(
            "selection.maximum_comparables must be an explicit integer between minimum_comparables and 500"
        )
    if not isinstance(match_fields, list) or any(
        not isinstance(field, str) or field not in SUPPORTED_MATCH_FIELDS for field in match_fields
    ):
        raise RequestError(f"selection.match_fields must be a list using only {list(SUPPORTED_MATCH_FIELDS)}")
    if len(set(match_fields)) != len(match_fields):
        raise RequestError("selection.match_fields must not contain duplicates")
    if spread_measure not in ("z_spread_bps", "unclassified_spread_bps"):
        raise RequestError(
            "selection.spread_measure must explicitly be 'z_spread_bps' or 'unclassified_spread_bps'; "
            "the database spread_bps field does not identify its convention"
        )

    curves = payload.get("zero_curves", [])
    if not isinstance(curves, list):
        raise RequestError("zero_curves must be a list")
    curves_by_date: dict[str, dict[str, Any]] = {}
    for curve in curves:
        if not isinstance(curve, dict):
            raise RequestError("Each zero curve must be an object")
        curve_date = str(_parse_date(curve.get("observation_date"), "zero curve observation_date"))
        if curve_date not in {str(d) for d in parsed_dates}:
            raise RequestError(f"zero curve date {curve_date} is not one of observation_dates")
        if curve_date in curves_by_date:
            raise RequestError(f"Only one zero curve per observation date is allowed ({curve_date})")
        if not isinstance(curve.get("source"), str) or not curve["source"].strip():
            raise RequestError(f"zero curve {curve_date} requires a source label")
        if curve.get("data_status") not in ("official", "unverified", "synthetic_demo"):
            raise RequestError(f"zero curve {curve_date} requires explicit data_status")
        if not isinstance(curve.get("nodes"), list):
            raise RequestError(f"zero curve {curve_date} requires nodes")
        curves_by_date[curve_date] = curve

    accrued_by_date = target.get("accrued_interest_by_date")
    if accrued_by_date is not None:
        if not isinstance(accrued_by_date, dict) or any(key not in {str(d) for d in parsed_dates} for key in accrued_by_date):
            raise RequestError("target.accrued_interest_by_date must map observation dates to accrued-interest values")

    return target, [str(d) for d in parsed_dates], {
        "maturity_tolerance_months": tolerance,
        "minimum_comparables": minimum,
        "maximum_comparables": maximum,
        "match_fields": match_fields,
        "spread_measure": spread_measure,
        "curves_by_date": curves_by_date,
    }


def price_request(payload: dict[str, Any], repository: Any) -> dict[str, Any]:
    target, observation_dates, selection = validate_request(payload)
    valuations = []
    for observation_date in observation_dates:
        inputs = repository.fetch_date_inputs(target, observation_date)
        eligible, excluded = eligible_peers(
            target,
            inputs["peers"],
            date.fromisoformat(observation_date),
            selection["maturity_tolerance_months"],
            selection["match_fields"],
        )
        peers = rank_peers(target, eligible, selection["maximum_comparables"])
        warnings: list[str] = []
        result: dict[str, Any] = {
            "observation_date": observation_date,
            "status": "insufficient_data",
            "z_spread_bps": None,
            "yield_percent": None,
            "theoretical_dirty_price": None,
            "theoretical_clean_price": None,
            "comparables": [],
            "excluded_comparables": excluded,
            "criteria": {
                "observation_date_exact": observation_date,
                "currency_exact": target["currency"],
                "maturity_tolerance_months": selection["maturity_tolerance_months"],
                "required_exact_matches": selection["match_fields"],
                "minimum_comparables": selection["minimum_comparables"],
                "maximum_comparables": selection["maximum_comparables"],
                "eligible_comparable_count": len(eligible),
                "ranking": "scikit-learn nearest neighbors on standardized maturity and, when recognized, rating distance",
                "eligible_data_status": "official",
                "spread_field": "spread_bps",
                "spread_measure_as_confirmed_by_caller": selection["spread_measure"],
                "aggregation": "unweighted median",
            },
            "methodology": (
                "For this date only: select official, exact-date, same-currency observations; "
                "exclude the target ISIN; apply the user-specified maturity tolerance and exact-match fields; "
                "rank eligible peers by standardized maturity and recognized rating proximity, retain at most "
                "maximum_comparables, and take their unweighted median source spread_bps."
            ),
            "warnings": warnings,
        }
        result["comparables"] = [
            {
                "isin": row["isin"],
                "maturity_date": str(row["maturity_date"]),
                "spread_bps": float(row["spread_bps"]),
                "source": row.get("source_name"),
                "market_date": str(row["market_date"]),
                "data_status": row["data_status"],
            }
            for row in peers
        ]
        if len(peers) < selection["minimum_comparables"]:
            warnings.append(
                f"Only {len(peers)} eligible comparable(s); the requested minimum is "
                f"{selection['minimum_comparables']}. No spread or valuation is reported."
            )
            if not inputs["swap_par_curve"]:
                warnings.append("No official bp2s.swap_curve rows were found for this observation date.")
            else:
                warnings.append(
                    "bp2s.swap_curve contains par rates; no approved bootstrap/conversion convention is configured, so it is not used as a zero curve."
                )
            valuations.append(result)
            continue

        z_spread = median_spread_bps(peers)
        result["median_observed_spread_bps"] = z_spread
        if selection["spread_measure"] != "z_spread_bps":
            warnings.append(
                "The source column is not confirmed as Z-spread. Median observed spread is shown, "
                "but Z-spread, price, and yield are not calculated."
            )
            result["status"] = "spread_convention_required"
            valuations.append(result)
            continue
        result["z_spread_bps"] = z_spread
        curve = selection["curves_by_date"].get(observation_date)
        if curve is None:
            warnings.append(
                "No date-matched zero curve was supplied. Price and yield are unavailable; "
                "the existing bp2s.swap_curve stores par rates and is not converted or treated as zero rates."
            )
            if not inputs["swap_par_curve"]:
                warnings.append("No official bp2s.swap_curve rows were found for this observation date.")
            result["status"] = "spread_only"
        else:
            if curve["data_status"] != "official":
                warnings.append(f"Zero curve is marked {curve['data_status']}; calculated values are indicative, not validated.")
            if inputs["swap_par_curve"]:
                curve_statuses = sorted({str(item.get("data_status", "unknown")) for item in inputs["swap_par_curve"]})
                warnings.append(
                    "Database swap-curve par-rate rows were not used; their recorded statuses are "
                    + ", ".join(curve_statuses)
                    + "."
                )
            if not curve["nodes"]:
                warnings.append("Zero curve has no nodes; price and yield are unavailable.")
                result["status"] = "spread_only"
            else:
                try:
                    accrued_map = target.get("accrued_interest_by_date") or {}
                    accrued = accrued_map.get(observation_date)
                    valuation = value_cashflows(
                        target.get("cashflows") or [],
                        date.fromisoformat(observation_date),
                        curve["nodes"],
                        z_spread,
                        accrued,
                    )
                    result.update(valuation)
                    result["status"] = "calculated" if curve["data_status"] == "official" else "calculated_unverified"
                except (KeyError, TypeError, ValueError, OverflowError) as exc:
                    warnings.append(f"Price/yield not calculated: {exc}")
                    result["status"] = "spread_only"

        if len(peers) == selection["minimum_comparables"]:
            warnings.append("Comparable count meets the minimum exactly; estimation is sensitive to individual observations.")
        if not math.isfinite(z_spread):
            warnings.append("Spread calculation failed a finite-value control.")
            result["z_spread_bps"] = None
            result["status"] = "insufficient_data"
        valuations.append(result)

    return {
        "obligation": {
            "isin": target["isin"],
            "currency": target["currency"],
            "issuer": target.get("issuer"),
        },
        "valuations": valuations,
        "disclaimer": "Calculated outputs are analytical results from supplied/imported inputs, not investment advice.",
    }
