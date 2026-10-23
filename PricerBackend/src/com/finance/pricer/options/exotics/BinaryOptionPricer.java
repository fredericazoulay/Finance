package com.finance.pricer.options.exotics;

import com.finance.pricer.core.math.NormalDist;
import com.finance.pricer.options.vanilla.GeneralizedBlackScholes;

/**
 * Binary (Digital) and Gap Option pricing engine (Hull Chapter 24, Section 24.5 & 24.6).
 * Computes Cash-or-Nothing, Asset-or-Nothing, and Gap Options analytically.
 */
public class BinaryOptionPricer {

    /**
     * Cash-or-Nothing option: pays fixed cash amount payout if in-the-money at maturity.
     * Call: Q * exp(-r * T) * N(d2)
     * Put:  Q * exp(-r * T) * N(-d2)
     */
    public static double priceCashOrNothing(
            GeneralizedBlackScholes.OptionType type,
            double spot,
            double strike,
            double cashPayout,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        if (timeToMaturity <= 0.0) {
            boolean itm = (type == GeneralizedBlackScholes.OptionType.CALL) ? spot > strike : spot < strike;
            return itm ? cashPayout : 0.0;
        }

        double sqrtT = Math.sqrt(timeToMaturity);
        double sigmaSqrtT = volatility * sqrtT;
        double d1 = (Math.log(spot / strike) + (costOfCarry + 0.5 * volatility * volatility) * timeToMaturity) / sigmaSqrtT;
        double d2 = d1 - sigmaSqrtT;

        double dfR = Math.exp(-riskFreeRate * timeToMaturity);
        if (type == GeneralizedBlackScholes.OptionType.CALL) {
            return cashPayout * dfR * NormalDist.cdf(d2);
        } else {
            return cashPayout * dfR * NormalDist.cdf(-d2);
        }
    }

    /**
     * Asset-or-Nothing option: pays the asset itself (S_T) if in-the-money at maturity.
     * Call: S0 * exp((b - r) * T) * N(d1)
     * Put:  S0 * exp((b - r) * T) * N(-d1)
     */
    public static double priceAssetOrNothing(
            GeneralizedBlackScholes.OptionType type,
            double spot,
            double strike,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        if (timeToMaturity <= 0.0) {
            boolean itm = (type == GeneralizedBlackScholes.OptionType.CALL) ? spot > strike : spot < strike;
            return itm ? spot : 0.0;
        }

        double sqrtT = Math.sqrt(timeToMaturity);
        double sigmaSqrtT = volatility * sqrtT;
        double d1 = (Math.log(spot / strike) + (costOfCarry + 0.5 * volatility * volatility) * timeToMaturity) / sigmaSqrtT;

        double dfCarry = Math.exp((costOfCarry - riskFreeRate) * timeToMaturity);
        if (type == GeneralizedBlackScholes.OptionType.CALL) {
            return spot * dfCarry * NormalDist.cdf(d1);
        } else {
            return spot * dfCarry * NormalDist.cdf(-d1);
        }
    }

    /**
     * Gap Option: pays (S_T - strikePayoff) if S_T > strikeTrigger (for Call).
     */
    public static double priceGapOption(
            GeneralizedBlackScholes.OptionType type,
            double spot,
            double strikePayoff,
            double strikeTrigger,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        if (timeToMaturity <= 0.0) {
            boolean itm = (type == GeneralizedBlackScholes.OptionType.CALL) ? spot > strikeTrigger : spot < strikeTrigger;
            return itm ? (type == GeneralizedBlackScholes.OptionType.CALL ? (spot - strikePayoff) : (strikePayoff - spot)) : 0.0;
        }

        double sqrtT = Math.sqrt(timeToMaturity);
        double sigmaSqrtT = volatility * sqrtT;
        double d1 = (Math.log(spot / strikeTrigger) + (costOfCarry + 0.5 * volatility * volatility) * timeToMaturity) / sigmaSqrtT;
        double d2 = d1 - sigmaSqrtT;

        double dfCarry = Math.exp((costOfCarry - riskFreeRate) * timeToMaturity);
        double dfR = Math.exp(-riskFreeRate * timeToMaturity);

        if (type == GeneralizedBlackScholes.OptionType.CALL) {
            return spot * dfCarry * NormalDist.cdf(d1) - strikePayoff * dfR * NormalDist.cdf(d2);
        } else {
            return strikePayoff * dfR * NormalDist.cdf(-d2) - spot * dfCarry * NormalDist.cdf(-d1);
        }
    }
}

