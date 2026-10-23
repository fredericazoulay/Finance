package com.finance.pricer.multiasset;

import com.finance.pricer.core.math.NormalDist;

/**
 * Multi-Asset Spread and Exchange Option pricing engine (Hull Chapter 24, Section 24.14).
 * - Margrabe (1978) exact analytical formula for the option to exchange asset 2 for asset 1: max(0, S1 - S2).
 * - Kirk (1995) industry-standard analytical approximation for spread options with strike K > 0: max(0, S1 - S2 - K).
 */
public class MargrabeKirkSpreadOption {

    /**
     * Margrabe (1978) exact closed-form solution for Exchange Options: max(0, S1_T - S2_T).
     *
     * @param s1 spot price of asset 1
     * @param s2 spot price of asset 2
     * @param q1 dividend yield of asset 1
     * @param q2 dividend yield of asset 2
     * @param sigma1 volatility of asset 1
     * @param sigma2 volatility of asset 2
     * @param correlation correlation rho between asset 1 and asset 2
     * @param timeToMaturity expiration T in years
     * @return exchange option price
     */
    public static double priceMargrabe(
            double s1,
            double s2,
            double q1,
            double q2,
            double sigma1,
            double sigma2,
            double correlation,
            double timeToMaturity) {

        if (timeToMaturity <= 0.0) {
            return Math.max(0.0, s1 - s2);
        }

        double t = timeToMaturity;
        double sigmaHatSq = sigma1 * sigma1 + sigma2 * sigma2 - 2.0 * correlation * sigma1 * sigma2;
        if (sigmaHatSq <= 1e-12) {
            double f1 = s1 * Math.exp(-q1 * t);
            double f2 = s2 * Math.exp(-q2 * t);
            return Math.max(0.0, f1 - f2);
        }

        double sigmaHat = Math.sqrt(sigmaHatSq);
        double sqrtT = Math.sqrt(t);
        double sigmaHatSqrtT = sigmaHat * sqrtT;

        double f1 = s1 * Math.exp(-q1 * t);
        double f2 = s2 * Math.exp(-q2 * t);

        double d1 = (Math.log(f1 / f2) + 0.5 * sigmaHatSq * t) / sigmaHatSqrtT;
        double d2 = d1 - sigmaHatSqrtT;

        return f1 * NormalDist.cdf(d1) - f2 * NormalDist.cdf(d2);
    }

    /**
     * Kirk (1995) analytical approximation for Spread Options: max(0, S1_T - S2_T - K).
     *
     * @param s1 spot price of asset 1
     * @param s2 spot price of asset 2
     * @param strike strike price K (if K=0, coincides with Margrabe)
     * @param r risk-free interest rate
     * @param q1 continuous dividend yield of asset 1
     * @param q2 continuous dividend yield of asset 2
     * @param sigma1 volatility of asset 1
     * @param sigma2 volatility of asset 2
     * @param correlation correlation between asset 1 and asset 2
     * @param timeToMaturity time to expiration T in years
     */
    public static double priceKirkSpread(
            double s1,
            double s2,
            double strike,
            double r,
            double q1,
            double q2,
            double sigma1,
            double sigma2,
            double correlation,
            double timeToMaturity) {

        if (Math.abs(strike) < 1e-8) {
            return priceMargrabe(s1, s2, q1, q2, sigma1, sigma2, correlation, timeToMaturity);
        }
        if (timeToMaturity <= 0.0) {
            return Math.max(0.0, s1 - s2 - strike);
        }

        double t = timeToMaturity;
        double f1 = s1 * Math.exp((r - q1) * t);
        double f2 = s2 * Math.exp((r - q2) * t);

        double f2PlusK = f2 + strike;
        double w2 = f2 / f2PlusK;

        double sigmaEffSq = sigma1 * sigma1 + w2 * w2 * sigma2 * sigma2 - 2.0 * w2 * correlation * sigma1 * sigma2;
        double sigmaEff = Math.sqrt(Math.max(1e-12, sigmaEffSq));

        double sqrtT = Math.sqrt(t);
        double sigmaEffSqrtT = sigmaEff * sqrtT;

        double d1 = (Math.log(f1 / f2PlusK) + 0.5 * sigmaEffSq * t) / sigmaEffSqrtT;
        double d2 = d1 - sigmaEffSqrtT;

        double df = Math.exp(-r * t);
        return df * (f1 * NormalDist.cdf(d1) - f2PlusK * NormalDist.cdf(d2));
    }
}

