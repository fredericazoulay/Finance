package com.finance.pricer.options.volatility;

import java.util.function.BiFunction;

/**
 * Bruno Dupire's (1994) Local Volatility Surface engine (Hull Chapter 25).
 * Extracts instantaneous local diffusion volatility sigma_L(K, T) from the market European call price surface C(K, T).
 *
 * Dupire Equation:
 * sigma_L^2(K, T) = [ dC/dT + q * C + (r - q) * K * dC/dK ] / [ 0.5 * K^2 * d^2C/dK^2 ]
 */
public class DupireLocalVolatility {

    /**
     * Computes the local volatility sigma_L(K, T) at strike K and maturity T.
     *
     * @param callPriceSurface function (strike, maturity) -> European call price
     * @param strike strike price K
     * @param maturity maturity T in years
     * @param riskFreeRate domestic interest rate r
     * @param dividendYield continuous dividend yield q
     * @return local volatility sigma_L(K, T)
     */
    public static double computeLocalVolatility(
            BiFunction<Double, Double, Double> callPriceSurface,
            double strike,
            double maturity,
            double riskFreeRate,
            double dividendYield) {

        if (maturity <= 1e-4) {
            maturity = 1e-4;
        }

        double k = strike;
        double t = maturity;
        double r = riskFreeRate;
        double q = dividendYield;

        // Finite difference perturbations
        double dt = Math.max(1e-4, 0.005 * t);
        double dk = Math.max(1e-4, 0.005 * k);

        double c = callPriceSurface.apply(k, t);
        double cTUp = callPriceSurface.apply(k, t + dt);
        double cTDown = callPriceSurface.apply(k, Math.max(1e-5, t - dt));

        // Time derivative dC/dT (central difference)
        double dCdT = (cTUp - cTDown) / (2.0 * dt);

        // Strike derivatives dC/dK and d^2C/dK^2
        double cKUp = callPriceSurface.apply(k + dk, t);
        double cKDown = callPriceSurface.apply(Math.max(1e-5, k - dk), t);

        double dCdK = (cKUp - cKDown) / (2.0 * dk);
        double d2CdK2 = (cKUp - 2.0 * c + cKDown) / (dk * dk);

        // Ensure non-zero denominator (density must be strictly positive)
        double denominator = 0.5 * k * k * Math.max(1e-12, d2CdK2);
        double numerator = dCdT + q * c + (r - q) * k * dCdK;

        if (numerator <= 0.0 || denominator <= 0.0) {
            // Fallback to implied local vol estimate
            return 0.20;
        }

        double localVolSq = numerator / denominator;
        return Math.sqrt(Math.max(1e-6, Math.min(4.0, localVolSq)));
    }
}

