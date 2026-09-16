package com.finance.pricer.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record BloombergMarketData(
        @JsonProperty("underlying_spot") Double underlyingSpot,
        @JsonProperty("risk_free_rate") Double riskFreeRate,
        @JsonProperty("implied_volatility") Double impliedVolatility,
        @JsonProperty("dividend_yield") Double dividendYield,
        @JsonProperty("tenors") double[] tenors,
        @JsonProperty("discount_curve_rates") double[] discountCurveRates,
        @JsonProperty("frequency") Integer frequency,
        @JsonProperty("spot") Double spot,
        @JsonProperty("domestic_rate") Double domesticRate,
        @JsonProperty("foreign_rate") Double foreignRate
) {
}
