import unittest
from datetime import date
import math

from app.peer_selection import eligible_peers, median_spread_bps, rank_peers
from app.pricing import RequestError, price_request, validate_request
from app.valuation import value_cashflows


def row(isin, spread, maturity="2030-06-01", **overrides):
    return {
        "isin": isin,
        "currency": "EUR",
        "maturity_date": maturity,
        "market_date": "2026-10-27",
        "spread_bps": spread,
        "source_name": "Imported official observations",
        "data_status": "official",
        "issuer": "Issuer A",
        "issuer_type": "Financial",
        "rating": "A",
        "seniority": "Senior",
        **overrides,
    }


TARGET = {
    "isin": "TARGET",
    "currency": "EUR",
    "maturity_date": "2030-10-27",
    "issuer": "Issuer A",
    "issuer_type": "Financial",
    "rating": "A",
    "seniority": "Senior",
    "cashflows": [
        {"payment_date": "2027-10-27", "amount": 4.0},
        {"payment_date": "2028-10-27", "amount": 4.0},
        {"payment_date": "2029-10-27", "amount": 4.0},
        {"payment_date": "2030-10-27", "amount": 104.0},
    ],
    "accrued_interest_by_date": {"2026-10-27": 0.0, "2026-10-28": 0.01},
}


class FakeRepository:
    def __init__(self, inputs):
        self.inputs = inputs
        self.calls = []

    def fetch_date_inputs(self, target, observation_date):
        self.calls.append(observation_date)
        return self.inputs.get(observation_date, {"peers": [], "swap_par_curve": []})


def request():
    return {
        "target": TARGET,
        "observation_dates": ["2026-10-27", "2026-10-28"],
        "selection": {
            "maturity_tolerance_months": 12,
            "minimum_comparables": 2,
            "maximum_comparables": 4,
            "match_fields": ["issuer", "rating", "seniority"],
            "spread_measure": "z_spread_bps",
        },
        "zero_curves": [
            {
                "observation_date": "2026-10-27",
                "source": "User-supplied curve",
                "data_status": "official",
                "nodes": [
                    {"time_years": 0.5, "zero_rate": 0.02},
                    {"time_years": 5.0, "zero_rate": 0.03},
                ],
            }
        ],
    }


class PeerSelectionTests(unittest.TestCase):
    def test_exact_date_currency_maturity_and_target_exclusion(self):
        peers, excluded = eligible_peers(
            TARGET,
            [
                row("TARGET", 100),
                row("GOOD", 90),
                row("WRONG-CURRENCY", 80, currency="USD"),
                row("WRONG-DATE", 70, market_date="2026-10-26"),
                row("SYNTHETIC", 60, data_status="synthetic_demo"),
                row("TOO-FAR", 50, maturity="2035-06-01"),
            ],
            date(2026, 10, 27),
            12,
            ["issuer", "rating"],
        )
        self.assertEqual([p["isin"] for p in peers], ["GOOD"])
        self.assertEqual(len(excluded), 5)
        self.assertIn("target bond excluded", [x["reason"] for x in excluded])

    def test_median_is_deterministic_for_even_and_odd_panels(self):
        self.assertEqual(median_spread_bps([row("A", 80), row("B", 100)]), 90)
        self.assertEqual(median_spread_bps([row("A", 100), row("B", 80), row("C", 90)]), 90)

    def test_nearest_neighbor_panel_is_bounded_and_prefers_closer_maturities(self):
        target = {**TARGET, "rating": "A"}
        peers = [
            row("FAR", 200, maturity="2032-06-01"),
            row("NEAR", 100, maturity="2030-07-01"),
            row("MID", 150, maturity="2031-06-01"),
        ]
        selected = rank_peers(target, peers, 2)
        self.assertEqual({peer["isin"] for peer in selected}, {"NEAR", "MID"})


class ValuationTests(unittest.TestCase):
    def test_curve_discount_and_yield_are_calculated_from_supplied_cashflows(self):
        result = value_cashflows(
            [{"payment_date": "2027-10-27", "amount": 105}],
            date(2026, 10, 27),
            [{"time_years": 0.5, "zero_rate": 0.02}, {"time_years": 2.0, "zero_rate": 0.02}],
            0.0,
            0.0,
        )
        self.assertAlmostEqual(result["theoretical_dirty_price"], 105 * math.exp(-0.02), places=5)
        self.assertAlmostEqual(result["yield_percent"], (math.exp(0.02) - 1) * 100, places=4)
        self.assertIsNotNone(result["theoretical_clean_price"])

    def test_missing_curve_coverage_and_cashflow_reject_instead_of_extrapolating(self):
        with self.assertRaisesRegex(ValueError, "does not cover"):
            value_cashflows(
                [{"payment_date": "2029-10-27", "amount": 100}],
                date(2026, 10, 27),
                [{"time_years": 0.5, "zero_rate": 0.02}, {"time_years": 2, "zero_rate": 0.03}],
                80,
            )

    def test_clean_price_requires_explicit_accrued_interest(self):
        result = value_cashflows(
            [{"payment_date": "2027-10-27", "amount": 100}],
            date(2026, 10, 27),
            [{"time_years": 0.5, "zero_rate": 0.02}, {"time_years": 2, "zero_rate": 0.03}],
            0,
        )
        self.assertIsNone(result["theoretical_clean_price"])


class PricingFlowTests(unittest.TestCase):
    def test_dates_are_priced_independently_and_uses_supplied_market_data_only(self):
        repo = FakeRepository({
            "2026-10-27": {"peers": [row("P1", 100), row("P2", 120)], "swap_par_curve": []},
            "2026-10-28": {"peers": [row("P3", 110, market_date="2026-10-28")], "swap_par_curve": []},
        })
        payload = request()
        payload["zero_curves"][0]["nodes"] = [
            {"time_years": 0.5, "zero_rate": 0.02},
            {"time_years": 5.0, "zero_rate": 0.03},
        ]
        # Set the second row to its own date and the expected second-date minimum remains unmet.
        payload["selection"]["minimum_comparables"] = 2
        result = price_request(payload, repo)
        self.assertEqual(repo.calls, ["2026-10-27", "2026-10-28"])
        self.assertEqual(result["valuations"][0]["z_spread_bps"], 110)
        self.assertEqual(result["valuations"][0]["status"], "calculated")
        self.assertIsNone(result["valuations"][1]["z_spread_bps"])
        self.assertEqual(result["valuations"][1]["status"], "insufficient_data")

    def test_missing_curve_produces_spread_only_and_explicit_warning(self):
        payload = request()
        payload["zero_curves"] = []
        repo = FakeRepository({
            "2026-10-27": {"peers": [row("P1", 100), row("P2", 120)], "swap_par_curve": [{"par_rate": 0.02}]},
            "2026-10-28": {"peers": [], "swap_par_curve": []},
        })
        result = price_request(payload, repo)
        valuation = result["valuations"][0]
        self.assertEqual(valuation["status"], "spread_only")
        self.assertEqual(valuation["z_spread_bps"], 110)
        self.assertIsNone(valuation["yield_percent"])
        self.assertTrue(any("not converted" in warning for warning in valuation["warnings"]))
        self.assertNotIn("audit_status", result)

    def test_selection_policy_must_be_explicit(self):
        payload = request()
        del payload["selection"]
        with self.assertRaisesRegex(RequestError, "selection is required"):
            validate_request(payload)

    def test_generic_database_spread_is_not_silently_called_a_z_spread(self):
        payload = request()
        payload["selection"]["spread_measure"] = "unclassified_spread_bps"
        repo = FakeRepository({
            "2026-10-27": {"peers": [row("P1", 100), row("P2", 120)], "swap_par_curve": []},
            "2026-10-28": {"peers": [], "swap_par_curve": []},
        })
        result = price_request(payload, repo)["valuations"][0]
        self.assertEqual(result["status"], "spread_convention_required")
        self.assertEqual(result["median_observed_spread_bps"], 110)
        self.assertIsNone(result["z_spread_bps"])
        self.assertTrue(any("not confirmed as Z-spread" in warning for warning in result["warnings"]))


if __name__ == "__main__":
    unittest.main()
