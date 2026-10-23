package com.finance.pricer.api.dto;

import java.time.LocalDate;
import java.util.List;

public record BondComparablesPricingRequest(
        TargetBond target,
        List<ComparableBond> panel,
        Integer maturityToleranceMonths
) {
    public record TargetBond(
            String securityId,
            String name,
            String currency,
            Double faceValue,
            Double couponRate,
            Integer couponFrequency,
            LocalDate maturityDate,
            LocalDate settlementDate,
            String dayCount
    ) {}

    public record ComparableBond(
            String securityId,
            String name,
            String issuer,
            String currency,
            LocalDate maturityDate,
            Double yieldToMaturity,
            Double couponRate,
            Double marketPrice,
            String rating,
            String source,
            String asOf
    ) {}
}