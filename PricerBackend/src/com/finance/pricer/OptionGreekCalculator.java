package com.finance.pricer;

public final class OptionGreekCalculator {
    private static final double DAY_IN_YEARS = 1.0 / 365.0;
    private static final double SPOT_BUMP_RELATIVE = 1e-4;
    private static final double VOLATILITY_BUMP = 0.01;
    private static final double RATE_BUMP = 1e-4;

    private OptionGreekCalculator() {
    }

    public static OptionGreeks calculate(Option option, MarketData marketData, PricingModel model, double price) {
        if (model instanceof BlackScholesModel && option.european()
                && marketData.spot() > 0 && marketData.volatility() > 0) {
            return blackScholes(option, marketData);
        }
        return finiteDifferences(option, marketData, model, price);
    }

    private static OptionGreeks blackScholes(Option option, MarketData marketData) {
        double spot = marketData.spot();
        double strike = option.strike();
        double time = option.maturity();
        double rate = marketData.riskFreeRate();
        double dividend = marketData.dividendYield();
        double volatility = marketData.volatility();
        double volatilityTime = volatility * Math.sqrt(time);
        double d1 = (Math.log(spot / strike) + (rate - dividend + 0.5 * volatility * volatility) * time)
                / volatilityTime;
        double d2 = d1 - volatilityTime;
        double density = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2.0 * Math.PI);
        double discountedSpot = Math.exp(-dividend * time);
        double discountedStrike = Math.exp(-rate * time);
        boolean call = option.type() == OptionType.CALL;

        double delta = discountedSpot * (call ? NormalDistribution.cdf(d1) : NormalDistribution.cdf(d1) - 1);
        double gamma = discountedSpot * density / (spot * volatilityTime);
        double theta = (-spot * discountedSpot * density * volatility / (2 * Math.sqrt(time))
                + (call ? -rate * strike * discountedStrike * NormalDistribution.cdf(d2)
                        + dividend * spot * discountedSpot * NormalDistribution.cdf(d1)
                        : rate * strike * discountedStrike * NormalDistribution.cdf(-d2)
                                - dividend * spot * discountedSpot * NormalDistribution.cdf(-d1))) / 365.0;
        double vega = spot * discountedSpot * density * Math.sqrt(time) / 100.0;
        double rho = (call
                ? strike * time * discountedStrike * NormalDistribution.cdf(d2)
                : -strike * time * discountedStrike * NormalDistribution.cdf(-d2)) / 100.0;
        return new OptionGreeks(delta, gamma, theta, vega, rho);
    }

    private static OptionGreeks finiteDifferences(Option option, MarketData marketData,
            PricingModel model, double price) {
        double spot = marketData.spot();
        double spotBump = Math.max(spot * SPOT_BUMP_RELATIVE, 1e-4);
        double lowerSpot = Math.max(0, spot - spotBump);
        double upperSpot = spot + spotBump;
        double lowerSpotPrice = priceAt(option, withSpot(marketData, lowerSpot), model);
        double upperSpotPrice = priceAt(option, withSpot(marketData, upperSpot), model);
        double delta;
        double gamma;
        if (lowerSpot == spot) {
            double secondUpperSpot = spot + 2 * spotBump;
            double secondUpperPrice = priceAt(option, withSpot(marketData, secondUpperSpot), model);
            delta = (-3 * price + 4 * upperSpotPrice - secondUpperPrice) / (2 * spotBump);
            gamma = (price - 2 * upperSpotPrice + secondUpperPrice) / (spotBump * spotBump);
        } else {
            double lowerDistance = spot - lowerSpot;
            double upperDistance = upperSpot - spot;
            delta = (lowerDistance * lowerDistance * (upperSpotPrice - price)
                    + upperDistance * upperDistance * (price - lowerSpotPrice))
                    / (lowerDistance * upperDistance * (lowerDistance + upperDistance));
            gamma = 2 * (lowerSpotPrice / (lowerDistance * (lowerDistance + upperDistance))
                    - price / (lowerDistance * upperDistance)
                    + upperSpotPrice / (upperDistance * (lowerDistance + upperDistance)));
        }

        double volatility = marketData.volatility();
        double lowerVolatility = Math.max(0, volatility - VOLATILITY_BUMP);
        double upperVolatility = volatility + VOLATILITY_BUMP;
        double lowerVolatilityPrice = priceAt(option, withVolatility(marketData, lowerVolatility), model);
        double upperVolatilityPrice = priceAt(option, withVolatility(marketData, upperVolatility), model);
        double vega = (upperVolatilityPrice - lowerVolatilityPrice)
                / (upperVolatility - lowerVolatility) / 100.0;

        double rate = marketData.riskFreeRate();
        double lowerRate = Math.max(-1, rate - RATE_BUMP);
        double upperRate = rate + RATE_BUMP;
        double lowerRatePrice = priceAt(option, withRate(marketData, lowerRate), model);
        double upperRatePrice = priceAt(option, withRate(marketData, upperRate), model);
        double rho = (upperRatePrice - lowerRatePrice) / (upperRate - lowerRate) / 100.0;

        Option longerOption = withMaturity(option, option.maturity() + DAY_IN_YEARS);
        double longerMaturityPrice = priceAt(longerOption, marketData, model);
        double theta = (price - longerMaturityPrice);
        return new OptionGreeks(delta, gamma, theta, vega, rho);
    }

    private static double priceAt(Option option, MarketData marketData, PricingModel model) {
        return model.price(option, marketData);
    }

    private static MarketData withSpot(MarketData marketData, double spot) {
        return new MarketData(spot, marketData.riskFreeRate(), marketData.volatility(), marketData.dividendYield());
    }

    private static MarketData withVolatility(MarketData marketData, double volatility) {
        return new MarketData(marketData.spot(), marketData.riskFreeRate(), volatility, marketData.dividendYield());
    }

    private static MarketData withRate(MarketData marketData, double rate) {
        return new MarketData(marketData.spot(), rate, marketData.volatility(), marketData.dividendYield());
    }

    private static Option withMaturity(Option option, double maturity) {
        return new Option(option.strike(), maturity, option.type(), option.exerciseStyle(), option.exerciseTimesYears());
    }
}
