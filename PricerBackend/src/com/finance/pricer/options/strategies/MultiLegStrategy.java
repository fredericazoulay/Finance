package com.finance.pricer.options.strategies;

import com.finance.pricer.options.vanilla.AnalyticalGreeks;
import com.finance.pricer.options.vanilla.GeneralizedBlackScholes;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

/**
 * Multi-Leg Option Strategy Engine (Hull Chapter 11 - Trading Strategies Involving Options).
 * Computes portfolio payoff profile, net premium, max profit, max loss, breakevens, and aggregate Greeks.
 */
public class MultiLegStrategy {

    public record StrategyProfile(
            String name,
            double netPremium, // positive = debit paid, negative = credit received
            double maxProfit,
            double maxLoss,
            List<Double> breakevenPoints,
            double aggregateDelta,
            double aggregateGamma,
            double aggregateVega,
            double aggregateTheta
    ) {}

    private final String name;
    private final List<OptionLeg> legs;

    public MultiLegStrategy(String name, List<OptionLeg> legs) {
        this.name = Objects.requireNonNull(name, "name cannot be null");
        this.legs = List.copyOf(Objects.requireNonNull(legs, "legs cannot be null"));
        if (legs.isEmpty()) throw new IllegalArgumentException("legs cannot be empty");
    }

    public String getName() { return name; }
    public List<OptionLeg> getLegs() { return legs; }

    /**
     * Net initial premium paid (positive for debit, negative for credit).
     */
    public double netPremium() {
        double net = 0.0;
        for (OptionLeg leg : legs) {
            net += leg.totalPremiumPaid();
        }
        return net;
    }

    /**
     * Total gross payoff of the portfolio at expiration for terminal spot S_T.
     */
    public double grossPayoffAt(double terminalSpot) {
        double payoff = 0.0;
        for (OptionLeg leg : legs) {
            payoff += leg.payoffAt(terminalSpot);
        }
        return payoff;
    }

    /**
     * Net profit / loss at expiration (gross payoff minus net premium paid).
     */
    public double netProfitAt(double terminalSpot) {
        return grossPayoffAt(terminalSpot) - netPremium();
    }

    /**
     * Analyzes and produces complete strategy risk profile across terminal spot range.
     */
    public StrategyProfile analyze(double spot, double riskFreeRate, double volatility) {
        double netPrem = netPremium();

        // Sample terminal spots from 0 to 3 * spot to find min, max, and breakevens
        double minSpot = 0.0;
        double maxSpot = 3.0 * spot;
        int samples = 3000;
        double step = (maxSpot - minSpot) / samples;

        double maxProfit = Double.NEGATIVE_INFINITY;
        double maxLoss = Double.POSITIVE_INFINITY;
        List<Double> breakevens = new ArrayList<>();

        double prevPnl = netProfitAt(minSpot);
        maxProfit = Math.max(maxProfit, prevPnl);
        maxLoss = Math.min(maxLoss, prevPnl);

        for (int i = 1; i <= samples; i++) {
            double s = minSpot + i * step;
            double pnl = netProfitAt(s);
            maxProfit = Math.max(maxProfit, pnl);
            maxLoss = Math.min(maxLoss, pnl);

            if ((prevPnl < 0 && pnl >= 0) || (prevPnl > 0 && pnl <= 0)) {
                // Linear interpolation for breakeven
                double sPrev = s - step;
                double be = sPrev - prevPnl * (s - sPrev) / (pnl - prevPnl);
                breakevens.add(be);
            }
            prevPnl = pnl;
        }

        // Aggregate Greeks
        double aggDelta = 0.0;
        double aggGamma = 0.0;
        double aggVega = 0.0;
        double aggTheta = 0.0;

        for (OptionLeg leg : legs) {
            AnalyticalGreeks.GreeksResult g = AnalyticalGreeks.calculate(
                    leg.type(),
                    spot,
                    leg.strike(),
                    leg.timeToMaturity(),
                    riskFreeRate,
                    riskFreeRate,
                    volatility
            );
            aggDelta += leg.quantity() * g.delta();
            aggGamma += leg.quantity() * g.gamma();
            aggVega += leg.quantity() * g.vega();
            aggTheta += leg.quantity() * g.thetaDaily();
        }

        return new StrategyProfile(name, netPrem, maxProfit, maxLoss, Collections.unmodifiableList(breakevens), aggDelta, aggGamma, aggVega, aggTheta);
    }

    // --- Standard Strategy Factory Methods (Hull Chapter 11) ---

    public static MultiLegStrategy bullCallSpread(double spot, double kLow, double kHigh, double t, double r, double sigma) {
        double pLow = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, spot, kLow, t, r, sigma);
        double pHigh = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, spot, kHigh, t, r, sigma);
        return new MultiLegStrategy("Bull Call Spread", List.of(
                new OptionLeg(GeneralizedBlackScholes.OptionType.CALL, 1, kLow, t, pLow),
                new OptionLeg(GeneralizedBlackScholes.OptionType.CALL, -1, kHigh, t, pHigh)
        ));
    }

    public static MultiLegStrategy bearPutSpread(double spot, double kLow, double kHigh, double t, double r, double sigma) {
        double pLow = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.PUT, spot, kLow, t, r, sigma);
        double pHigh = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.PUT, spot, kHigh, t, r, sigma);
        return new MultiLegStrategy("Bear Put Spread", List.of(
                new OptionLeg(GeneralizedBlackScholes.OptionType.PUT, 1, kHigh, t, pHigh),
                new OptionLeg(GeneralizedBlackScholes.OptionType.PUT, -1, kLow, t, pLow)
        ));
    }

    public static MultiLegStrategy straddle(double spot, double k, double t, double r, double sigma) {
        double pCall = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, spot, k, t, r, sigma);
        double pPut = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.PUT, spot, k, t, r, sigma);
        return new MultiLegStrategy("Straddle", List.of(
                new OptionLeg(GeneralizedBlackScholes.OptionType.CALL, 1, k, t, pCall),
                new OptionLeg(GeneralizedBlackScholes.OptionType.PUT, 1, k, t, pPut)
        ));
    }

    public static MultiLegStrategy strangle(double spot, double kPut, double kCall, double t, double r, double sigma) {
        double pCall = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, spot, kCall, t, r, sigma);
        double pPut = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.PUT, spot, kPut, t, r, sigma);
        return new MultiLegStrategy("Strangle", List.of(
                new OptionLeg(GeneralizedBlackScholes.OptionType.CALL, 1, kCall, t, pCall),
                new OptionLeg(GeneralizedBlackScholes.OptionType.PUT, 1, kPut, t, pPut)
        ));
    }

    public static MultiLegStrategy butterflySpread(double spot, double k1, double k2, double k3, double t, double r, double sigma) {
        double p1 = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, spot, k1, t, r, sigma);
        double p2 = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, spot, k2, t, r, sigma);
        double p3 = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, spot, k3, t, r, sigma);
        return new MultiLegStrategy("Butterfly Spread", List.of(
                new OptionLeg(GeneralizedBlackScholes.OptionType.CALL, 1, k1, t, p1),
                new OptionLeg(GeneralizedBlackScholes.OptionType.CALL, -2, k2, t, p2),
                new OptionLeg(GeneralizedBlackScholes.OptionType.CALL, 1, k3, t, p3)
        ));
    }

    public static MultiLegStrategy ironCondor(double spot, double kPutLong, double kPutShort, double kCallShort, double kCallLong, double t, double r, double sigma) {
        double pPl = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.PUT, spot, kPutLong, t, r, sigma);
        double pPs = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.PUT, spot, kPutShort, t, r, sigma);
        double pCs = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, spot, kCallShort, t, r, sigma);
        double pCl = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, spot, kCallLong, t, r, sigma);

        return new MultiLegStrategy("Iron Condor", List.of(
                new OptionLeg(GeneralizedBlackScholes.OptionType.PUT, 1, kPutLong, t, pPl),
                new OptionLeg(GeneralizedBlackScholes.OptionType.PUT, -1, kPutShort, t, pPs),
                new OptionLeg(GeneralizedBlackScholes.OptionType.CALL, -1, kCallShort, t, pCs),
                new OptionLeg(GeneralizedBlackScholes.OptionType.CALL, 1, kCallLong, t, pCl)
        ));
    }
}

