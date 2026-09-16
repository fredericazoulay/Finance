package com.finance.pricer;

public final class BinomialModel implements PricingModel {
    private final int steps;

    public BinomialModel(int steps) {
        if (steps < 1) throw new IllegalArgumentException("steps must be positive");
        this.steps = steps;
    }

    @Override
    public String name() {
        return "BINOMIAL_CRR";
    }

    @Override
    public double price(Instrument instrument, MarketData marketData) {
        if (!(instrument instanceof Option option)) {
            throw new IllegalArgumentException("Binomial model requires an option");
        }
        double dt = option.maturity() / steps;
        double up = Math.exp(marketData.volatility() * Math.sqrt(dt));
        double down = 1.0 / up;
        double growth = Math.exp((marketData.riskFreeRate() - marketData.dividendYield()) * dt);
        double probability = (growth - down) / (up - down);
        if (probability < 0 || probability > 1) throw new IllegalArgumentException("Invalid CRR parameters");
        double discount = Math.exp(-marketData.riskFreeRate() * dt);
        double[] values = new double[steps + 1];
        for (int i = 0; i <= steps; i++) {
            double terminalSpot = marketData.spot() * Math.pow(up, i) * Math.pow(down, steps - i);
            values[i] = BlackScholesModel.intrinsicValue(terminalSpot, option.strike(), option.type());
        }
        for (int step = steps - 1; step >= 0; step--) {
            for (int i = 0; i <= step; i++) {
                values[i] = discount * (probability * values[i + 1] + (1 - probability) * values[i]);
                if (!option.european()) {
                    double nodeSpot = marketData.spot() * Math.pow(up, i) * Math.pow(down, step - i);
                    values[i] = Math.max(values[i], BlackScholesModel.intrinsicValue(nodeSpot, option.strike(), option.type()));
                }
            }
        }
        return values[0];
    }
}
