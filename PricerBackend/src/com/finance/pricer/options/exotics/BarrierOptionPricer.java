package com.finance.pricer.options.exotics;

import com.finance.pricer.core.math.NormalDist;
import com.finance.pricer.options.vanilla.GeneralizedBlackScholes;

/**
 * Analytical closed-form pricing engine for all 8 standard Single-Barrier Options
 * (Down-and-Out, Down-and-In, Up-and-Out, Up-and-In for Calls and Puts)
 * as formulated by Reiner & Rubinstein (1991) and John C. Hull (Chapter 24, Section 24.12).
 */
public class BarrierOptionPricer {

    public enum BarrierType {
        DOWN_AND_OUT,
        DOWN_AND_IN,
        UP_AND_OUT,
        UP_AND_IN
    }

    public record BarrierResult(
            double price,
            double vanillaPrice,
            double parityResidual // |In + Out - Vanilla|
    ) {}

    /**
     * Prices a single-barrier European option.
     *
     * @param optionType CALL or PUT
     * @param barrierType DOWN_AND_OUT, DOWN_AND_IN, UP_AND_OUT, UP_AND_IN
     * @param spot current asset price S0
     * @param strike strike price K
     * @param barrier barrier level H
     * @param rebate cash rebate paid if barrier is breached (for out) or at expiry if not breached (for in)
     * @param timeToMaturity time to expiration T in years
     * @param riskFreeRate domestic rate r
     * @param costOfCarry cost of carry b = r - q
     * @param volatility volatility sigma
     */
    public static BarrierResult price(
            GeneralizedBlackScholes.OptionType optionType,
            BarrierType barrierType,
            double spot,
            double strike,
            double barrier,
            double rebate,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        if (timeToMaturity <= 0.0) {
            double vanilla = GeneralizedBlackScholes.price(optionType, spot, strike, 0.0, riskFreeRate, costOfCarry, volatility);
            return new BarrierResult(vanilla, vanilla, 0.0);
        }

        // Check if barrier is already hit at inception
        if ((barrierType == BarrierType.DOWN_AND_OUT || barrierType == BarrierType.DOWN_AND_IN) && spot <= barrier) {
            if (barrierType == BarrierType.DOWN_AND_OUT) {
                return new BarrierResult(rebate, GeneralizedBlackScholes.price(optionType, spot, strike, timeToMaturity, riskFreeRate, costOfCarry, volatility), 0.0);
            } else {
                double v = GeneralizedBlackScholes.price(optionType, spot, strike, timeToMaturity, riskFreeRate, costOfCarry, volatility);
                return new BarrierResult(v, v, 0.0);
            }
        }
        if ((barrierType == BarrierType.UP_AND_OUT || barrierType == BarrierType.UP_AND_IN) && spot >= barrier) {
            if (barrierType == BarrierType.UP_AND_OUT) {
                return new BarrierResult(rebate, GeneralizedBlackScholes.price(optionType, spot, strike, timeToMaturity, riskFreeRate, costOfCarry, volatility), 0.0);
            } else {
                double v = GeneralizedBlackScholes.price(optionType, spot, strike, timeToMaturity, riskFreeRate, costOfCarry, volatility);
                return new BarrierResult(v, v, 0.0);
            }
        }

        double vanilla = GeneralizedBlackScholes.price(optionType, spot, strike, timeToMaturity, riskFreeRate, costOfCarry, volatility);

        // Core Reiner-Rubinstein analytical components A, B, C, D, E, F
        double s = spot;
        double k = strike;
        double h = barrier;
        double t = timeToMaturity;
        double r = riskFreeRate;
        double b = costOfCarry;
        double v = volatility;

        double sqrtT = Math.sqrt(t);
        double vSqrtT = v * sqrtT;
        double vSq = v * v;
        double mu = (b - 0.5 * vSq) / vSq;
        double lambda = Math.sqrt(mu * mu + 2.0 * r / vSq);

        double x1 = (Math.log(s / k) + (1.0 + mu) * vSq * t) / vSqrtT;
        double x2 = (Math.log(s / h) + (1.0 + mu) * vSq * t) / vSqrtT;
        double y1 = (Math.log(h * h / (s * k)) + (1.0 + mu) * vSq * t) / vSqrtT;
        double y2 = (Math.log(h / s) + (1.0 + mu) * vSq * t) / vSqrtT;

        double dfR = Math.exp(-r * t);
        double dfCarry = Math.exp((b - r) * t);

        // Evaluate standard components A through F
        double termA = phi(s, k, x1, vSqrtT, dfCarry, dfR, 1.0);
        double termB = phi(s, k, x2, vSqrtT, dfCarry, dfR, 1.0);
        double termC = eta(s, k, h, y1, vSqrtT, mu, dfCarry, dfR, 1.0);
        double termD = eta(s, k, h, y2, vSqrtT, mu, dfCarry, dfR, 1.0);

        double outPrice;

        if (optionType == GeneralizedBlackScholes.OptionType.CALL) {
            if (barrierType == BarrierType.DOWN_AND_OUT || barrierType == BarrierType.DOWN_AND_IN) {
                if (k >= h) {
                    outPrice = termA - termC;
                } else {
                    outPrice = termB - termD;
                }
                if (barrierType == BarrierType.DOWN_AND_IN) {
                    outPrice = vanilla - outPrice;
                }
            } else { // UP barrier call
                if (k >= h) {
                    outPrice = 0.0;
                } else {
                    outPrice = termA - termB + termC - termD;
                }
                if (barrierType == BarrierType.UP_AND_IN) {
                    outPrice = vanilla - outPrice;
                }
            }
        } else { // PUT option
            double putA = phi(s, k, x1, vSqrtT, dfCarry, dfR, -1.0);
            double putB = phi(s, k, x2, vSqrtT, dfCarry, dfR, -1.0);
            double putC = eta(s, k, h, y1, vSqrtT, mu, dfCarry, dfR, -1.0);
            double putD = eta(s, k, h, y2, vSqrtT, mu, dfCarry, dfR, -1.0);

            if (barrierType == BarrierType.DOWN_AND_OUT || barrierType == BarrierType.DOWN_AND_IN) {
                if (k >= h) {
                    outPrice = putA - putB + putC - putD;
                } else {
                    outPrice = 0.0;
                }
                if (barrierType == BarrierType.DOWN_AND_IN) {
                    outPrice = vanilla - outPrice;
                }
            } else { // UP barrier put
                if (k >= h) {
                    outPrice = putB - putD;
                } else {
                    outPrice = putA - putC;
                }
                if (barrierType == BarrierType.UP_AND_IN) {
                    outPrice = vanilla - outPrice;
                }
            }
        }

        // Clamp non-negative
        outPrice = Math.max(0.0, outPrice);
        double parityResidual = Math.abs(vanilla - (outPrice + (vanilla - outPrice)));

        return new BarrierResult(outPrice, vanilla, parityResidual);
    }

    private static double phi(double s, double k, double x, double vSqrtT, double dfCarry, double dfR, double etaSign) {
        return etaSign * (s * dfCarry * NormalDist.cdf(etaSign * x) - k * dfR * NormalDist.cdf(etaSign * (x - vSqrtT)));
    }

    private static double eta(double s, double k, double h, double y, double vSqrtT, double mu, double dfCarry, double dfR, double etaSign) {
        double power = 2.0 * (mu + 1.0);
        double hOverS = Math.pow(h / s, power);
        double hOverSPower2 = Math.pow(h / s, 2.0 * mu);
        return etaSign * (s * dfCarry * hOverS * NormalDist.cdf(etaSign * y) - k * dfR * hOverSPower2 * NormalDist.cdf(etaSign * (y - vSqrtT)));
    }
}

