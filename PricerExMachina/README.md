# PricerExMachina — bond-pricing MVP

A small, local HTTP application for deterministic bond-comparable analysis. The Python service reads only the existing `bp2s.market_observation` and `bp2s.swap_curve` PostgreSQL tables. Mistral is optional and can only explain a completed result; it has no database connection and cannot change numerical output.

## What exists in the repository / current blockers

The configured schema is in `FinanceCalculatorBackend/db/init/03-create-market-observations.sql` and `04-create-swap-curve.sql`.

* `market_observation` has `spread_bps`, `market_date`, `source_name`, and `data_status`. Its bundled seed is explicitly `synthetic_demo` and leaves `market_date` NULL, so it is excluded from pricing. Official, date-stamped observations must be imported before a production-like result can be obtained.
* `swap_curve` stores dated **par rates**, not zero rates, and the repository contains no approved bootstrap convention or evidence that two official curves have been loaded. The app does not silently reinterpret par rates as zero rates. A zero curve can instead be supplied explicitly per observation date in the API request; identify its source and status.
* The schema has no explicit sector column (it has `issuer_type`); the MVP does not pretend those fields are equivalent.
* The supplied schema does not record target coupon schedules, calendars, or accrual conventions in a form sufficient to reconstruct target cash flows. Supply dated cash flows and, if a clean price is needed, accrued interest by date. No coupon schedule is fabricated.
* There are no audit/email credentials or settings here. Email is intentionally not sent; response says `audit_status: not_sent`.

Consequently, a missing/insufficient panel returns no spread. A panel with adequate official comparable spreads but no eligible zero curve can return a source-data-based spread only, not a price/yield. These statuses are blockers, not successful pricing.

## Run locally

Python 3.10+ is sufficient for the deterministic tests and HTTP service. PostgreSQL uses the existing schema, not a new migration.

```powershell
cd Finance\PricerExMachina
python -m pip install -e ".[postgres]"
$env:DATABASE_URL = "your-authorized-read-only-connection-string"
python -m app.main
```

Do not use a write-capable database role. The adapter starts every transaction read-only, uses fixed SQL and bound parameters, and only selects the fields required. Table/schema identifiers are fixed in code. If there is no authorized connection string, leave `DATABASE_URL` unset; `/health` says the database is unconfigured and pricing returns an explicit service-unavailable error. The example file intentionally contains no credential values.

Health check: `GET http://127.0.0.1:8080/health`

Run tests without a database or provider credentials:

```powershell
python -m unittest discover -s tests -v
```

## Pricing endpoint

`POST /api/pricing`. The caller must state peer-selection criteria—there are no hidden defaults. For example (values are illustrative request structure only, not market observations):

```json
{
  "target": {
    "isin": "TARGET-ISIN",
    "issuer": "Example Issuer",
    "issuer_type": "Financial",
    "rating": "A",
    "seniority": "Senior",
    "currency": "EUR",
    "maturity_date": "2030-06-01",
    "cashflows": [
      {"payment_date": "2027-06-01", "amount": 4.0},
      {"payment_date": "2030-06-01", "amount": 104.0}
    ],
    "accrued_interest_by_date": {"2026-10-27": 0.0, "2026-10-28": 0.01}
  },
  "observation_dates": ["2026-10-27", "2026-10-28"],
  "selection": {
    "maturity_tolerance_months": 24,
    "match_fields": ["issuer", "rating", "seniority"],
    "minimum_comparables": 3,
    "spread_measure": "z_spread_bps"
  },
  "zero_curves": [
    {
      "observation_date": "2026-10-27",
      "source": "Name of supplied/imported curve source",
      "data_status": "official",
      "nodes": [
        {"time_years": 0.5, "zero_rate": 0.02},
        {"time_years": 5.0, "zero_rate": 0.03}
      ]
    }
  ]
}
```

`issuer_type`, rating, and seniority are optional target fields unless named in `match_fields`; every requested match is exact and must be present on both target and comparable. Same currency, exact observation date, official status, valid source spread, and target-ISIN exclusion are hard eligibility checks. Maturity tolerance and minimum panel size are required inputs, not assumed business defaults.

For each date the service reports the selected ISINs, date/source/status and imported spread, all excluded rows/reasons, criteria, and warnings. `spread_measure` must explicitly declare whether the generic database `spread_bps` column means `z_spread_bps` or remains `unclassified_spread_bps`. Without that declaration, the application will not label the median as a Z-spread or price the target. When confirmed, it uses an unweighted median of source spreads; this is not a spread recalculated from security prices. No ranking by “best” bond or risk-adjusted recommendation is made.

### Valuation conventions

The optional curve must match the observation date, identify its source and status, and contain at least two strictly increasing tenor nodes. Rates are continuously compounded zero rates; node interpolation is linear; extrapolation is disallowed. Dated target cash flows are discounted from the observation date using ACT/365F and `exp(-(zero_rate + z_spread) * time)`. The returned theoretical dirty price is on the nominal/currency units of supplied cash flows. A clean price is returned only when the caller provides accrued interest for that date. Yield is solved from those dated cash flows and dirty price using an annual-effective yield convention. These conventions are returned in the calculation description; they are not derived from the imported `swap_curve` table.

Only curves marked `official` are labelled `calculated`; unverified/demo curves are labelled `calculated_unverified`. A missing curve, uncovered cash-flow tenor, insufficient panel, or absent cash flow prevents full valuation and is surfaced in status/warnings.

## Optional Mistral explanation

Install the SDK only if desired:

```powershell
python -m pip install -e ".[mistral]"
$env:MISTRAL_API_KEY = "your-authorized-key"
$env:MISTRAL_MODEL = "mistral-small-latest"
```

`POST /api/assistant` accepts `{ "question": "...", "pricing_result": { ... } }`. It uses the Mistral chat-completions SDK; the model only explains the supplied deterministic output. It does not interpret arbitrary SQL, access PostgreSQL, select peers, or calculate prices. Data in `pricing_result` and the question are sent to the configured Mistral API, so only submit data approved for that provider. If no key/SDK is configured, this optional route returns an explicit 503. Mistral credentials stay in environment variables; no Studio agent, cloud workflow, or deployment is provisioned.

## Audit and limitations

The application returns a traceable structured response, but does not send email or claim delivery. Email delivery and any persistent audit sink require approved configuration and are outside this MVP. No market data or credentials are bundled; numerical values are calculated only from caller-supplied curves/cash flows and official rows returned by the existing database.
