package com.finance.pricer.options.vanilla;

import com.finance.pricer.core.math.NormalDist;

/**
 * Generalized Black-Scholes-Merton model supporting:
 * 1. Standard non-dividend paying stock (b = r, q = 0)
 * 2. Continuous dividend yield stock / index (Merton 1973: b = r - q)
 * 3. Currency / FX Options (Garman-Kohlhagen 1983: b = r - r_f)
 * 4. Futures / Forwards Options (Black 1976: b = 0, S = F0)
 * 
 * References:
 * - John C. Hull, "Options, Futures, and Other Derivatives", Chapters 13, 15, 16 & 17.
 */
public class GeneralizedBlackScholes {

    public enum OptionType {
        CALL,
        PUT
    }

    /**
     * Prices a generalized vanilla European option.
     *
     * @param type CALL or PUT
     * @param spot current underlying price S (or forward/futures price F for Black-76)
     * @param strike strike price K
     * @param timeToMaturity time to expiration T in years
     * @param riskFreeRate domestic risk-free rate r
     * @param costOfCarry cost of carry b (r for non-div, r-q for div yield, r-rf for FX, 0 for futures)
     * @param volatility annual volatility sigma
     * @return option theoretical price
     */
    public static double price(
            OptionType type,
            double spot,
            double strike,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        if (timeToMaturity <= 0.0) {
            return type == OptionType.CALL ? Math.max(0.0, spot - strike) : Math.max(0.0, strike - spot);
        }
        if (volatility <= 1e-9) {
            double fwd = spot * Math.exp(costOfCarry * timeToMaturity);
            double df = Math.exp(-riskFreeRate * timeToMaturity);
            return type == OptionType.CALL ? Math.max(0.0, (fwd - strike) * df) : Math.max(0.0, (strike - fwd) * df);
        }

        double sqrtT = Math.sqrt(timeToMaturity);
        double sigmaSqrtT = volatility * sqrtT;
        double d1 = (Math.log(spot / strike) + (costOfCarry + 0.5 * volatility * volatility) * timeToMaturity) / sigmaSqrtT;
        double d2 = d1 - sigmaSqrtT;

        double dfRiskFree = Math.exp(-riskFreeRate * timeToMaturity);
        double carryDiscount = Math.exp((costOfCarry - riskFreeRate) * timeToMaturity);

        if (type == OptionType.CALL) {
            return spot * carryDiscount * NormalDist.cdf(d1) - strike * dfRiskFree * NormalDist.cdf(d2);
        } else {
            return strike * dfRiskFree * NormalDist.cdf(-d2) - spot * carryDiscount * NormalDist.cdf(-d1);
        }
    }

    // Convenience factory methods for standard models

    /**
     * Standard Black-Scholes-Merton for stocks with continuous dividend yield q.
     */
    public static double priceMerton(OptionType type, double spot, double strike, double timeToMaturity, double r, double q, double sigma) {
        return price(type, spot, strike, timeToMaturity, r, r - q, sigma);
    }

    /**
     * Garman-Kohlhagen (1983) for FX currency options.
     */
    public static double priceGarmanKohlhagen(OptionType type, double spotFx, double strikeFx, double timeToMaturity, double domesticRate, double foreignRate, double sigma) {
        return price(type, spotFx, strikeFx, timeToMaturity, domesticRate, domesticRate - foreignRate, sigma);
    }

    /**
     * Black-76 model for European options on futures contracts.
     */
    public static double priceBlack76(OptionType type, double futuresPrice, double strike, double timeToMaturity, double r, double sigma) {
        return price(type, futuresPrice, strike, timeToMaturity, r, 0.0, sigma);
    }

    /**
     * Standard Black-Scholes for non-dividend stocks (q = 0).
     */
    public static double priceStandard(OptionType type, double spot, double strike, double timeToMaturity, double r, double sigma) {
        return price(type, spot, strike, timeToMaturity, r, r, sigma);
    }
}

