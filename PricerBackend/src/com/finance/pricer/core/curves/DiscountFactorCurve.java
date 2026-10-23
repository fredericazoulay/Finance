package com.finance.pricer.core.curves;

import com.finance.pricer.core.calendar.DayCountConvention;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Objects;

/**
 * Yield curve specified via discount factors P(0, t_i) at pillar maturities.
 * Defaults to LogLinear interpolation to maintain positive discount factors and piecewise constant forward rates.
 */
public class DiscountFactorCurve implements YieldCurve {

    private final LocalDate referenceDate;
    private final DayCountConvention dayCount;
    private final double[] times;
    private final double[] discountFactors;
    private final CurveInterpolator interpolator;

    public DiscountFactorCurve(
            LocalDate referenceDate,
            DayCountConvention dayCount,
            double[] times,
            double[] discountFactors,
            CurveInterpolator interpolator) {

        this.referenceDate = Objects.requireNonNull(referenceDate, "referenceDate cannot be null");
        this.dayCount = Objects.requireNonNull(dayCount, "dayCount cannot be null");
        this.interpolator = interpolator != null ? interpolator : new CurveInterpolator.LogLinear();

        if (times == null || discountFactors == null || times.length != discountFactors.length || times.length < 1) {
            throw new IllegalArgumentException("times and discountFactors must be non-null and equal length >= 1");
        }

        // Ensure t=0 is included with P(0)=1
        if (times[0] > 1e-8) {
            this.times = new double[times.length + 1];
            this.discountFactors = new double[discountFactors.length + 1];
            this.times[0] = 0.0;
            this.discountFactors[0] = 1.0;
            System.arraycopy(times, 0, this.times, 1, times.length);
            System.arraycopy(discountFactors, 0, this.discountFactors, 1, discountFactors.length);
        } else {
            this.times = Arrays.copyOf(times, times.length);
            this.discountFactors = Arrays.copyOf(discountFactors, discountFactors.length);
            this.discountFactors[0] = 1.0;
        }

        // Validate strictly increasing times and strictly positive discount factors
        for (int i = 1; i < this.times.length; i++) {
            if (this.times[i] <= this.times[i - 1]) {
                throw new IllegalArgumentException("Maturities times must be strictly increasing: " + this.times[i] + " <= " + this.times[i - 1]);
            }
            if (this.discountFactors[i] <= 0.0) {
                throw new IllegalArgumentException("Discount factors must be strictly positive: " + this.discountFactors[i]);
            }
        }
    }

    public DiscountFactorCurve(LocalDate referenceDate, DayCountConvention dayCount, double[] times, double[] discountFactors) {
        this(referenceDate, dayCount, times, discountFactors, new CurveInterpolator.LogLinear());
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
        return interpolator.interpolate(times, discountFactors, t);
    }
}

