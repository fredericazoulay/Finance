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
        Double zSpread,
        List<String> rankingCriteria
) {
    public record PanelItem(
            BondComparablesPricingRequest.ComparableBond bond,
            boolean eligible,
            boolean selected,
                        String exclusionReason,
                        Integer rank,
                        List<String> rankingReasons,
                        ComparableAnalytics analytics
    ) {
        public PanelItem(
                BondComparablesPricingRequest.ComparableBond bond,
                boolean eligible,
                boolean selected,
                String exclusionReason,
                Integer rank,
                List<String> rankingReasons) {
            this(bond, eligible, selected, exclusionReason, rank, rankingReasons, null);
        }
    }

    public record ComparableAnalytics(
            Double cleanPrice,
            Double dirtyPrice,
            Double accruedInterest,
            Double ytm,
            Double macaulayDuration,
            Double modifiedDuration,
            Double convexity,
            Double dv01,
            Double zSpreadBps,
            String priceBasis,
            String zSpreadStatus,
            String calculationStatus
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