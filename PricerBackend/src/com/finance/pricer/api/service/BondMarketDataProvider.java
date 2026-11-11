package com.finance.pricer.api.service;

import com.finance.pricer.api.dto.BondComparableSearchRequest;
import com.finance.pricer.api.dto.BondComparablesPricingRequest;

import java.util.List;

public interface BondMarketDataProvider {
    boolean isConfigured();

    List<BondComparablesPricingRequest.ComparableBond> search(BondComparableSearchRequest request);
}