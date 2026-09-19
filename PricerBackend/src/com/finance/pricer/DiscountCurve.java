package com.finance.pricer;

import java.util.Arrays;

public final class DiscountCurve {
    private final double[] maturities;
    private final double[] discountFactors;

    public DiscountCurve(double[] maturities, double[] discountFactors) {
        if (maturities.length != discountFactors.length || maturities.length == 0) {
            throw new IllegalArgumentException("Curve arrays must have the same non-zero length");
        }
        this.maturities = maturities.clone();
        this.discountFactors = discountFactors.clone();
        for (int i = 0; i < maturities.length; i++) {
            if (maturities[i] <= 0 || discountFactors[i] <= 0
                    || (i > 0 && maturities[i] <= maturities[i - 1])) {
                throw new IllegalArgumentException("Curve pillars must be increasing and positive");
            }
        }
    }

    public static DiscountCurve fromZeroRates(double[] maturities, double[] zeroRates) {
        double[] discounts = new double[maturities.length];
        for (int i = 0; i < maturities.length; i++) discounts[i] = Math.exp(-zeroRates[i] * maturities[i]);
        return new DiscountCurve(maturities, discounts);
    }

    public static DiscountCurve bootstrapParSwaps(double[] maturities, double[] parRates, double paymentFrequency) {
        double[] discounts = new double[maturities.length];
        for (int i = 0; i < maturities.length; i++) {
            double sumPrevious = 0;
            for (int j = 0; j < i; j++) sumPrevious += discounts[j] / paymentFrequency;
            discounts[i] = (1 - parRates[i] * sumPrevious) / (1 + parRates[i] / paymentFrequency);
        }
        return new DiscountCurve(maturities, discounts);
    }

    public double discountFactor(double maturity) {
        if (maturity <= 0) return 1.0;
        if (maturity <= maturities[0]) return Math.exp(Math.log(discountFactors[0]) * maturity / maturities[0]);
        for (int i = 1; i < maturities.length; i++) {
            if (maturity <= maturities[i]) return logLinear(maturity, i - 1, i);
        }
        int last = maturities.length - 1;
        double zero = -Math.log(discountFactors[last]) / maturities[last];
        return Math.exp(-zero * maturity);
    }

    public double zeroRate(double maturity) {
        return -Math.log(discountFactor(maturity)) / maturity;
    }

    public double forwardRate(double start, double end) {
        if (end <= start) throw new IllegalArgumentException("Forward end must exceed start");
        return (discountFactor(start) / discountFactor(end) - 1) / (end - start);
    }

    public double parRate(double maturity, double paymentFrequency) {
        if (maturity <= 0 || paymentFrequency <= 0) {
            throw new IllegalArgumentException("Invalid maturity or payment frequency");
        }
        if (isFlatCurve()) {
            return zeroRate(maturity);
        }
        int periods = (int) Math.round(maturity * paymentFrequency);
        double annuity = 0;
        for (int i = 1; i <= periods; i++) annuity += discountFactor(i / paymentFrequency) / paymentFrequency;
        return (1 - discountFactor(maturity)) / annuity;
    }

    public double[] maturities() { return Arrays.copyOf(maturities, maturities.length); }

    private boolean isFlatCurve() {
        if (maturities.length < 2) return true;
        double firstZeroRate = zeroRate(maturities[0]);
        for (int i = 1; i < maturities.length; i++) {
            if (Math.abs(zeroRate(maturities[i]) - firstZeroRate) > 1e-12) {
                return false;
            }
        }
        return true;
    }

    private double logLinear(double maturity, int left, int right) {
        double weight = (maturity - maturities[left]) / (maturities[right] - maturities[left]);
        double logDf = Math.log(discountFactors[left]) * (1 - weight) + Math.log(discountFactors[right]) * weight;
        return Math.exp(logDf);
    }
}
