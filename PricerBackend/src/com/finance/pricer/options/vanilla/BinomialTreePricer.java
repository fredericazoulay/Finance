package com.finance.pricer.options.vanilla;

import java.util.Set;

/**
 * Flexible Binomial Tree Pricer supporting CRR and Jarrow-Rudd specifications,
 * European, American, and Bermudan exercise styles, and continuous cost of carry (Hull Chapter 12 & 20).
 */
public class BinomialTreePricer {

    public enum TreeType {
        COX_ROSS_RUBINSTEIN,
        JARROW_RUDD
    }

    public enum ExerciseStyle {
        EUROPEAN,
        AMERICAN,
        BERMUDAN
    }

    private final int steps;
    private final TreeType treeType;

    public BinomialTreePricer(int steps, TreeType treeType) {
        if (steps <= 0) throw new IllegalArgumentException("steps must be > 0");
        this.steps = steps;
        this.treeType = treeType != null ? treeType : TreeType.COX_ROSS_RUBINSTEIN;
    }

    public BinomialTreePricer(int steps) {
        this(steps, TreeType.COX_ROSS_RUBINSTEIN);
    }

    public double price(
            GeneralizedBlackScholes.OptionType optionType,
            ExerciseStyle exerciseStyle,
            double spot,
            double strike,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility,
            Set<Integer> bermudanExerciseSteps) {

        if (timeToMaturity <= 0.0) {
            return optionType == GeneralizedBlackScholes.OptionType.CALL
                    ? Math.max(0.0, spot - strike)
                    : Math.max(0.0, strike - spot);
        }

        double dt = timeToMaturity / steps;
        double df = Math.exp(-riskFreeRate * dt);

        double u;
        double d;
        double p;

        if (treeType == TreeType.COX_ROSS_RUBINSTEIN) {
            u = Math.exp(volatility * Math.sqrt(dt));
            d = 1.0 / u;
            p = (Math.exp(costOfCarry * dt) - d) / (u - d);
        } else {
            // Jarrow-Rudd: equal probabilities p = 0.5
            double drift = (costOfCarry - 0.5 * volatility * volatility) * dt;
            u = Math.exp(drift + volatility * Math.sqrt(dt));
            d = Math.exp(drift - volatility * Math.sqrt(dt));
            p = 0.5;
        }

        // Clamp probability for extreme cases
        p = Math.max(0.0, Math.min(1.0, p));
        double q = 1.0 - p;

        // Leaf nodes at step N
        double[] values = new double[steps + 1];
        for (int i = 0; i <= steps; i++) {
            double spotNode = spot * Math.pow(u, steps - i) * Math.pow(d, i);
            values[i] = (optionType == GeneralizedBlackScholes.OptionType.CALL)
                    ? Math.max(0.0, spotNode - strike)
                    : Math.max(0.0, strike - spotNode);
        }

        // Backward induction from step N-1 down to 0
        for (int step = steps - 1; step >= 0; step--) {
            boolean canEarlyExercise = (exerciseStyle == ExerciseStyle.AMERICAN)
                    || (exerciseStyle == ExerciseStyle.BERMUDAN && bermudanExerciseSteps != null && bermudanExerciseSteps.contains(step));

            for (int i = 0; i <= step; i++) {
                double continuationValue = df * (p * values[i] + q * values[i + 1]);
                if (canEarlyExercise) {
                    double spotNode = spot * Math.pow(u, step - i) * Math.pow(d, i);
                    double intrinsicValue = (optionType == GeneralizedBlackScholes.OptionType.CALL)
                            ? Math.max(0.0, spotNode - strike)
                            : Math.max(0.0, strike - spotNode);
                    values[i] = Math.max(continuationValue, intrinsicValue);
                } else {
                    values[i] = continuationValue;
                }
            }
        }

        return values[0];
    }

    public double priceAmerican(GeneralizedBlackScholes.OptionType optionType, double spot, double strike, double timeToMaturity, double r, double b, double sigma) {
        return price(optionType, ExerciseStyle.AMERICAN, spot, strike, timeToMaturity, r, b, sigma, null);
    }

    public double priceEuropean(GeneralizedBlackScholes.OptionType optionType, double spot, double strike, double timeToMaturity, double r, double b, double sigma) {
        return price(optionType, ExerciseStyle.EUROPEAN, spot, strike, timeToMaturity, r, b, sigma, null);
    }
}

