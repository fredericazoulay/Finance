package com.finance.pricer;

public final class CdsPricer {
    private CdsPricer() { }

    public static double presentValue(CreditDefaultSwap cds, DiscountCurve curve, double hazardRate) {
        double premiumLeg = 0;
        double protectionLeg = 0;
        double previousSurvival = 1;
        int periods = (int) Math.round(cds.maturity() * cds.paymentsPerYear());
        for (int i = 1; i <= periods; i++) {
            double time = (double) i / cds.paymentsPerYear();
            double survival = Math.exp(-hazardRate * time);
            double discount = curve.discountFactor(time);
            premiumLeg += cds.spread() / cds.paymentsPerYear() * survival * discount;
            protectionLeg += (1 - cds.recoveryRate()) * (previousSurvival - survival) * discount;
            previousSurvival = survival;
        }
        return cds.notional() * (protectionLeg - premiumLeg);
    }

    public static double parSpread(double maturity, int frequency, double recovery, DiscountCurve curve, double hazardRate) {
        CreditDefaultSwap unit = new CreditDefaultSwap(1, 0, maturity, frequency, recovery);
        double protection = presentValue(unit, curve, hazardRate);
        double premium01 = 0;
        int periods = (int) Math.round(maturity * frequency);
        for (int i = 1; i <= periods; i++) premium01 += Math.exp(-hazardRate * i / frequency) * curve.discountFactor((double) i / frequency) / frequency;
        return protection / premium01;
    }

    public static double impliedHazardRate(CreditDefaultSwap cds, DiscountCurve curve) {
        double low = 0, high = 5;
        for (int i = 0; i < 100; i++) {
            double mid = (low + high) / 2;
            if (presentValue(cds, curve, mid) > 0) high = mid; else low = mid;
        }
        return (low + high) / 2;
    }
}
