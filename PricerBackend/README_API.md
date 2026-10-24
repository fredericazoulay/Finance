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

This endpoint accepts a user-supplied panel. It does not connect to a market-data provider. The target and eligible comparables must use the same currency; comparable maturity must be within the configured number of months from the target maturity. The highest eligible yield to maturity is applied to the target bond cash flows.

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
    "dayCount": "30/360"
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
      "source": "User import",
      "asOf": "2026-10-22"
    }
  ],
  "maturityToleranceMonths": 24
}
```

The response includes each panel row's eligibility and exclusion reason, the selected security and applied yield, plus clean price, dirty price, accrued interest and day-count convention. The client is responsible for accurately identifying the imported data source and quote date.

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
