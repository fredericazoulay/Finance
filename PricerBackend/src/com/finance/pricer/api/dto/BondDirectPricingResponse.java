package com.finance.pricer.api.dto;

public record BondDirectPricingResponse(
        String solveFor,
        double faceValue,
        double price,
        double ytm,
        double termYears,
        Double dirtyPrice,
        Double accruedInterest,
        Long accruedDays,
        String dayCount,
        Double macaulayDuration,
        Double modifiedDuration,
        Double convexity,
        Double dv01
) {}