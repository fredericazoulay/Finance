package com.finance.pricer.api.dto;

import java.time.LocalDate;
import java.util.List;

public record BondAnalyticsResponse(
        String securityId,
        String currency,
        LocalDate valuationDate,
        LocalDate curveReferenceDate,
        String dayCount,
        String curveDayCount,
        double cleanPrice,
        double dirtyPrice,
        double accruedInterest,
        double ytm,
        double macaulayDuration,
        double modifiedDuration,
        double convexity,
        double dv01,
        double zSpread,
        double curveDirtyPrice,
        List<KeyRateDuration> keyRateDurations
) {
    public record KeyRateDuration(double tenorYears, double duration) {}
}