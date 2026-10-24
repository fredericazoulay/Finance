package com.finance.pricer.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record BloombergPricingBatchResult(
        @JsonProperty("request_id") String requestId,
        BloombergPricingResponse response,
        String error
) {
}