package com.finance.pricer.api.dto;

public record BondComparableSearchRequest(
        BondComparablesPricingRequest.TargetBond target,
        Integer maturityToleranceMonths
) {}