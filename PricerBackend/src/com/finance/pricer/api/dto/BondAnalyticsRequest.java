package com.finance.pricer.api.dto;

import java.time.LocalDate;
import java.util.List;

public record BondAnalyticsRequest(
        String securityId,
        String currency,
        Double faceValue,
        Double couponRate,
        Integer couponFrequency,
        LocalDate issueDate,
        LocalDate maturityDate,
        LocalDate settlementDate,
        String dayCount,
        Double cleanPrice,
        DiscountCurve discountCurve,
        List<Double> keyRateTenorsYears
) {
    public record DiscountCurve(
            LocalDate referenceDate,
            String dayCount,
            List<Double> timesYears,
            List<Double> zeroRates
    ) {}
}