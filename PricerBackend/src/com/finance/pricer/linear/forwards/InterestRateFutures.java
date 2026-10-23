package com.finance.pricer.linear.forwards;

//import java.time.LocalDate;

/**
 * Money Market Interest Rate Futures (SOFR 3M, Euribor 3M, Eurodollar) analytics
 * including the famous Convexity Adjustment (Hull Chapter 6, Section 6.3).
 *
 * Formula:
 * Forward Rate = Futures Rate - 0.5 * sigma^2 * T1 * T2
 * Futures Price = 100 - (Futures Rate * 100)
 */
public class InterestRateFutures {

    /**
     * Compute the convexity adjustment between a futures rate and a forward rate:
     * Convexity Adjustment = 0.5 * sigma^2 * T1 * T2
     *
     * @param volatility annual volatility of the interest rate (sigma)
     * @param t1 maturity of the futures contract in years
     * @param t2 maturity of the underlying rate (e.g., T1 + 0.25 for 3M rate)
     * @return convexity adjustment (in decimal, e.g., 0.0005 for 5 bps)
     */
    public static double convexityAdjustment(double volatility, double t1, double t2) {
        return 0.5 * volatility * volatility * t1 * t2;
    }

    /**
     * Converts a quoted futures price (e.g., 96.50) to the implied futures rate:
     * Futures Rate = (100 - Futures Price) / 100
     */
    public static double futuresPriceToRate(double futuresPrice) {
        return (100.0 - futuresPrice) / 100.0;
    }

    /**
     * Converts an interest rate to the futures quote price:
     * Futures Price = 100 - (Futures Rate * 100)
     */
    public static double rateToFuturesPrice(double rate) {
        return 100.0 * (1.0 - rate);
    }

    /**
     * Obtains the forward rate from the quoted futures price with convexity adjustment:
     * Forward Rate = Futures Rate - Convexity Adjustment
     */
    public static double forwardRateFromFutures(double futuresPrice, double volatility, double t1, double t2) {
        double futuresRate = futuresPriceToRate(futuresPrice);
        double adj = convexityAdjustment(volatility, t1, t2);
        return futuresRate - adj;
    }
}

