package com.finance.pricer.options.exotics;

import com.finance.pricer.core.math.BrentSolver;
import com.finance.pricer.core.math.NormalDist;
import com.finance.pricer.options.vanilla.GeneralizedBlackScholes;

/**
 * Compound and Chooser Option pricing engine (Hull Chapter 24, Section 24.8 & 24.9).
 * - Geske (1979) analytical solution for Compound Options via Bivariate Normal CDF.
 * - Rubinstein (1991) analytical solution for Chooser Options.
 */
public class CompoundChooserOptionPricer {

    public enum CompoundType {
        CALL_ON_CALL,
        CALL_ON_PUT,
        PUT_ON_CALL,
        PUT_ON_PUT
    }

    /**
     * Prices a Geske (1979) compound option using bivariate normal distribution M(a, b; rho).
     *
     * @param type CALL_ON_CALL, CALL_ON_PUT, PUT_ON_CALL, PUT_ON_PUT
     * @param spot current asset spot price S0
     * @param strike1 strike K1 of compound option
     * @param strike2 strike K2 of underlying option
     * @param t1 expiration of compound option T1
     * @param t2 expiration of underlying option T2 (T2 > T1)
     * @param riskFreeRate risk-free rate r
     * @param costOfCarry cost of carry b
     * @param volatility volatility sigma
     */
    public static double priceCompound(
            CompoundType type,
            double spot,
            double strike1,
            double strike2,
            double t1,
            double t2,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        if (t1 >= t2) {
            throw new IllegalArgumentException("t1 must be strictly less than t2");
        }

        double r = riskFreeRate;
        double b = costOfCarry;
        double v = volatility;
        double rho = Math.sqrt(t1 / t2);

        // Determine critical underlying asset spot S* at T1 where underlying option price equals K1
        GeneralizedBlackScholes.OptionType underlyingType =
                (type == CompoundType.CALL_ON_CALL || type == CompoundType.PUT_ON_CALL)
                        ? GeneralizedBlackScholes.OptionType.CALL
                        : GeneralizedBlackScholes.OptionType.PUT;

        double sStar = BrentSolver.findRootWithBracket(
                s -> GeneralizedBlackScholes.price(underlyingType, s, strike2, t2 - t1, r, b, v) - strike1,
                spot * 0.5,
                spot * 1.5,
                1e-8,
                1e-8,
                100
        );

        double vSqrtT1 = v * Math.sqrt(t1);
        double vSqrtT2 = v * Math.sqrt(t2);

        double a1 = (Math.log(spot / sStar) + (b + 0.5 * v * v) * t1) / vSqrtT1;
        double a2 = a1 - vSqrtT1;

        double b1 = (Math.log(spot / strike2) + (b + 0.5 * v * v) * t2) / vSqrtT2;
        double b2 = b1 - vSqrtT2;

        double dfCarryT2 = Math.exp((b - r) * t2);
        double dfRT2 = Math.exp(-r * t2);
        double dfRT1 = Math.exp(-r * t1);

        return switch (type) {
            case CALL_ON_CALL ->
                    spot * dfCarryT2 * NormalDist.bivariateCdf(a1, b1, rho)
                            - strike2 * dfRT2 * NormalDist.bivariateCdf(a2, b2, rho)
                            - strike1 * dfRT1 * NormalDist.cdf(a2);

            case CALL_ON_PUT ->
                    strike2 * dfRT2 * NormalDist.bivariateCdf(-a2, -b2, rho)
                            - spot * dfCarryT2 * NormalDist.bivariateCdf(-a1, -b1, rho)
                            - strike1 * dfRT1 * NormalDist.cdf(-a2);

            case PUT_ON_CALL ->
                    strike1 * dfRT1 * NormalDist.cdf(-a2)
                            - spot * dfCarryT2 * NormalDist.bivariateCdf(-a1, b1, -rho)
                            + strike2 * dfRT2 * NormalDist.bivariateCdf(-a2, b2, -rho);

            case PUT_ON_PUT ->
                    strike1 * dfRT1 * NormalDist.cdf(a2)
                            - strike2 * dfRT2 * NormalDist.bivariateCdf(a2, -b2, -rho)
                            + spot * dfCarryT2 * NormalDist.bivariateCdf(a1, -b1, -rho);
        };
    }

    /**
     * Prices a Simple Chooser Option (Rubinstein 1991).
     * At choice time T1, holder chooses whether the option is a Call or a Put with strike K and expiry T2.
     * Closed-form formula:
     * Chooser = Call(S, K, T2) + exp(-q * (T2 - T1)) * Put(S, K * exp(-(r - q) * (T2 - T1)), T1)
     */
    public static double priceSimpleChooser(
            double spot,
            double strike,
            double choiceTimeT1,
            double expiryTimeT2,
            double riskFreeRate,
            double dividendYield,
            double volatility) {

        if (choiceTimeT1 >= expiryTimeT2) {
            throw new IllegalArgumentException("choiceTimeT1 must be strictly less than expiryTimeT2");
        }

        double r = riskFreeRate;
        double q = dividendYield;
        double callComponent = GeneralizedBlackScholes.priceMerton(GeneralizedBlackScholes.OptionType.CALL, spot, strike, expiryTimeT2, r, q, volatility);

        double adjustedStrike = strike * Math.exp(-(r - q) * (expiryTimeT2 - choiceTimeT1));
        double putComponent = GeneralizedBlackScholes.priceMerton(GeneralizedBlackScholes.OptionType.PUT, spot, adjustedStrike, choiceTimeT1, r, q, volatility);

        double dfBetween = Math.exp(-q * (expiryTimeT2 - choiceTimeT1));
        return callComponent + dfBetween * putComponent;
    }
}

