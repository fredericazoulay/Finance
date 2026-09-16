package com.finance.pricer;

public record Bond(double faceValue, double couponRate, int couponsPerYear, double maturity) implements Instrument {
    public Bond {
        if (faceValue <= 0 || couponRate < 0 || couponsPerYear <= 0 || maturity <= 0) {
            throw new IllegalArgumentException("Invalid bond parameters");
        }
    }

    @Override
    public String instrumentType() {
        return "COUPON_BOND";
    }
}
