package com.finance.pricer;

public record CreditDefaultSwap(double notional, double spread, double maturity, int paymentsPerYear, double recoveryRate) {
    public CreditDefaultSwap {
        if (notional <= 0 || spread < 0 || maturity <= 0 || paymentsPerYear <= 0
                || recoveryRate < 0 || recoveryRate >= 1) throw new IllegalArgumentException("Invalid CDS");
    }
}
