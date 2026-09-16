package com.finance.pricer;

public final class SwapPricer {
    private SwapPricer() { }

    public static double presentValue(InterestRateSwap swap, DiscountCurve curve) {
        int periods = (int) Math.round(swap.maturity() * swap.paymentsPerYear());
        double fixedLeg = 0;
        double floatingLeg = 1 - curve.discountFactor(swap.maturity());
        for (int i = 1; i <= periods; i++) fixedLeg += curve.discountFactor((double) i / swap.paymentsPerYear()) / swap.paymentsPerYear();
        double pv = swap.notional() * (swap.fixedRate() * fixedLeg - floatingLeg);
        return swap.receiveFixed() ? pv : -pv;
    }

    public static double parRate(double maturity, int paymentsPerYear, DiscountCurve curve) {
        return curve.parRate(maturity, paymentsPerYear);
    }
}
