package com.finance.pricer;

public record InterestRateSwap(double notional, double fixedRate, double maturity, int paymentsPerYear,
                               boolean receiveFixed) {
    public InterestRateSwap {
        if (notional <= 0 || maturity <= 0 || paymentsPerYear <= 0) throw new IllegalArgumentException("Invalid swap");
    }
}
