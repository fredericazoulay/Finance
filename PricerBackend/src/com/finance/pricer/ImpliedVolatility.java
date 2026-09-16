package com.finance.pricer;

public final class ImpliedVolatility {
    private ImpliedVolatility() { }

    public static double solve(Option option, double marketPrice, MarketData marketData) {
        if (marketPrice < BlackScholesModel.intrinsicValue(marketData.spot(), option.strike(), option.type())) {
            throw new IllegalArgumentException("Market price is below intrinsic value");
        }
        double low = 1e-8, high = 5.0;
        for (int i = 0; i < 100; i++) {
            double mid = (low + high) / 2;
            MarketData trial = new MarketData(marketData.spot(), marketData.riskFreeRate(), mid, marketData.dividendYield());
            double price = new BlackScholesModel().price(option, trial);
            if (price > marketPrice) high = mid; else low = mid;
        }
        return (low + high) / 2;
    }
}
