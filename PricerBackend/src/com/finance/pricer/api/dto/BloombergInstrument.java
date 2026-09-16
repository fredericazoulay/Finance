package com.finance.pricer.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record BloombergInstrument(
        @JsonProperty("strike") Double strike,
        @JsonProperty("maturity_years") Double maturityYears,
        @JsonProperty("option_type") String optionType,
        @JsonProperty("exercise_style") String exerciseStyle,
        @JsonProperty("notional") Double notional,
        @JsonProperty("fixed_rate") Double fixedRate,
        @JsonProperty("payment_frequency") Integer paymentFrequency,
        @JsonProperty("receiver") Boolean receiver,
        @JsonProperty("spread") Double spread,
        @JsonProperty("recovery_rate") Double recoveryRate,
        @JsonProperty("pair") String pair
) {
}
