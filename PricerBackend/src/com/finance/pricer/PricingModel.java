package com.finance.pricer;

public interface PricingModel {
    String name();
    double price(Instrument instrument, MarketData marketData);
}
