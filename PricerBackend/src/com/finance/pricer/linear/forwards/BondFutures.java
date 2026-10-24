package com.finance.pricer.linear.forwards;

import java.util.List;
//import java.util.Objects;

/**
 * Treasury Bond Futures (CME/CBOT 10-Year T-Note, Ultra 10-Year, 30-Year T-Bond)
 * analytics and Cheapest-to-Deliver (CTD) solver as specified in John C. Hull (Chapter 6, Section 6.4).
 */
public class BondFutures {

    /**
     * Deliverable bond candidate representation.
     */
    public record DeliverableBond(
            String isinOrId,
            double cleanPrice,
            double couponRate,
            double timeToMaturityYears,
            int couponFrequencyPerYear,
            double accruedInterest
    ) {
        public double dirtyPrice() {
            return cleanPrice + accruedInterest;
        }
    }

    /**
     * Result of the Cheapest-to-Deliver (CTD) optimization.
     */
    public record CtdResult(
            DeliverableBond bond,
            double conversionFactor,
            double basisCost,
            double impliedRepoRate
    ) {}

    /**
     * Computes the official CBOT/CME Conversion Factor (CF) for a bond:
     * Defined as the clean price of a $1 face value bond on the 1st day of the delivery month
     * if the bond's yield to maturity is 6.00% per annum compounded semi-annually.
     *
     * @param couponRate annual coupon rate (e.g. 0.08 for 8%)
     * @param remainingYears years to maturity as of the first day of the delivery month
     * @param frequency coupon payment frequency per year (usually 2)
     * @return conversion factor (typically near 1.0)
     */
    public static double computeConversionFactor(double couponRate, double remainingYears, int frequency) {
        double rSemi = 0.06 / frequency; // 6% annual discount rate
        int totalCoupons = (int) Math.round(remainingYears * frequency);
        double c = couponRate / frequency;

        if (totalCoupons <= 0) return 1.0;

        // Present value of annuity coupons + par redemption of 1.0
        // PV = c * [1 - (1+rSemi)^(-N)] / rSemi + 1 / (1+rSemi)^N
        double discountFactorN = Math.pow(1.0 + rSemi, -totalCoupons);
        double pvCoupons = c * (1.0 - discountFactorN) / rSemi;
        double pvRedemption = discountFactorN;

        return pvCoupons + pvRedemption;
    }

    /**
     * Solves for the Cheapest-to-Deliver (CTD) bond from a list of deliverable bonds given the market futures quote.
     *
     * The party with the short position maximizes profit / minimizes delivery cost:
     * Delivery Cost = Clean Price - (Futures Price * Conversion Factor)
     *
     * @param deliverableBonds basket of deliverable bonds
     * @param futuresQuotedPrice current market quoted price of the futures contract
     * @return CTD result containing the optimal deliverable bond and its metrics
     */
    public static CtdResult findCheapestToDeliver(List<DeliverableBond> deliverableBonds, double futuresQuotedPrice) {
        if (deliverableBonds == null || deliverableBonds.isEmpty()) {
            throw new IllegalArgumentException("Deliverable bonds basket cannot be empty");
        }

        DeliverableBond bestBond = null;
        double minCost = Double.POSITIVE_INFINITY;
        double bestCf = 1.0;

        for (DeliverableBond bond : deliverableBonds) {
            double cf = computeConversionFactor(bond.couponRate(), bond.timeToMaturityYears(), bond.couponFrequencyPerYear());
            double deliveryCost = bond.cleanPrice() - (futuresQuotedPrice * cf);

            if (deliveryCost < minCost) {
                minCost = deliveryCost;
                bestBond = bond;
                bestCf = cf;
            }
        }

        return new CtdResult(bestBond, bestCf, minCost, 0.0);
    }

    /**
     * Computes the cash amount paid by the buyer (Invoice Price) upon delivery:
     * Cash Received = (Futures Quote * Conversion Factor) + Accrued Interest
     */
    public static double computeInvoicePrice(double futuresQuote, double conversionFactor, double accruedInterest) {
        return (futuresQuote * conversionFactor) + accruedInterest;
    }

    /**
     * Theoretical Futures Price given the CTD bond and risk-free rate r over time T to delivery:
     * F0 = (1 / CF_CTD) * (S0 - I) * exp(r * T)
     * where I is the PV of any coupons received before delivery.
     */
    public static double theoreticalFuturesPrice(
            DeliverableBond ctdBond,
            double conversionFactor,
            double pvCouponsDuringFutureLife,
            double riskFreeRate,
            double timeToDeliveryYears) {

        double s0 = ctdBond.dirtyPrice();
        double costOfCarryBond = (s0 - pvCouponsDuringFutureLife) * Math.exp(riskFreeRate * timeToDeliveryYears);
        // Quoted futures price is clean
        return costOfCarryBond / conversionFactor;
    }
}

