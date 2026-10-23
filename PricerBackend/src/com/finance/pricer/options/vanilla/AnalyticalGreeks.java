package com.finance.pricer.options.vanilla;

import com.finance.pricer.core.math.NormalDist;

/**
 * Analytical First, Second, and Third Order Greeks engine
 * based on Generalized Black-Scholes-Merton (Hull Chapter 17 & 19).
 */
public final class AnalyticalGreeks {

    private AnalyticalGreeks() { }

    public record GreeksResult(
            double price,
            double delta,
            double gamma,
            double thetaAnnual,
            double thetaDaily,
            double vega,
            double rho,
            double rhoForeign,
            double vanna,
            double volga,
            double speed,
            double charm
    ) {}

    public static GreeksResult calculate(
            GeneralizedBlackScholes.OptionType type,
            double spot,
            double strike,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        double price = GeneralizedBlackScholes.price(type, spot, strike, timeToMaturity, riskFreeRate, costOfCarry, volatility);

        if (timeToMaturity <= 1e-8 || volatility <= 1e-8) {
            double delta = 0.0;
            if (type == GeneralizedBlackScholes.OptionType.CALL) {
                delta = spot > strike ? 1.0 : (spot == strike ? 0.5 : 0.0);
            } else {
                delta = spot < strike ? -1.0 : (spot == strike ? -0.5 : 0.0);
            }
            return new GreeksResult(price, delta, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        }

        double sqrtT = Math.sqrt(timeToMaturity);
        double sigmaSqrtT = volatility * sqrtT;
        double d1 = (Math.log(spot / strike) + (costOfCarry + 0.5 * volatility * volatility) * timeToMaturity) / sigmaSqrtT;
        double d2 = d1 - sigmaSqrtT;

        double nd1 = NormalDist.pdf(d1);
        double Nd1 = NormalDist.cdf(d1);
        double Nd2 = NormalDist.cdf(d2);
        double NMinusD1 = NormalDist.cdf(-d1);
        double NMinusD2 = NormalDist.cdf(-d2);

        double dfCarry = Math.exp((costOfCarry - riskFreeRate) * timeToMaturity);
        double dfR = Math.exp(-riskFreeRate * timeToMaturity);

        // 1st order Greeks
        double delta;
        if (type == GeneralizedBlackScholes.OptionType.CALL) {
            delta = dfCarry * Nd1;
        } else {
            delta = -dfCarry * NMinusD1;
        }

        double gamma = (dfCarry * nd1) / (spot * sigmaSqrtT);
        double vega = spot * dfCarry * sqrtT * nd1;

        double thetaAnnual;
        double term1 = -(spot * dfCarry * nd1 * volatility) / (2.0 * sqrtT);
        if (type == GeneralizedBlackScholes.OptionType.CALL) {
            thetaAnnual = term1 - (costOfCarry - riskFreeRate) * spot * dfCarry * Nd1 - riskFreeRate * strike * dfR * Nd2;
        } else {
            thetaAnnual = term1 + (costOfCarry - riskFreeRate) * spot * dfCarry * NMinusD1 + riskFreeRate * strike * dfR * NMinusD2;
        }
        double thetaDaily = thetaAnnual / 365.0;

        double rho;
        double rhoForeign;
        if (type == GeneralizedBlackScholes.OptionType.CALL) {
            rho = strike * timeToMaturity * dfR * Nd2;
            rhoForeign = -timeToMaturity * spot * dfCarry * Nd1;
        } else {
            rho = -strike * timeToMaturity * dfR * NMinusD2;
            rhoForeign = timeToMaturity * spot * dfCarry * NMinusD1;
        }

        // 2nd order Greeks
        // Vanna: d(Delta)/d(vol) = d(Vega)/d(Spot)
        double vanna = -dfCarry * nd1 * d2 / volatility;

        // Volga / Vomma: d(Vega)/d(vol) = Vega * d1 * d2 / vol
        double volga = vega * d1 * d2 / volatility;

        // 3rd order Greeks
        // Speed: d(Gamma)/d(Spot) = -(Gamma / Spot) * (d1 / (vol * sqrtT) + 1)
        double speed = -(gamma / spot) * (d1 / sigmaSqrtT + 1.0);

        // Charm: -d(Delta)/dt
        double charm;
        if (type == GeneralizedBlackScholes.OptionType.CALL) {
            charm = (costOfCarry - riskFreeRate) * delta - dfCarry * nd1 * ((costOfCarry / sigmaSqrtT) - (d2 / (2.0 * timeToMaturity)));
        } else {
            charm = (costOfCarry - riskFreeRate) * delta + dfCarry * nd1 * ((costOfCarry / sigmaSqrtT) - (d2 / (2.0 * timeToMaturity)));
        }

        return new GreeksResult(price, delta, gamma, thetaAnnual, thetaDaily, vega, rho, rhoForeign, vanna, volga, speed, charm);
    }
}

