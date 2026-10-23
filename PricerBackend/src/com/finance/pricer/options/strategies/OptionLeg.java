package com.finance.pricer.options.strategies;

import com.finance.pricer.options.vanilla.GeneralizedBlackScholes;

import java.util.Objects;

/**
 * Representation of a single leg in a multi-leg option structure.
 */
public record OptionLeg(
        GeneralizedBlackScholes.OptionType type,
        int quantity,       // positive for long, negative for short
        double strike,
        double timeToMaturity,
        double premium      // per-unit option premium
) {
    public OptionLeg {
        Objects.requireNonNull(type, "type cannot be null");
        if (strike <= 0.0) throw new IllegalArgumentException("strike must be positive");
    }

    /**
     * Intrinsic payoff of this leg at terminal spot price S_T:
     * quantity * max(0, S_T - K) for Call
     * quantity * max(0, K - S_T) for Put
     */
    public double payoffAt(double terminalSpot) {
        double intrinsic = (type == GeneralizedBlackScholes.OptionType.CALL)
                ? Math.max(0.0, terminalSpot - strike)
                : Math.max(0.0, strike - terminalSpot);
        return quantity * intrinsic;
    }

    /**
     * Total cost / premium paid to establish this leg (positive for debit, negative for credit).
     */
    public double totalPremiumPaid() {
        return quantity * premium;
    }
}

