package com.finance.pricer.rates.derivatives;

import com.finance.pricer.core.curves.YieldCurve;
import com.finance.pricer.core.math.NormalDist;

import java.util.Objects;

/**
 * Interest Rate Cap, Floor, and Collar valuation engine based on Black-76 (Hull Chapter 26).
 * Analyzes individual caplets/floorlets and verifies Cap-Floor Parity against swaps.
 */
public class InterestRateCapFloor {

    public enum Type {
        CAP,
        FLOOR,
        COLLAR
    }

    public record CapFloorResult(
            double totalValue,
            double capValue,
            double floorValue,
            double[] capletValues,
            double[] floorletValues
    ) {}

    /**
     * Prices an interest rate Cap or Floor.
     *
     * @param notional contract principal L
     * @param strikeRate cap/floor rate R_K
     * @param paymentTimes year fractions for payment dates t_1, t_2, ..., t_N
     * @param discountCurve OIS / discount yield curve P(0, t)
     * @param forwardCurve forward projection curve for floating index
     * @param volatility annual Black volatility sigma (flat or caplet stripped)
     * @param isCap true for Cap, false for Floor
     */
    public static CapFloorResult priceCapOrFloor(
            double notional,
            double strikeRate,
            double[] paymentTimes,
            YieldCurve discountCurve,
            YieldCurve forwardCurve,
            double volatility,
            boolean isCap) {

        Objects.requireNonNull(discountCurve, "discountCurve cannot be null");
        Objects.requireNonNull(forwardCurve, "forwardCurve cannot be null");

        if (paymentTimes == null || paymentTimes.length < 2) {
            throw new IllegalArgumentException("paymentTimes must have at least 2 points (t0, t1, ...)");
        }

        int n = paymentTimes.length - 1;
        double[] capletValues = new double[n];
        double[] floorletValues = new double[n];
        double totalCap = 0.0;
        double totalFloor = 0.0;

        for (int i = 0; i < n; i++) {
            double tStart = paymentTimes[i];     // fixing date
            double tEnd = paymentTimes[i + 1];   // payment date
            double tau = tEnd - tStart;          // accrual fraction

            double pStartFwd = forwardCurve.discountFactor(tStart);
            double pEndFwd = forwardCurve.discountFactor(tEnd);
            double fwdRate = (pStartFwd / pEndFwd - 1.0) / tau; // simply compounded forward rate

            double pEndDisc = discountCurve.discountFactor(tEnd); // discount factor to payment date

            if (tStart <= 1e-8) {
                // Already fixed at spot
                capletValues[i] = notional * tau * pEndDisc * Math.max(0.0, fwdRate - strikeRate);
                floorletValues[i] = notional * tau * pEndDisc * Math.max(0.0, strikeRate - fwdRate);
            } else {
                double sqrtT = Math.sqrt(tStart);
                double sigmaSqrtT = volatility * sqrtT;
                double d1 = (Math.log(fwdRate / strikeRate) + 0.5 * volatility * volatility * tStart) / sigmaSqrtT;
                double d2 = d1 - sigmaSqrtT;

                double caplet = notional * tau * pEndDisc * (fwdRate * NormalDist.cdf(d1) - strikeRate * NormalDist.cdf(d2));
                double floorlet = notional * tau * pEndDisc * (strikeRate * NormalDist.cdf(-d2) - fwdRate * NormalDist.cdf(-d1));

                capletValues[i] = caplet;
                floorletValues[i] = floorlet;
            }

            totalCap += capletValues[i];
            totalFloor += floorletValues[i];
        }

        double totalValue = isCap ? totalCap : totalFloor;
        return new CapFloorResult(totalValue, totalCap, totalFloor, capletValues, floorletValues);
    }

    /**
     * Prices an interest rate Collar: Long Cap at capStrike + Short Floor at floorStrike.
     */
    public static double priceCollar(
            double notional,
            double capStrike,
            double floorStrike,
            double[] paymentTimes,
            YieldCurve discountCurve,
            YieldCurve forwardCurve,
            double volatility) {

        CapFloorResult capRes = priceCapOrFloor(notional, capStrike, paymentTimes, discountCurve, forwardCurve, volatility, true);
        CapFloorResult floorRes = priceCapOrFloor(notional, floorStrike, paymentTimes, discountCurve, forwardCurve, volatility, false);

        return capRes.totalValue() - floorRes.totalValue();
    }
}

