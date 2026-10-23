package com.finance.pricer.options.vanilla;

import com.finance.pricer.core.math.NormalDist;

/**
 * Bjerksund & Stensland (1993 / 2002) analytical closed-form approximation
 * for American options with continuous dividend yield / cost of carry.
 * Industry standard for high-performance American option pricing (Hull Chapter 15 & 20).
 */
public final class BjerksundStensland {

    private BjerksundStensland() { }

    public static double price(
            GeneralizedBlackScholes.OptionType type,
            double spot,
            double strike,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        if (timeToMaturity <= 0.0) {
            return type == GeneralizedBlackScholes.OptionType.CALL
                    ? Math.max(0.0, spot - strike)
                    : Math.max(0.0, strike - spot);
        }

        if (type == GeneralizedBlackScholes.OptionType.CALL) {
            return priceAmericanCall(spot, strike, timeToMaturity, riskFreeRate, costOfCarry, volatility);
        } else {
            // American Put via Put-Call Symmetry:
            // P(S, K, T, r, b, sigma) = C(K, S, T, r - b, -b, sigma)
            return priceAmericanCall(strike, spot, timeToMaturity, riskFreeRate - costOfCarry, -costOfCarry, volatility);
        }
    }

    private static double priceAmericanCall(double s, double k, double t, double r, double b, double sigma) {
        if (b >= r) {
            // Never optimal to exercise early when b >= r (e.g. non-dividend paying stock)
            return GeneralizedBlackScholes.price(GeneralizedBlackScholes.OptionType.CALL, s, k, t, r, b, sigma);
        }

        double sigmaSq = sigma * sigma;
        double beta = (0.5 - b / sigmaSq) + Math.sqrt(Math.pow(b / sigmaSq - 0.5, 2.0) + 2.0 * r / sigmaSq);
        double bInfinity = (beta / (beta - 1.0)) * k;
        double b0 = Math.max(k, (r / (r - b)) * k);
        double h = -(b * t + 2.0 * sigma * Math.sqrt(t)) * (b0 / (bInfinity - b0));
        double triggerI = b0 + (bInfinity - b0) * (1.0 - Math.exp(h));

        if (s >= triggerI) {
            return s - k;
        }

        double alpha = (triggerI - k) * Math.pow(triggerI, -beta);

        return alpha * Math.pow(s, beta)
                - alpha * phi(s, t, beta, triggerI, triggerI, r, b, sigma)
                + phi(s, t, 1.0, triggerI, triggerI, r, b, sigma)
                - phi(s, t, 1.0, k, triggerI, r, b, sigma)
                - k * phi(s, t, 0.0, triggerI, triggerI, r, b, sigma)
                + k * phi(s, t, 0.0, k, triggerI, r, b, sigma);
    }

    private static double phi(double s, double t, double gamma, double h, double triggerI, double r, double b, double sigma) {
        double sigmaSq = sigma * sigma;
        double lambda = (-r + gamma * b + 0.5 * gamma * (gamma - 1.0) * sigmaSq) * t;
        double d = -(Math.log(s / h) + (b + (gamma - 0.5) * sigmaSq) * t) / (sigma * Math.sqrt(t));
        double kappa = (2.0 * b / sigmaSq) + (2.0 * gamma - 1.0);
        return Math.exp(lambda) * Math.pow(s, gamma) * (NormalDist.cdf(d) - Math.pow(triggerI / s, kappa) * NormalDist.cdf(d - 2.0 * Math.log(triggerI / s) / (sigma * Math.sqrt(t))));
    }
}

