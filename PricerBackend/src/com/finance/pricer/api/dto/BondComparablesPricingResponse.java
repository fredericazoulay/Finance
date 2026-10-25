package com.finance.pricer.api.dto;

import java.util.List;

public record BondComparablesPricingResponse(
        String targetSecurityId,
        String currency,
        int maturityToleranceMonths,
        List<PanelItem> panel,
        String bestYieldSecurityId,
        double appliedYield,
                BondValuation valuation,
                List<String> rankingCriteria
) {
    public record PanelItem(
            BondComparablesPricingRequest.ComparableBond bond,
            boolean eligible,
            boolean selected,
                        String exclusionReason,
                        Integer rank,
                        List<String> rankingReasons
    ) {}

    public record BondValuation(
            double cleanPrice,
            double dirtyPrice,
            double accruedInterest,
            long accruedDays,
                        String dayCount,
                        double ytm,
                        double macaulayDuration,
                        double modifiedDuration,
                        double convexity,
                        double dv01
    ) {}
}