package com.finance.pricer.core.curves;

import com.finance.pricer.core.calendar.DayCountConvention;

import java.time.LocalDate;

/**
 * Universal Yield Curve interface supporting modern Multi-Curve interest rate pricing
 * (OIS / SOFR / ESTR discounting vs IBOR / Euribor / SOFR Term forward projection).
 * Formulations adhere to John C. Hull (Chapters 4, 6 & 7).
 */
public interface YieldCurve {

    /**
     * Curve reference (anchor / spot) date.
     */
    LocalDate getReferenceDate();

    /**
     * Day count convention used to convert dates to year fractions.
     */
    DayCountConvention getDayCountConvention();

    /**
     * Discount factor P(0, t) for a year fraction t >= 0.
     * P(0, t) satisfies P(0, 0) = 1 and represents the present value of 1 currency unit paid at time t.
     */
    double discountFactor(double t);

    /**
     * Discount factor P(0, date) from reference date to settlement date.
     */
    default double discountFactor(LocalDate date) {
        if (date.isBefore(getReferenceDate())) {
            throw new IllegalArgumentException("Target date " + date + " is before reference date " + getReferenceDate());
        }
        double t = getDayCountConvention().yearFraction(getReferenceDate(), date);
        return discountFactor(t);
    }

    /**
     * Continuously compounded zero rate r(t) such that P(0, t) = exp(-r(t) * t).
     */
    default double zeroRate(double t) {
        if (t <= 1e-8) {
            // Forward limit as t -> 0
            double dt = 1e-4;
            return -Math.log(discountFactor(dt)) / dt;
        }
        return -Math.log(discountFactor(t)) / t;
    }

    /**
     * Continuously compounded zero rate for a specific future date.
     */
    default double zeroRate(LocalDate date) {
        double t = getDayCountConvention().yearFraction(getReferenceDate(), date);
        return zeroRate(t);
    }

    /**
     * Continuously compounded instantaneous or interval forward rate between t1 and t2:
     * f(t1, t2) = (ln(P(t1)) - ln(P(t2))) / (t2 - t1).
     */
    default double forwardRateContinuous(double t1, double t2) {
        if (Math.abs(t2 - t1) < 1e-8) {
            double dt = 1e-4;
            return (Math.log(discountFactor(Math.max(0, t1 - dt / 2))) - Math.log(discountFactor(t1 + dt / 2))) / dt;
        }
        return Math.log(discountFactor(t1) / discountFactor(t2)) / (t2 - t1);
    }

    /**
     * Simply compounded forward rate (money market convention) between t1 and t2:
     * F(t1, t2) = (P(t1) / P(t2) - 1) / (t2 - t1).
     */
    default double forwardRateSimple(double t1, double t2) {
        double dt = t2 - t1;
        if (Math.abs(dt) < 1e-8) {
            return forwardRateContinuous(t1, t2);
        }
        return (discountFactor(t1) / discountFactor(t2) - 1.0) / dt;
    }

    /**
     * Simply compounded forward rate between two calendar dates.
     */
    default double forwardRateSimple(LocalDate start, LocalDate end) {
        double t1 = getDayCountConvention().yearFraction(getReferenceDate(), start);
        double t2 = getDayCountConvention().yearFraction(getReferenceDate(), end);
        return forwardRateSimple(t1, t2);
    }
}

