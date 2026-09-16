package com.finance.pricer;

import java.util.Locale;

public final class Models {
    private Models() { }

    public static PricingModel create(String modelName, int simulations, long seed) {
        return switch (modelName.toUpperCase(Locale.ROOT)) {
            case "BLACK_SCHOLES", "BS" -> new BlackScholesModel();
            case "BINOMIAL", "CRR" -> new BinomialModel(400);
            case "MONTE_CARLO", "MC" -> new MonteCarloModel(simulations, seed);
            case "DISCOUNTED_CASH_FLOW", "DCF" -> new DiscountedCashFlowModel();
            default -> throw new IllegalArgumentException("Unknown model: " + modelName);
        };
    }
}
