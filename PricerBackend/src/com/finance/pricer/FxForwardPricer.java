package com.finance.pricer;

public final class FxForwardPricer {
    private FxForwardPricer() { }

    public static double forward(double spot, double domesticRate, double foreignRate, double maturity) {
        if (spot <= 0 || maturity < 0) throw new IllegalArgumentException("Invalid FX inputs");
        return spot * Math.exp((domesticRate - foreignRate) * maturity);
    }

    public static double presentValue(double notional, double agreedForward, double spot,
                                      double domesticRate, double foreignRate, double maturity) {
        double marketForward = forward(spot, domesticRate, foreignRate, maturity);
        return notional * (marketForward - agreedForward) * Math.exp(-domesticRate * maturity);
    }
}
