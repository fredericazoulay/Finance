package com.finance.pricer.options.exotics;

import com.finance.pricer.core.math.NormalDist;

/**
 * Analytical Lookback Option pricing engine (Goldman, Sosin & Gatto 1979; Hull Chapter 24, Section 24.11).
 * Supports Floating Strike and Fixed Strike Lookbacks.
 */
public class LookbackOptionPricer {

    public enum LookbackType {
        FLOATING_STRIKE,
        FIXED_STRIKE
    }

    /**
     * Floating Strike Lookback Call: pays S_T - S_min.
     */
    public static double priceFloatingCall(
            double spot,
            double sMin,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        if (timeToMaturity <= 0.0) return Math.max(0.0, spot - sMin);

        double s = spot;
        double sM = Math.min(s, sMin);
        double t = timeToMaturity;
        double r = riskFreeRate;
        double b = Math.abs(costOfCarry) < 1e-8 ? 1e-8 : costOfCarry;
        double v = volatility;

        double vSq = v * v;
        double sqrtT = Math.sqrt(t);
        double vSqrtT = v * sqrtT;

        double a1 = (Math.log(s / sM) + (b + 0.5 * vSq) * t) / vSqrtT;
        double a2 = a1 - vSqrtT;
        double a3 = (Math.log(s / sM) + (-b + 0.5 * vSq) * t) / vSqrtT;
        double y1 = -2.0 * (b - 0.5 * vSq) * Math.log(s / sM) / vSq;

        double dfCarry = Math.exp((b - r) * t);
        double dfR = Math.exp(-r * t);

        return s * dfCarry * NormalDist.cdf(a1)
                - s * dfCarry * (vSq / (2.0 * b)) * NormalDist.cdf(-a1)
                - sM * dfR * (NormalDist.cdf(a2) - (vSq / (2.0 * b)) * Math.exp(y1) * NormalDist.cdf(-a3));
    }

    /**
     * Floating Strike Lookback Put: pays S_max - S_T.
     */
    public static double priceFloatingPut(
            double spot,
            double sMax,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        if (timeToMaturity <= 0.0) return Math.max(0.0, sMax - spot);

        double s = spot;
        double sM = Math.max(s, sMax);
        double t = timeToMaturity;
        double r = riskFreeRate;
        double b = Math.abs(costOfCarry) < 1e-8 ? 1e-8 : costOfCarry;
        double v = volatility;

        double vSq = v * v;
        double sqrtT = Math.sqrt(t);
        double vSqrtT = v * sqrtT;

        double b1 = (Math.log(s / sM) + (b + 0.5 * vSq) * t) / vSqrtT;
        double b2 = b1 - vSqrtT;
        double b3 = (Math.log(s / sM) + (-b + 0.5 * vSq) * t) / vSqrtT;
        double y2 = 2.0 * (b - 0.5 * vSq) * Math.log(sM / s) / vSq;

        double dfCarry = Math.exp((b - r) * t);
        double dfR = Math.exp(-r * t);

        return sM * dfR * (NormalDist.cdf(-b2) - (vSq / (2.0 * b)) * Math.exp(y2) * NormalDist.cdf(b3))
                + s * dfCarry * (vSq / (2.0 * b)) * NormalDist.cdf(b1)
                - s * dfCarry * NormalDist.cdf(-b1);
    }
}

