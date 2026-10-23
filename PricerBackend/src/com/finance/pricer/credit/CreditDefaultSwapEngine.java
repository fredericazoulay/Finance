package com.finance.pricer.credit;

import com.finance.pricer.core.curves.YieldCurve;
import com.finance.pricer.core.math.BrentSolver;

import java.util.Arrays;
import java.util.Objects;

/**
 * Enterprise-grade Credit Default Swap (CDS) pricing, hazard rate bootstrapping,
 * and risk sensitivity engine as specified in John C. Hull (Chapter 23).
 */
public class CreditDefaultSwapEngine {

    public record CdsPricingResult(
            double parSpreadBps,
            double presentValue,
            double defaultLegPv,
            double premiumLegPv,
            double accrualOnDefaultPv,
            double cs01, // PV change for 1 bp increase in CDS spread
            double[] survivalProbabilities
    ) {}

    public record HazardRateCurve(
            double[] tenors,
            double[] hazardRates
    ) {
        public double survivalProbability(double t) {
            if (t <= 0.0) return 1.0;
            double cumulativeHazard = 0.0;
            double prevT = 0.0;

            for (int i = 0; i < tenors.length; i++) {
                double segT = tenors[i];
                double lambda = hazardRates[i];
                if (t <= segT) {
                    cumulativeHazard += lambda * (t - prevT);
                    return Math.exp(-cumulativeHazard);
                } else {
                    cumulativeHazard += lambda * (segT - prevT);
                    prevT = segT;
                }
            }

            // Flat extrapolation beyond last tenor
            cumulativeHazard += hazardRates[hazardRates.length - 1] * (t - prevT);
            return Math.exp(-cumulativeHazard);
        }
    }

    /**
     * Prices a single-name CDS contract.
     *
     * @param notional contract principal L
     * @param runningSpread contractual running coupon s (in decimal, e.g. 0.01 for 100 bps)
     * @param recoveryRate assumed recovery rate R (e.g. 0.40 for 40%)
     * @param paymentTenors annual payment fractions (e.g. 0.25, 0.50, ..., 5.0 for quarterly payments)
     * @param discountCurve discount factor curve P(0, t)
     * @param hazardRateCurve calibrated piecewise hazard rate curve
     */
    public static CdsPricingResult priceCds(
            double notional,
            double runningSpread,
            double recoveryRate,
            double[] paymentTenors,
            YieldCurve discountCurve,
            HazardRateCurve hazardRateCurve) {

        Objects.requireNonNull(discountCurve, "discountCurve cannot be null");
        Objects.requireNonNull(hazardRateCurve, "hazardRateCurve cannot be null");

        int n = paymentTenors.length;
        double defaultLeg = 0.0;
        double regularPremiumLegUnitSpread = 0.0;
        double accrualLegUnitSpread = 0.0;
        double[] survProbs = new double[n];

        double prevT = 0.0;
        double prevQ = 1.0;

        for (int i = 0; i < n; i++) {
            double t = paymentTenors[i];
            double tau = t - prevT;
            double q = hazardRateCurve.survivalProbability(t);
            survProbs[i] = q;

            double probDefault = prevQ - q;
            double tMid = 0.5 * (prevT + t);
            double dfMid = discountCurve.discountFactor(tMid);
            double dfPayment = discountCurve.discountFactor(t);

            // Default leg: (1 - R) * L * df_mid * probDefault
            defaultLeg += (1.0 - recoveryRate) * notional * dfMid * probDefault;

            // Premium leg: s * L * tau * df_payment * Q(t)
            regularPremiumLegUnitSpread += notional * tau * dfPayment * q;

            // Accrual of premium on default: s * L * (tau / 2) * df_mid * probDefault
            accrualLegUnitSpread += notional * (tau * 0.5) * dfMid * probDefault;

            prevT = t;
            prevQ = q;
        }

        double totalPremiumLegUnitSpread = regularPremiumLegUnitSpread + accrualLegUnitSpread;
        double parSpread = defaultLeg / totalPremiumLegUnitSpread;
        double actualPremiumLeg = runningSpread * totalPremiumLegUnitSpread;
        double pvBuyer = defaultLeg - actualPremiumLeg;

        // CS01: change in PV for 1 bp increase in spread
        double cs01 = totalPremiumLegUnitSpread * 0.0001;

        return new CdsPricingResult(
                parSpread * 10000.0,
                pvBuyer,
                defaultLeg,
                actualPremiumLeg,
                runningSpread * accrualLegUnitSpread,
                cs01,
                survProbs
        );
    }

    /**
     * Bootstraps piecewise constant hazard rates from market CDS par spreads across standard tenors (e.g. 1Y, 3Y, 5Y, 7Y, 10Y).
     *
     * @param pillarTenors market maturities (e.g. 1.0, 3.0, 5.0, 7.0, 10.0)
     * @param marketSpreadsBps corresponding CDS par spreads in basis points
     * @param recoveryRate standard recovery rate (e.g. 0.40)
     * @param paymentFrequency payment frequency (usually 4 for quarterly)
     * @param discountCurve risk-free discount curve
     * @return calibrated HazardRateCurve
     */
    public static HazardRateCurve bootstrapHazardRates(
            double[] pillarTenors,
            double[] marketSpreadsBps,
            double recoveryRate,
            int paymentFrequency,
            YieldCurve discountCurve) {

        if (pillarTenors.length != marketSpreadsBps.length) {
            throw new IllegalArgumentException("pillarTenors and marketSpreadsBps must have identical length");
        }

        int m = pillarTenors.length;
        double[] hazardRates = new double[m];

        for (int k = 0; k < m; k++) {
            final int pillarIdx = k;
            double targetParSpreadBps = marketSpreadsBps[pillarIdx];
            double tenor = pillarTenors[pillarIdx];

            // Build grid of quarterly payment times up to this pillar
            int numSteps = (int) Math.round(tenor * paymentFrequency);
            double[] paymentTimes = new double[numSteps];
            for (int s = 0; s < numSteps; s++) {
                paymentTimes[s] = (s + 1.0) / paymentFrequency;
            }

            // Initial guess based on rule of thumb: lambda approx s / (1 - R)
            double guessLambda = (targetParSpreadBps / 10000.0) / (1.0 - recoveryRate);

            // Solve for hazardRates[pillarIdx] such that parSpread == targetParSpreadBps
            double solvedLambda = BrentSolver.findRootWithBracket(
                    candidateLambda -> {
                        double[] candidateRates = Arrays.copyOf(hazardRates, pillarIdx + 1);
                        candidateRates[pillarIdx] = candidateLambda;
                        double[] subTenors = Arrays.copyOf(pillarTenors, pillarIdx + 1);
                        HazardRateCurve tempCurve = new HazardRateCurve(subTenors, candidateRates);

                        CdsPricingResult res = priceCds(100.0, targetParSpreadBps / 10000.0, recoveryRate, paymentTimes, discountCurve, tempCurve);
                        return res.parSpreadBps() - targetParSpreadBps;
                    },
                    Math.max(1e-4, guessLambda * 0.5),
                    guessLambda * 1.5,
                    1e-7,
                    1e-7,
                    100
            );

            hazardRates[pillarIdx] = solvedLambda;
        }

        return new HazardRateCurve(pillarTenors, hazardRates);
    }
}

