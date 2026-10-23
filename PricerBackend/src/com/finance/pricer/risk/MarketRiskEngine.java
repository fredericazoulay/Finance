package com.finance.pricer.risk;

import com.finance.pricer.core.math.NormalDist;

import java.util.Arrays;
import java.util.Objects;

/**
 * Enterprise Market Risk Engine (Hull Chapter 21 & 22).
 * Implements Parametric (Variance-Covariance), Historical Simulation, and Monte Carlo
 * Value at Risk (VaR) and Expected Shortfall (CVaR) with Hull-White volatility updating.
 */
public class MarketRiskEngine {

    public record RiskReport(
            double confidenceLevel,
            int horizonDays,
            double parametricVaR,
            double parametricExpectedShortfall,
            double historicalVaR,
            double historicalExpectedShortfall,
            double portfolioValue
    ) {}

    /**
     * Computes Parametric (Variance-Covariance) VaR and Expected Shortfall.
     *
     * @param portfolioValue total portfolio currency value V_p
     * @param weights asset allocation weights w
     * @param dailyCovariance daily covariance matrix Sigma
     * @param confidenceLevel alpha (e.g. 0.99 for 99% or 0.95 for 95%)
     * @param horizonDays risk time horizon in days (e.g. 1 or 10)
     */
    public static double computeParametricVaR(
            double portfolioValue,
            double[] weights,
            double[][] dailyCovariance,
            double confidenceLevel,
            int horizonDays) {

        double dailyVol = computePortfolioDailyVol(weights, dailyCovariance);
        double zAlpha = NormalDist.inverseCdf(confidenceLevel);
        double horizonFactor = Math.sqrt(horizonDays);

        return portfolioValue * zAlpha * dailyVol * horizonFactor;
    }

    /**
     * Computes Parametric Expected Shortfall (CVaR) for normally distributed returns:
     * ES = V_p * [ phi(z_alpha) / (1 - alpha) ] * sigma_daily * sqrt(horizon)
     */
    public static double computeParametricExpectedShortfall(
            double portfolioValue,
            double[] weights,
            double[][] dailyCovariance,
            double confidenceLevel,
            int horizonDays) {

        double dailyVol = computePortfolioDailyVol(weights, dailyCovariance);
        double zAlpha = NormalDist.inverseCdf(confidenceLevel);
        double phiZ = NormalDist.pdf(zAlpha);
        double horizonFactor = Math.sqrt(horizonDays);

        double esMultiplier = phiZ / (1.0 - confidenceLevel);
        return portfolioValue * esMultiplier * dailyVol * horizonFactor;
    }

    /**
     * Computes Historical Simulation VaR and Expected Shortfall from historical P&L observations.
     *
     * @param historicalPnl array of historical daily P&L values (positive = profit, negative = loss)
     * @param confidenceLevel confidence alpha (e.g. 0.99)
     * @param horizonDays time horizon (scaled by sqrt(T))
     * @return double[] { VaR, ExpectedShortfall } (both expressed as positive currency loss amounts)
     */
    public static double[] computeHistoricalVaRAndES(double[] historicalPnl, double confidenceLevel, int horizonDays) {
        if (historicalPnl == null || historicalPnl.length < 10) {
            throw new IllegalArgumentException("historicalPnl must contain at least 10 observations");
        }

        // Convert PnL to losses: Loss = -PnL
        double[] losses = new double[historicalPnl.length];
        for (int i = 0; i < historicalPnl.length; i++) {
            losses[i] = -historicalPnl[i];
        }

        Arrays.sort(losses); // sorted ascending: worst loss is at the end

        int n = losses.length;
        int varIndex = (int) Math.floor(confidenceLevel * n);
        varIndex = Math.min(n - 1, Math.max(0, varIndex));

        double horizonFactor = Math.sqrt(horizonDays);
        double var1Day = Math.max(0.0, losses[varIndex]);
        double varScaled = var1Day * horizonFactor;

        // Expected Shortfall: average of all losses exceeding VaR
        double esSum = 0.0;
        int tailCount = n - varIndex;
        for (int i = varIndex; i < n; i++) {
            esSum += losses[i];
        }
        double es1Day = esSum / tailCount;
        double esScaled = Math.max(varScaled, es1Day * horizonFactor);

        return new double[]{varScaled, esScaled};
    }

    /**
     * Hull-White (1998) Volatility-Updated Historical Returns:
     * r_adj = r_t * (sigma_current / sigma_t)
     */
    public static double[] applyHullWhiteVolatilityUpdating(double[] rawReturns, double currentVol, double[] historicalVols) {
        if (rawReturns.length != historicalVols.length) {
            throw new IllegalArgumentException("Length of rawReturns and historicalVols must match");
        }
        double[] updated = new double[rawReturns.length];
        for (int i = 0; i < rawReturns.length; i++) {
            double ratio = (historicalVols[i] > 1e-8) ? (currentVol / historicalVols[i]) : 1.0;
            updated[i] = rawReturns[i] * ratio;
        }
        return updated;
    }

    private static double computePortfolioDailyVol(double[] weights, double[][] covariance) {
        double var = 0.0;
        int n = weights.length;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                var += weights[i] * weights[j] * covariance[i][j];
            }
        }
        return Math.sqrt(Math.max(0.0, var));
    }
}

