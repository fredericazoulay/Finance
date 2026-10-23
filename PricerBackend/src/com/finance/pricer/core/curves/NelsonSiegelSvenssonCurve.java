package com.finance.pricer.core.curves;

import com.finance.pricer.core.calendar.DayCountConvention;

import java.time.LocalDate;
import java.util.Objects;

/**
 * Nelson-Siegel-Svensson 6-parameter curve model widely employed by central banks (ECB, Federal Reserve):
 * y(t) = beta0 + beta1 * ((1 - e^(-t/tau1)) / (t/tau1))
 *              + beta2 * (((1 - e^(-t/tau1)) / (t/tau1)) - e^(-t/tau1))
 *              + beta3 * (((1 - e^(-t/tau2)) / (t/tau2)) - e^(-t/tau2))
 */
public class NelsonSiegelSvenssonCurve implements YieldCurve {

    private final LocalDate referenceDate;
    private final DayCountConvention dayCount;
    private final double beta0;
    private final double beta1;
    private final double beta2;
    private final double beta3;
    private final double tau1;
    private final double tau2;

    public NelsonSiegelSvenssonCurve(
            LocalDate referenceDate,
            DayCountConvention dayCount,
            double beta0,
            double beta1,
            double beta2,
            double beta3,
            double tau1,
            double tau2) {

        if (tau1 <= 0.0 || tau2 <= 0.0) {
            throw new IllegalArgumentException("tau1 and tau2 must be strictly positive");
        }
        this.referenceDate = Objects.requireNonNull(referenceDate, "referenceDate cannot be null");
        this.dayCount = Objects.requireNonNull(dayCount, "dayCount cannot be null");
        this.beta0 = beta0;
        this.beta1 = beta1;
        this.beta2 = beta2;
        this.beta3 = beta3;
        this.tau1 = tau1;
        this.tau2 = tau2;
    }

    public static NelsonSiegelSvenssonCurve nelsonSiegel(
            LocalDate referenceDate,
            DayCountConvention dayCount,
            double beta0,
            double beta1,
            double beta2,
            double tau1) {
        return new NelsonSiegelSvenssonCurve(referenceDate, dayCount, beta0, beta1, beta2, 0.0, tau1, 1.0);
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
        if (t <= 1e-8) {
            return beta0 + beta1;
        }

        double x1 = t / tau1;
        double exp1 = Math.exp(-x1);
        double f1 = (1.0 - exp1) / x1;
        double f2 = f1 - exp1;

        double term3 = 0.0;
        if (Math.abs(beta3) > 1e-12) {
            double x2 = t / tau2;
            double exp2 = Math.exp(-x2);
            double f3 = (1.0 - exp2) / x2;
            term3 = beta3 * (f3 - exp2);
        }

        return beta0 + beta1 * f1 + beta2 * f2 + term3;
    }

    @Override
    public double discountFactor(double t) {
        if (t <= 0.0) return 1.0;
        double r = zeroRate(t);
        return Math.exp(-r * t);
    }
}

