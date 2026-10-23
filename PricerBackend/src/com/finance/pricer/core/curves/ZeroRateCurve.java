package com.finance.pricer.core.curves;

import com.finance.pricer.core.calendar.DayCountConvention;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Objects;

/**
 * Yield curve defined via continuously compounded zero rates r(t_i) at pillar points.
 * P(0, t) = exp(-r(t) * t).
 */
public class ZeroRateCurve implements YieldCurve {

    private final LocalDate referenceDate;
    private final DayCountConvention dayCount;
    private final double[] times;
    private final double[] zeroRates;
    private final CurveInterpolator interpolator;

    public ZeroRateCurve(
            LocalDate referenceDate,
            DayCountConvention dayCount,
            double[] times,
            double[] zeroRates,
            CurveInterpolator interpolator) {

        this.referenceDate = Objects.requireNonNull(referenceDate, "referenceDate cannot be null");
        this.dayCount = Objects.requireNonNull(dayCount, "dayCount cannot be null");
        this.interpolator = interpolator != null ? interpolator : new CurveInterpolator.Linear();

        if (times == null || zeroRates == null || times.length != zeroRates.length || times.length < 1) {
            throw new IllegalArgumentException("times and zeroRates must be non-null and equal length >= 1");
        }

        if (times[0] > 1e-8) {
            this.times = new double[times.length + 1];
            this.zeroRates = new double[zeroRates.length + 1];
            this.times[0] = 0.0;
            this.zeroRates[0] = zeroRates[0]; // flat back to 0
            System.arraycopy(times, 0, this.times, 1, times.length);
            System.arraycopy(zeroRates, 0, this.zeroRates, 1, zeroRates.length);
        } else {
            this.times = Arrays.copyOf(times, times.length);
            this.zeroRates = Arrays.copyOf(zeroRates, zeroRates.length);
        }

        for (int i = 1; i < this.times.length; i++) {
            if (this.times[i] <= this.times[i - 1]) {
                throw new IllegalArgumentException("Times must be strictly increasing: " + this.times[i] + " <= " + this.times[i - 1]);
            }
        }
    }

    public ZeroRateCurve(LocalDate referenceDate, DayCountConvention dayCount, double[] times, double[] zeroRates) {
        this(referenceDate, dayCount, times, zeroRates, new CurveInterpolator.Linear());
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
    public double zeroRate(double t) {
        if (t <= 0.0) return zeroRates[0];
        return interpolator.interpolate(times, zeroRates, t);
    }

    @Override
    public double discountFactor(double t) {
        if (t <= 0.0) return 1.0;
        double r = zeroRate(t);
        return Math.exp(-r * t);
    }
}

