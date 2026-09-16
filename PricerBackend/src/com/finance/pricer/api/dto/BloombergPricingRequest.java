package com.finance.pricer.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record BloombergPricingRequest(
        @JsonProperty("request_id") String requestId,
        @JsonProperty("security_id") String securityId,
        @JsonProperty("security_name") String securityName,
        @JsonProperty("product") String product,
        @JsonProperty("curve_name") String curveName,
        @JsonProperty("market_data_source") String marketDataSource,
        @JsonProperty("pricing_model") String pricingModel,
        @JsonProperty("market_data") Object marketData,
        @JsonProperty("instrument") Object instrument
) {
}
