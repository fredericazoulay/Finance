# Finance Pricer API

This project exposes a Bloomberg-style pricing API built on top of the Java pricing engine.

## Run

PowerShell:

```powershell
Set-Location "C:\Users\frede\VSCode\Finance\Pricer"
mvn spring-boot:run
```

The application listens on port 9092 by default.

Swagger UI:

```text
http://localhost:9092/swagger-ui/index.html
```

OpenAPI JSON:

```text
http://localhost:9092/v3/api-docs
```

---

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

## Products catalog

### GET /api/products

Response:

```json
{
  "products": [
    "EQUITY_OPTION",
    "FIXED_INCOME_BOND",
    "EQUITY",
    "INTEREST_RATE_SWAP",
    "CREDIT_DEFAULT_SWAP",
    "FX_FORWARD"
  ]
}
```

---

## Bloomberg-style pricing endpoints

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

## Notes

- The legacy routes are retained as fallback compatibility aliases.
- The Bloomberg-style routes are the primary contract.
- The app uses Spring Boot 3.3.3 and Java 17.
- The actual pricing logic remains in the Java engine; the API is a REST layer over it.

## Postman usage

1. Open Postman.
2. Create a new POST request.
3. Set URL to `http://localhost:9092/api/v1/blp/pricing/equity-option`.
4. Set Content-Type to `application/json`.
5. Paste one of the JSON requests above.
6. Send the request and inspect the response body.

---

## Minimal Maven command

```powershell
Set-Location "C:\Users\frede\VSCode\Finance\Pricer"
mvn spring-boot:run
```

This should start the service on port 9092 and expose the Swagger UI and OpenAPI endpoints.
