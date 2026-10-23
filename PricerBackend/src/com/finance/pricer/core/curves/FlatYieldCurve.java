package com.finance.pricer.core.curves;

import com.finance.pricer.core.calendar.DayCountConvention;

import java.time.LocalDate;
import java.util.Objects;

/**
 * Constant flat yield curve r(t) = r_flat for all t.
 * Useful for textbook models (Black-Scholes, simple bond pricing).
 */
public class FlatYieldCurve implements YieldCurve {

    private final LocalDate referenceDate;
    private final DayCountConvention dayCount;
    private final double flatRate;

    public FlatYieldCurve(LocalDate referenceDate, DayCountConvention dayCount, double flatRate) {
        this.referenceDate = Objects.requireNonNull(referenceDate, "referenceDate cannot be null");
        this.dayCount = Objects.requireNonNull(dayCount, "dayCount cannot be null");
        this.flatRate = flatRate;
    }

    public FlatYieldCurve(double flatRate) {
        this(LocalDate.now(), DayCountConvention.ACT_365F, flatRate);
    }

    @Override
    public LocalDate getReferenceDate() {
        return referenceDate;
    }

    @Override
    public DayCountConvention getDayCountConvention() {
        return dayCount;
    }

    @Override
    public double discountFactor(double t) {
        if (t <= 0.0) return 1.0;
        return Math.exp(-flatRate * t);
    }

    @Override
    public double zeroRate(double t) {
        return flatRate;
    }

    @Override
    public double forwardRateContinuous(double t1, double t2) {
        return flatRate;
    }

    @Override
    public double forwardRateSimple(double t1, double t2) {
        double dt = t2 - t1;
        if (Math.abs(dt) < 1e-8) return flatRate;
        return (Math.exp(flatRate * dt) - 1.0) / dt;
    }
}

