package com.finance.pricer;

import java.util.Random;

public final class MonteCarloModel implements PricingModel {
    private final int simulations;
    private final long seed;

    public MonteCarloModel(int simulations, long seed) {
        if (simulations < 1) throw new IllegalArgumentException("simulations must be positive");
        this.simulations = simulations;
        this.seed = seed;
    }

    @Override
    public String name() {
        return "MONTE_CARLO_GBM";
    }

    @Override
    public double price(Instrument instrument, MarketData marketData) {
        if (!(instrument instanceof Option option) || !option.european()) {
            throw new IllegalArgumentException("Monte Carlo requires a European option");
        }
        Random random = new Random(seed);
        double drift = (marketData.riskFreeRate() - marketData.dividendYield()
                - 0.5 * marketData.volatility() * marketData.volatility()) * option.maturity();
        double diffusion = marketData.volatility() * Math.sqrt(option.maturity());
        double payoffSum = 0;
        for (int i = 0; i < simulations; i++) {
            double normal = random.nextGaussian();
            double terminalSpot = marketData.spot() * Math.exp(drift + diffusion * normal);
            payoffSum += BlackScholesModel.intrinsicValue(terminalSpot, option.strike(), option.type());
        }
        return Math.exp(-marketData.riskFreeRate() * option.maturity()) * payoffSum / simulations;
    }
}
