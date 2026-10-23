package com.finance.pricer.core.calendar;

import java.time.LocalDate;
import java.time.Year;
import java.time.temporal.ChronoUnit;

/**
 * Standard financial day count conventions as described in John C. Hull (Chapters 4 & 6).
 */
public enum DayCountConvention {

    /** Actual/360 (Money market standard: EUR, USD, CHF) */
    ACT_360 {
        @Override
        public double yearFraction(LocalDate start, LocalDate end, ScheduleContext context) {
            return ChronoUnit.DAYS.between(start, end) / 360.0;
        }
    },

    /** Actual/365 Fixed (UK Sterling, CAD, AUD, JPY money market) */
    ACT_365F {
        @Override
        public double yearFraction(LocalDate start, LocalDate end, ScheduleContext context) {
            return ChronoUnit.DAYS.between(start, end) / 365.0;
        }
    },

    /** Actual/Actual ISDA (Splits days between leap years divided by 366 and non-leap years divided by 365) */
    ACT_ACT_ISDA {
        @Override
        public double yearFraction(LocalDate start, LocalDate end, ScheduleContext context) {
            if (start.equals(end)) return 0.0;
            if (start.isAfter(end)) return -yearFraction(end, start, context);

            int startYear = start.getYear();
            int endYear = end.getYear();

            if (startYear == endYear) {
                double daysInYear = Year.isLeap(startYear) ? 366.0 : 365.0;
                return ChronoUnit.DAYS.between(start, end) / daysInYear;
            }

            LocalDate endOfStartYear = LocalDate.of(startYear + 1, 1, 1);
            LocalDate startOfEndYear = LocalDate.of(endYear, 1, 1);

            double firstYearFrac = ChronoUnit.DAYS.between(start, endOfStartYear) / (Year.isLeap(startYear) ? 366.0 : 365.0);
            double lastYearFrac = ChronoUnit.DAYS.between(startOfEndYear, end) / (Year.isLeap(endYear) ? 366.0 : 365.0);
            double intermediateYears = (endYear - startYear - 1);

            return firstYearFrac + intermediateYears + lastYearFrac;
        }
    },

    /** Actual/Actual ICMA (Fixed Income standard for annual/semi-annual bonds) */
    ACT_ACT_ICMA {
        @Override
        public double yearFraction(LocalDate start, LocalDate end, ScheduleContext context) {
            if (start.equals(end)) return 0.0;
            if (start.isAfter(end)) return -yearFraction(end, start, context);

            if (context == null || context.frequency() <= 0) {
                // Fallback to ACT/ACT ISDA if no coupon schedule context is provided
                return ACT_ACT_ISDA.yearFraction(start, end, context);
            }

            int freq = context.frequency();
            LocalDate couponStart = context.couponPeriodStart() != null ? context.couponPeriodStart() : start;
            LocalDate couponEnd = context.couponPeriodEnd() != null ? context.couponPeriodEnd() : end;

            long daysBetween = ChronoUnit.DAYS.between(start, end);
            long daysInCouponPeriod = ChronoUnit.DAYS.between(couponStart, couponEnd);

            if (daysInCouponPeriod <= 0) {
                daysInCouponPeriod = Math.round(365.0 / freq);
            }

            return (double) daysBetween / (freq * daysInCouponPeriod);
        }
    },

    /** 30/360 US (Bond Basis: US Corporate and Municipal bonds) */
    THIRTY_360_US {
        @Override
        public double yearFraction(LocalDate start, LocalDate end, ScheduleContext context) {
            int d1 = start.getDayOfMonth();
            int m1 = start.getMonthValue();
            int y1 = start.getYear();

            int d2 = end.getDayOfMonth();
            int m2 = end.getMonthValue();
            int y2 = end.getYear();

            if (d1 == 31) d1 = 30;
            if (d2 == 31 && d1 == 30) d2 = 30;

            return ((y2 - y1) * 360.0 + (m2 - m1) * 30.0 + (d2 - d1)) / 360.0;
        }
    },

    /** 30E/360 (ISMA / Eurobond basis) */
    THIRTY_E_360 {
        @Override
        public double yearFraction(LocalDate start, LocalDate end, ScheduleContext context) {
            int d1 = Math.min(start.getDayOfMonth(), 30);
            int d2 = Math.min(end.getDayOfMonth(), 30);
            return ((end.getYear() - start.getYear()) * 360.0
                    + (end.getMonthValue() - start.getMonthValue()) * 30.0 + (d2 - d1)) / 360.0;
        }
    },

    /** 30E/360 ISDA */
    THIRTY_E_360_ISDA {
        @Override
        public double yearFraction(LocalDate start, LocalDate end, ScheduleContext context) {
            int d1 = start.getDayOfMonth();
            int m1 = start.getMonthValue();
            int y1 = start.getYear();

            int d2 = end.getDayOfMonth();
            int m2 = end.getMonthValue();
            int y2 = end.getYear();

            if (d1 == 31 || (start.getMonthValue() == 2 && start.lengthOfMonth() == d1)) {
                d1 = 30;
            }
            boolean isMaturity = context != null && context.isTerminationDate();
            if (d2 == 31 && (!isMaturity || d1 == 30)) {
                d2 = 30;
            }

            return ((y2 - y1) * 360.0 + (m2 - m1) * 30.0 + (d2 - d1)) / 360.0;
        }
    };

    public abstract double yearFraction(LocalDate start, LocalDate end, ScheduleContext context);

    public double yearFraction(LocalDate start, LocalDate end) {
        return yearFraction(start, end, null);
    }

    /**
     * Contextual information for conventions that depend on coupon schedule (such as ACT/ACT ICMA).
     */
    public record ScheduleContext(
            int frequency,
            LocalDate couponPeriodStart,
            LocalDate couponPeriodEnd,
            boolean isTerminationDate
    ) {
        public static ScheduleContext of(int frequency, LocalDate periodStart, LocalDate periodEnd) {
            return new ScheduleContext(frequency, periodStart, periodEnd, false);
        }
    }
}

