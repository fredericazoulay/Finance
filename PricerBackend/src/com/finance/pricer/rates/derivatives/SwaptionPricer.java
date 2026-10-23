package com.finance.pricer.rates.derivatives;

import com.finance.pricer.core.curves.YieldCurve;
import com.finance.pricer.core.math.NormalDist;

import java.util.Objects;
import java.util.Set;

/**
 * European and Bermudan Swaption pricing engine (Hull Chapter 26 & 28).
 * European Swaptions are priced analytically via Black-76 on forward swap rates.
 * Bermudan Swaptions are priced via a 1-Factor Hull-White short rate trinomial tree.
 */
public class SwaptionPricer {

    public enum SwaptionType {
        PAYER,    // Option to enter into a swap paying fixed, receiving floating
        RECEIVER  // Option to enter into a swap receiving fixed, paying floating
    }

    public record EuropeanSwaptionResult(
            double price,
            double forwardSwapRate,
            double swapAnnuity, // PVBP / A
            double d1,
            double d2
    ) {}

    /**
     * Analytical pricing of a European Swaption using Black-76 (Hull Chapter 26, Section 26.3).
     */
    public static EuropeanSwaptionResult priceEuropeanBlack76(
            SwaptionType type,
            double notional,
            double strikeRate,
            double optionMaturity,
            double swapTenor,
            int swapPaymentFrequency,
            YieldCurve yieldCurve,
            double volatility) {

        Objects.requireNonNull(type, "type cannot be null");
        Objects.requireNonNull(yieldCurve, "yieldCurve cannot be null");

        double t0 = optionMaturity;
        double tn = optionMaturity + swapTenor;
        int numPayments = (int) Math.round(swapTenor * swapPaymentFrequency);
        double tau = 1.0 / swapPaymentFrequency;

        // Compute swap annuity A = sum_{i=1}^n tau * P(0, T_i)
        double annuity = 0.0;
        for (int i = 1; i <= numPayments; i++) {
            double ti = t0 + i * tau;
            annuity += tau * yieldCurve.discountFactor(ti);
        }

        // Forward swap rate s0 = (P(0, T0) - P(0, Tn)) / A
        double pT0 = yieldCurve.discountFactor(t0);
        double pTn = yieldCurve.discountFactor(tn);
        double forwardSwapRate = (pT0 - pTn) / annuity;

        if (volatility <= 1e-8 || t0 <= 1e-8) {
            double intrinsic = (type == SwaptionType.PAYER)
                    ? Math.max(0.0, forwardSwapRate - strikeRate)
                    : Math.max(0.0, strikeRate - forwardSwapRate);
            return new EuropeanSwaptionResult(notional * annuity * intrinsic, forwardSwapRate, annuity, 0, 0);
        }

        double sqrtT = Math.sqrt(t0);
        double sigmaSqrtT = volatility * sqrtT;
        double d1 = (Math.log(forwardSwapRate / strikeRate) + 0.5 * volatility * volatility * t0) / sigmaSqrtT;
        double d2 = d1 - sigmaSqrtT;

        double price;
        if (type == SwaptionType.PAYER) {
            price = notional * annuity * (forwardSwapRate * NormalDist.cdf(d1) - strikeRate * NormalDist.cdf(d2));
        } else {
            price = notional * annuity * (strikeRate * NormalDist.cdf(-d2) - forwardSwapRate * NormalDist.cdf(-d1));
        }

        return new EuropeanSwaptionResult(price, forwardSwapRate, annuity, d1, d2);
    }

    /**
     * Prices a Bermudan Swaption using a 1-Factor Hull-White short rate trinomial tree:
     * dr = (theta(t) - a * r) dt + sigma * dW
     */
    public static double priceBermudanHullWhite(
            SwaptionType type,
            double notional,
            double strikeRate,
            double optionMaturity,
            double swapTenor,
            int paymentFrequency,
            double flatRate,
            double meanReversion,
            double volatility,
            int treeSteps,
            Set<Double> exerciseDates) {

        double totalTime = optionMaturity + swapTenor;
        double dt = totalTime / treeSteps;
        double tau = 1.0 / paymentFrequency;

        // Trinomial tree spacing: delta_r = sigma * sqrt(3 * dt)
        double dr = volatility * Math.sqrt(3.0 * dt);
        int maxJ = (int) Math.ceil(0.184 / (meanReversion * dt));
        maxJ = Math.max(maxJ, 8);
        maxJ = Math.min(maxJ, 50);

        int nodes = 2 * maxJ + 1;
        double[] values = new double[nodes];

        // Terminal values are 0 at totalTime
        for (int step = treeSteps - 1; step >= 0; step--) {
            double currentTime = step * dt;
            double[] nextValues = new double[nodes];

            for (int j = -maxJ; j <= maxJ; j++) {
                int nodeIdx = j + maxJ;
                double rNode = flatRate + j * dr;
                double df = Math.exp(-rNode * dt);

                double continuation;

                if (j == maxJ) {
                    // Top boundary: branches to j, j-1, j-2
                    double pu = 7.0 / 6.0 + 0.5 * (j * j * meanReversion * meanReversion * dt * dt - 3.0 * j * meanReversion * dt);
                    double pm = -1.0 / 3.0 - j * j * meanReversion * meanReversion * dt * dt + 2.0 * j * meanReversion * dt;
                    double pd = 1.0 / 6.0 + 0.5 * (j * j * meanReversion * meanReversion * dt * dt - j * meanReversion * dt);
                    pu = Math.max(0.0, Math.min(1.0, pu));
                    pm = Math.max(0.0, Math.min(1.0, pm));
                    pd = Math.max(0.0, Math.min(1.0, pd));
                    double norm = pu + pm + pd;
                    continuation = df * (pu * values[nodeIdx] + pm * values[nodeIdx - 1] + pd * values[nodeIdx - 2]) / norm;
                } else if (j == -maxJ) {
                    // Bottom boundary: branches to j+2, j+1, j
                    double pu = 1.0 / 6.0 + 0.5 * (j * j * meanReversion * meanReversion * dt * dt + j * meanReversion * dt);
                    double pm = -1.0 / 3.0 - j * j * meanReversion * meanReversion * dt * dt - 2.0 * j * meanReversion * dt;
                    double pd = 7.0 / 6.0 + 0.5 * (j * j * meanReversion * meanReversion * dt * dt + 3.0 * j * meanReversion * dt);
                    pu = Math.max(0.0, Math.min(1.0, pu));
                    pm = Math.max(0.0, Math.min(1.0, pm));
                    pd = Math.max(0.0, Math.min(1.0, pd));
                    double norm = pu + pm + pd;
                    continuation = df * (pu * values[nodeIdx + 2] + pm * values[nodeIdx + 1] + pd * values[nodeIdx]) / norm;
                } else {
                    // Standard branching: branches to j+1, j, j-1
                    double eta = j * meanReversion * dt;
                    double pu = 1.0 / 6.0 + 0.5 * (eta * eta - eta);
                    double pm = 2.0 / 3.0 - eta * eta;
                    double pd = 1.0 / 6.0 + 0.5 * (eta * eta + eta);
                    pu = Math.max(0.0, Math.min(1.0, pu));
                    pm = Math.max(0.0, Math.min(1.0, pm));
                    pd = Math.max(0.0, Math.min(1.0, pd));
                    double norm = pu + pm + pd;
                    continuation = df * (pu * values[nodeIdx + 1] + pm * values[nodeIdx] + pd * values[nodeIdx - 1]) / norm;
                }

                // Check Bermudan early exercise
                boolean isExerciseDate = false;
                if (exerciseDates != null) {
                    for (double exDate : exerciseDates) {
                        if (Math.abs(currentTime - exDate) < dt * 0.51) {
                            isExerciseDate = true;
                            break;
                        }
                    }
                } else if (currentTime >= optionMaturity - 1e-4) {
                    isExerciseDate = true;
                }

                double remainingTenor = totalTime - currentTime;
                int remainingPayments = (int) Math.round(remainingTenor / tau);

                if (isExerciseDate && currentTime >= optionMaturity - 1e-4 && remainingPayments > 0 && remainingTenor > 1e-4) {
                    double swapAnnuity = 0.0;
                    for (int p = 1; p <= remainingPayments; p++) {
                        swapAnnuity += tau * Math.exp(-rNode * p * tau);
                    }
                    if (swapAnnuity > 1e-8) {
                        double swapRate = (1.0 - Math.exp(-rNode * remainingTenor)) / swapAnnuity;
                        double swapValue = (type == SwaptionType.PAYER)
                                ? notional * swapAnnuity * Math.max(0.0, swapRate - strikeRate)
                                : notional * swapAnnuity * Math.max(0.0, strikeRate - swapRate);

                        nextValues[nodeIdx] = Math.max(continuation, swapValue);
                    } else {
                        nextValues[nodeIdx] = continuation;
                    }
                } else {
                    nextValues[nodeIdx] = continuation;
                }
            }
            values = nextValues;
        }

        return values[maxJ];
    }
}

