package com.finance.pricer;

public final class DiscountedCashFlowModel implements PricingModel {
    @Override
    public String name() {
        return "DISCOUNTED_CASH_FLOW";
    }

    @Override
    public double price(Instrument instrument, MarketData marketData) {
        if (instrument instanceof Bond bond) return priceBond(bond, marketData.riskFreeRate());
        if (instrument instanceof Stock stock) {
            double discountRate = marketData.riskFreeRate();
            if (stock.forecastDividend() == 0 || discountRate <= stock.growthRate()) {
                throw new IllegalArgumentException("Stock DCF requires r > g and positive dividend");
            }
            return stock.forecastDividend() / (discountRate - stock.growthRate());
        }
        throw new IllegalArgumentException("DCF supports bonds and dividend-paying stocks");
    }

    private double priceBond(Bond bond, double yield) {
        int periods = (int) Math.round(bond.maturity() * bond.couponsPerYear());
        double coupon = bond.faceValue() * bond.couponRate() / bond.couponsPerYear();
        double periodRate = yield / bond.couponsPerYear();
        double value = 0;
        for (int period = 1; period <= periods; period++) {
            value += coupon / Math.pow(1 + periodRate, period);
        }
        return value + bond.faceValue() / Math.pow(1 + periodRate, periods);
    }
}
