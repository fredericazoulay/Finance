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
            LocalDate issueDate,
            LocalDate maturityDate,
            LocalDate settlementDate,
            String dayCount,
            String issuer,
            String rating,
            String sector,
            String seniority
    ) {
        public TargetBond(
                String securityId,
                String name,
                String currency,
                Double faceValue,
                Double couponRate,
                Integer couponFrequency,
                LocalDate issueDate,
                LocalDate maturityDate,
                LocalDate settlementDate,
                String dayCount) {
            this(securityId, name, currency, faceValue, couponRate, couponFrequency, issueDate,
                    maturityDate, settlementDate, dayCount, null, null, null, null);
        }
    }

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
                        String asOf,
                        LocalDate issueDate,
                        String sector,
                        String seniority
        ) {
                public ComparableBond(
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
                                String asOf,
                                LocalDate issueDate) {
                        this(securityId, name, issuer, currency, maturityDate, yieldToMaturity, couponRate,
                                        marketPrice, rating, source, asOf, issueDate, null, null);
                }
        }
}