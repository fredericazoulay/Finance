package com.finance.pricer.options.exotics;

import com.finance.pricer.core.math.NormalDist;
import com.finance.pricer.options.vanilla.GeneralizedBlackScholes;

import java.util.Random;

/**
 * Asian (Average Price) Option pricing engine (Hull Chapter 24, Section 24.13).
 * - Kemna & Vorst (1990) exact analytical solution for Continuous & Discrete Geometric Average.
 * - Turnbull & Wakeman (1991) analytical moment-matching for Arithmetic Average.
 * - High-speed Monte Carlo with Geometric Control Variate for benchmark validation.
 */
public class AsianOptionPricer {

    public enum AverageType {
        GEOMETRIC,
        ARITHMETIC
    }

    public record AsianResult(
            double price,
            double geometricAnalyticalPrice,
            double standardError
    ) {}

    /**
     * Exact closed-form pricing for Geometric Average Asian Option (Kemna & Vorst 1990).
     */
    public static double priceGeometricAverage(
            GeneralizedBlackScholes.OptionType type,
            double spot,
            double strike,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility,
            int observationPoints) {

        if (timeToMaturity <= 0.0) {
            return type == GeneralizedBlackScholes.OptionType.CALL ? Math.max(0.0, spot - strike) : Math.max(0.0, strike - spot);
        }

        double m = (observationPoints > 0) ? observationPoints : 100;
        // Adjusted volatility and cost of carry for discrete/continuous geometric average
        double sigmaG;
        double bG;

        if (observationPoints > 1) {
            sigmaG = volatility * Math.sqrt((2.0 * m + 1.0) / (6.0 * (m + 1.0)));
            bG = 0.5 * (costOfCarry - 0.5 * volatility * volatility + sigmaG * sigmaG);
        } else {
            // Continuous limit: sigmaG = sigma / sqrt(3)
            sigmaG = volatility / Math.sqrt(3.0);
            bG = 0.5 * (costOfCarry - volatility * volatility / 6.0);
        }

        return GeneralizedBlackScholes.price(type, spot, strike, timeToMaturity, riskFreeRate, bG, sigmaG);
    }

    /**
     * Turnbull & Wakeman (1991) analytical moment-matching for Arithmetic Average Asian Option.
     */
    public static double priceArithmeticTurnbullWakeman(
            GeneralizedBlackScholes.OptionType type,
            double spot,
            double strike,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        double t = timeToMaturity;
        double b = costOfCarry;
        double v = volatility;
        double vSq = v * v;

        // First two moments M1 and M2 of continuous arithmetic average
        double m1;
        double m2;

        if (Math.abs(b) < 1e-8) {
            m1 = spot;
            m2 = (2.0 * spot * spot / (vSq * vSq * t * t)) * (Math.exp(vSq * t) - 1.0 - vSq * t);
        } else {
            m1 = (spot / (b * t)) * (Math.exp(b * t) - 1.0);
            double term1 = 2.0 * spot * spot / (b + vSq);
            double term2 = (Math.exp((2.0 * b + vSq) * t) - 1.0) / (2.0 * b + vSq);
            double term3 = (Math.exp(b * t) - 1.0) / b;
            m2 = (term1 / (t * t)) * (term2 - term3);
        }

        double fwdAverage = m1;
        double sigmaA = Math.sqrt(Math.max(1e-12, Math.log(m2 / (m1 * m1)) / t));

        double sqrtT = Math.sqrt(t);
        double d1 = (Math.log(fwdAverage / strike) + 0.5 * sigmaA * sigmaA * t) / (sigmaA * sqrtT);
        double d2 = d1 - sigmaA * sqrtT;

        double df = Math.exp(-riskFreeRate * t);
        if (type == GeneralizedBlackScholes.OptionType.CALL) {
            return df * (fwdAverage * NormalDist.cdf(d1) - strike * NormalDist.cdf(d2));
        } else {
            return df * (strike * NormalDist.cdf(-d2) - fwdAverage * NormalDist.cdf(-d1));
        }
    }

    /**
     * High-speed Monte Carlo with Geometric Control Variate for Arithmetic Asian option.
     * Reduces variance by >99% compared to raw Monte Carlo.
     */
    public static AsianResult priceArithmeticMonteCarloControlVariate(
            GeneralizedBlackScholes.OptionType type,
            double spot,
            double strike,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility,
            int paths,
            int steps) {

        double geomExact = priceGeometricAverage(type, spot, strike, timeToMaturity, riskFreeRate, costOfCarry, volatility, steps);
        double dt = timeToMaturity / steps;
        double drift = (costOfCarry - 0.5 * volatility * volatility) * dt;
        double volSqrtDt = volatility * Math.sqrt(dt);
        double df = Math.exp(-riskFreeRate * timeToMaturity);

        Random rng = new Random(42);
        double sumArith = 0.0;
        double sumGeom = 0.0;
        double sumDiff = 0.0;
        double sumDiffSq = 0.0;

        for (int p = 0; p < paths; p++) {
            double currentSpot = spot;
            double sumS = 0.0;
            double logSumS = 0.0;

            for (int s = 0; s < steps; s++) {
                double z = rng.nextGaussian();
                currentSpot *= Math.exp(drift + volSqrtDt * z);
                sumS += currentSpot;
                logSumS += Math.log(currentSpot);
            }

            double arithAvg = sumS / steps;
            double geomAvg = Math.exp(logSumS / steps);

            double arithPayoff = (type == GeneralizedBlackScholes.OptionType.CALL)
                    ? Math.max(0.0, arithAvg - strike)
                    : Math.max(0.0, strike - arithAvg);

            double geomPayoff = (type == GeneralizedBlackScholes.OptionType.CALL)
                    ? Math.max(0.0, geomAvg - strike)
                    : Math.max(0.0, strike - geomAvg);

            double diff = df * (arithPayoff - geomPayoff);
            sumDiff += diff;
            sumDiffSq += diff * diff;
        }

        double meanDiff = sumDiff / paths;
        double variance = (sumDiffSq - paths * meanDiff * meanDiff) / (paths - 1);
        double stderr = Math.sqrt(variance / paths);

        double arithPrice = geomExact + meanDiff;
        return new AsianResult(arithPrice, geomExact, stderr);
    }
}

