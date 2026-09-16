package com.finance.pricer;

public final class BlackScholesModel implements PricingModel {
    @Override
    public String name() {
        return "BLACK_SCHOLES";
    }

    @Override
    public double price(Instrument instrument, MarketData marketData) {
        if (!(instrument instanceof Option option) || !option.european()) {
            throw new IllegalArgumentException("Black-Scholes requires a European option");
        }
        double spot = marketData.spot();
        double strike = option.strike();
        double time = option.maturity();
        double sigma = marketData.volatility();
        if (spot <= 0 || sigma <= 0) {
            return intrinsicValue(spot, strike, option.type());
        }
        double variance = sigma * Math.sqrt(time);
        double d1 = (Math.log(spot / strike) + (marketData.riskFreeRate()
                - marketData.dividendYield() + 0.5 * sigma * sigma) * time) / variance;
        double d2 = d1 - variance;
        double discountedSpot = spot * Math.exp(-marketData.dividendYield() * time);
        double discountedStrike = strike * Math.exp(-marketData.riskFreeRate() * time);
        return option.type() == OptionType.CALL
                ? discountedSpot * NormalDistribution.cdf(d1) - discountedStrike * NormalDistribution.cdf(d2)
                : discountedStrike * NormalDistribution.cdf(-d2) - discountedSpot * NormalDistribution.cdf(-d1);
    }

    static double intrinsicValue(double spot, double strike, OptionType type) {
        return type == OptionType.CALL ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
    }
}
