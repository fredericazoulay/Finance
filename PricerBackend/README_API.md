# Bloomberg Pricer API

This file documents the Bloomberg-style pricing API exposed by the Spring Boot application.

## Base URL

```text
http://localhost:9092
```

## Health

### GET /api/health

Response:

```json
{
  "status": "UP",
  "service": "Finance Pricer API"
}
```

---

## Bloomberg pricing routes

### 1) Equity option

#### POST /api/v1/blp/pricing/equity-option

Request:

```json
{
  "request_id": "REQ-OPT-1001",
  "security_id": "AAPL US Equity",
  "security_name": "AAPL US Equity",
  "product": "EQTY_OPT",
  "curve_name": "USD-SOFR",
  "market_data_source": "BDP",
  "pricing_model": "BLACK_SCHOLES",
  "market_data": {
    "underlying_spot": 100.0,
    "risk_free_rate": 0.05,
    "implied_volatility": 0.2,
    "dividend_yield": 0.01
  },
  "instrument": {
    "strike": 100.0,
    "maturity_years": 1.0,
    "option_type": "CALL",
    "exercise_style": "EUROPEAN"
  }
}
```

Response:

```json
{
  "request_id": "REQ-OPT-1001",
  "response_status": "SUCCESS",
  "timestamp": "2026-09-16T23:00:00Z",
  "security_id": "AAPL US Equity",
  "security_name": "AAPL US Equity",
  "product": "EQTY_OPT",
  "curve_name": "USD-SOFR",
  "market_data_source": "BDP",
  "result": {
    "price": 10.4508,
    "currency": "USD"
  },
  "metadata": {
    "pricing_model": "BLACK_SCHOLES"
  }
}
```

---

### 2) Interest rate swap

#### POST /api/v1/blp/pricing/irs

Request:

```json
{
  "request_id": "REQ-IRS-2001",
  "security_id": "USD 5Y IRS",
  "security_name": "USD 5Y IRS",
  "product": "IRS",
  "curve_name": "USD-SOFR",
  "market_data_source": "Bloomberg",
  "pricing_model": "PAR_SWAP",
  "market_data": {
    "tenors": [1.0, 2.0, 3.0, 5.0, 7.0, 10.0],
    "discount_curve_rates": [0.018, 0.022, 0.025, 0.029, 0.031, 0.033],
    "frequency": 2
  },
  "instrument": {
    "notional": 1000000.0,
    "fixed_rate": 0.03,
    "maturity_years": 5.0,
    "payment_frequency": 2,
    "receiver": true
  }
}
```

Response:

```json
{
  "request_id": "REQ-IRS-2001",
  "response_status": "SUCCESS",
  "timestamp": "2026-09-16T23:00:00Z",
  "security_id": "USD 5Y IRS",
  "security_name": "USD 5Y IRS",
  "product": "IRS",
  "curve_name": "USD-SOFR",
  "market_data_source": "Bloomberg",
  "result": {
    "par_rate": 0.033613,
    "present_value": 29005.63,
    "currency": "USD"
  },
  "metadata": {
    "pricing_model": "PAR_SWAP"
  }
}
```

---

### 3) Credit default swap

#### POST /api/v1/blp/pricing/cds

Request:

```json
{
  "request_id": "REQ-CDS-3001",
  "security_id": "XYZ 5Y CDS",
  "security_name": "XYZ 5Y CDS",
  "product": "CDS",
  "curve_name": "EUR-ISDA",
  "market_data_source": "Bloomberg",
  "pricing_model": "IMPLIED_HAZARD",
  "market_data": {
    "tenors": [1.0, 2.0, 3.0, 5.0, 7.0, 10.0],
    "discount_curve_rates": [0.015, 0.018, 0.021, 0.025, 0.028, 0.031],
    "frequency": 4
  },
  "instrument": {
    "notional": 1000000.0,
    "spread": 0.015,
    "maturity_years": 5.0,
    "payment_frequency": 4,
    "recovery_rate": 0.4
  }
}
```

Response:

```json
{
  "request_id": "REQ-CDS-3001",
  "response_status": "SUCCESS",
  "timestamp": "2026-09-16T23:00:00Z",
  "security_id": "XYZ 5Y CDS",
  "security_name": "XYZ 5Y CDS",
  "product": "CDS",
  "curve_name": "EUR-ISDA",
  "market_data_source": "Bloomberg",
  "result": {
    "implied_hazard_rate": 0.01995,
    "currency": "USD"
  },
  "metadata": {
    "pricing_model": "IMPLIED_HAZARD"
  }
}
```

---

### 4) FX forward

#### POST /api/v1/blp/pricing/fx-forward

Request:

```json
{
  "request_id": "REQ-FX-4001",
  "security_id": "EURUSD Curncy",
  "security_name": "EURUSD Curncy",
  "product": "FXC",
  "curve_name": "EURUSD-FX",
  "market_data_source": "Reuters",
  "pricing_model": "FX_FORWARD",
  "market_data": {
    "spot": 1.08,
    "domestic_rate": 0.05,
    "foreign_rate": 0.02
  },
  "instrument": {
    "pair": "EURUSD",
    "maturity_years": 1.0
  }
}
```

Response:

```json
{
  "request_id": "REQ-FX-4001",
  "response_status": "SUCCESS",
  "timestamp": "2026-09-16T23:00:00Z",
  "security_id": "EURUSD Curncy",
  "security_name": "EURUSD Curncy",
  "product": "FXC",
  "curve_name": "EURUSD-FX",
  "market_data_source": "Reuters",
  "result": {
    "forward_price": 1.101817,
    "currency": "USD"
  },
  "metadata": {
    "pricing_model": "FX_FORWARD"
  }
}
```

---

## Swagger/OpenAPI

## Bond comparable pricing

### POST /api/v1/calculators/bonds/comparables/pricing

This endpoint accepts a user-supplied panel. It does not connect to a market-data provider. The target and eligible comparables must use the same currency; comparable maturity must be within the configured number of months from the target maturity. Eligible observations require a source and an ISO `asOf` date no later than settlement and no more than seven calendar days old. Configure the freshness limit with `PRICER_BOND_COMPARABLES_MAX_PRICE_AGE_DAYS`.

Eligible bonds are ranked lexicographically: exact issuer match, normalized rating-notch distance (S&P/Fitch and Moody's common scales), exact sector match, exact seniority match, maturity distance, then highest YTM and security ID as deterministic tie-breakers. Target issuer, rating, sector and seniority are optional; omitted fields do not affect ranking. The response includes each eligible panel row's rank and ranking reasons, the criteria order, and explicit exclusion reasons. `source` and `asOf` are user-reported and are not independently verified.

Request rates are decimals (`0.045` means 4.5%). `maturityToleranceMonths` defaults to 24 and is limited to 0–240.

```json
{
  "target": {
    "securityId": "TARGET-001",
    "name": "Target bond",
    "currency": "USD",
    "faceValue": 100.0,
    "couponRate": 0.04,
    "couponFrequency": 2,
    "maturityDate": "2031-10-23",
    "settlementDate": "2026-10-23",
    "dayCount": "30/360",
    "issuer": "Example issuer",
    "rating": "A",
    "sector": "Financials",
    "seniority": "Senior unsecured"
  },
  "panel": [
    {
      "securityId": "COMP-001",
      "name": "Comparable bond",
      "issuer": "Example issuer",
      "currency": "USD",
      "maturityDate": "2032-04-23",
      "yieldToMaturity": 0.052,
      "couponRate": 0.045,
      "marketPrice": 97.2,
      "rating": "A",
      "sector": "Financials",
      "seniority": "Senior unsecured",
      "source": "User import",
      "asOf": "2026-10-22"
    }
  ],
  "maturityToleranceMonths": 24
}
```

The response includes each panel row's eligibility, rank, ranking reasons and exclusion reason, the selected security and applied yield, the ranking criteria, plus clean price, dirty price, accrued interest and day-count convention.

---

## AI bond analysis

### POST /api/v1/ai/ask

Sends a question and optional pricing context to the configured OpenAI-compatible chat completions provider.

```json
{
  "question": "Détermine le pricing de l'obligation cible à partir des comparables.",
  "context": "{...}"
}
```

The response contains an `answer` string. The question is limited to 5,000 characters and the context to 12,000 characters. The frontend sends the target, current valuation (when available), and at most five same-currency comparables.

Configure the backend environment before asking a question:

- `PRICER_AI_API_KEY` (required)
- `PRICER_AI_CHAT_COMPLETIONS_URL` (optional; defaults to `https://api.openai.com/v1/chat/completions`)
- `PRICER_AI_MODEL` (optional; defaults to `gpt-4o-mini`)

The API key stays on the server and is never sent to the browser. The endpoint returns `503` when no key is configured and `502` when the provider is unavailable or returns an unusable response.

### POST /api/v1/ai/extract-bond-target

Extracts explicitly stated target-bond fields from a description. Unknown values remain `null`; the server returns `missingFields` and `ambiguities` for user review. Coupon rate is returned as a decimal fraction. The endpoint never prices the bond or selects a comparable.

```json
{
  "description": "Obligation FR001, libellée en EUR, nominal 100, coupon annuel 4 %, échéance 2030-06-01, règlement 2026-10-24, convention 30/360."
}
```

The response contains the extracted target fields plus `missingFields` and `ambiguities`. The frontend pre-fills the target form, which the user must review before running the existing comparable-pricing calculation. The API key remains server-side; no provider call occurs when it is not configured.

---

## Bond analytics

### POST /api/v1/calculators/bonds/analytics

Calculates fixed-coupon bond price and risk metrics from a supplied clean price and discount curve. Rates and spreads are decimal fractions; curve zero rates are continuously compounded. The curve reference date must equal settlement, and its day-count convention is used for curve discounting and KRD bumps. Key-rate tenors must be positive and strictly increasing.

```json
{
  "securityId": "BOND-001",
  "currency": "EUR",
  "faceValue": 100.0,
  "couponRate": 0.04,
  "couponFrequency": 2,
  "issueDate": "2021-10-23",
  "maturityDate": "2031-10-23",
  "settlementDate": "2026-10-23",
  "dayCount": "30/360",
  "cleanPrice": 97.5,
  "discountCurve": {
    "referenceDate": "2026-10-23",
    "dayCount": "ACT/365F",
    "timesYears": [1.0, 3.0, 5.0, 10.0],
    "zeroRates": [0.025, 0.028, 0.03, 0.032]
  },
  "keyRateTenorsYears": [1.0, 3.0, 5.0, 10.0]
}
```

The response includes clean/dirty prices, accrued interest, YTM, Macaulay and modified duration, convexity, DV01, Z-spread, the curve-implied dirty price, and KRD values keyed by tenor. KRDs use 1 bp curve bumps and are normalized to the curve-implied price; `source` and market-data retrieval are not part of this endpoint.

## Advanced pricing routes

These routes expose existing analytical engines. Rates are decimal fractions, times are years, and curve rates are continuously compounded zero rates. The API does not fetch market data; callers supply the curve and instrument inputs.

| Method and route | Instrument/model |
| --- | --- |
| `POST /api/v1/advanced-pricing/rates/cap-floor` | Cap or floor with separate discount and forward zero curves |
| `POST /api/v1/advanced-pricing/rates/swaption/european` | European payer/receiver swaption using Black-76 |
| `POST /api/v1/advanced-pricing/rates/fra` | FRA present value and par rate |
| `POST /api/v1/advanced-pricing/forwards` | Equity, FX, commodity, or no-income forward |
| `POST /api/v1/advanced-pricing/futures/interest-rate` | Futures-implied rate and convexity adjustment |
| `POST /api/v1/advanced-pricing/futures/bond` | Cheapest-to-deliver selection and invoice price |
| `POST /api/v1/advanced-pricing/options/barrier` | European single-barrier option |
| `POST /api/v1/advanced-pricing/options/asian` | Geometric or arithmetic-average Asian option |
| `POST /api/v1/advanced-pricing/options/digital` | Cash-or-nothing, asset-or-nothing, or gap option |
| `POST /api/v1/advanced-pricing/options/lookback/floating-strike` | Floating-strike lookback call or put |
| `POST /api/v1/advanced-pricing/options/chooser` | Simple chooser option |
| `POST /api/v1/advanced-pricing/options/spread` | Two-asset Kirk spread option |
| `POST /api/v1/advanced-pricing/volatility/sabr` | SABR implied volatility |

Curve objects use `times_years` and `zero_rates` arrays of equal length with strictly increasing times; `reference_date` and `day_count` are optional. Example:

```json
{
  "times_years": [0.5, 1.0, 2.0, 5.0],
  "zero_rates": [0.025, 0.028, 0.031, 0.034],
  "reference_date": "2026-10-25",
  "day_count": "ACT_365F"
}
```

The bond-futures route uses the project's simplified CTD cost comparison; its engine does not calculate implied repo. Floating-strike lookback is implemented, but fixed-strike lookback is not. Autocalls, reverse convertibles, callable/putable/convertible bonds, floaters, and inflation-linked bonds remain unsupported.

---

## Swagger/OpenAPI

```text
http://localhost:9092/swagger-ui/index.html
http://localhost:9092/v3/api-docs
```

## Run the server

```powershell
Set-Location "C:\Users\frede\VSCode\Finance\Pricer"
mvn spring-boot:run
```

## Notes

- The Bloomberg routes are the main API contract.
- Compatibility routes remain available for legacy testing.
- The application runs on port 9092.
