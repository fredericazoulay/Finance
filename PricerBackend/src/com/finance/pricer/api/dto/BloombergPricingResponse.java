package com.finance.pricer.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.OffsetDateTime;
import java.util.Map;

public record BloombergPricingResponse(
        @JsonProperty("request_id") String requestId,
        @JsonProperty("response_status") String responseStatus,
        @JsonProperty("timestamp") OffsetDateTime timestamp,
        @JsonProperty("security_id") String securityId,
        @JsonProperty("security_name") String securityName,
        @JsonProperty("product") String product,
        @JsonProperty("curve_name") String curveName,
        @JsonProperty("market_data_source") String marketDataSource,
        @JsonProperty("result") Map<String, Object> result,
        @JsonProperty("metadata") Map<String, Object> metadata
) {
}
