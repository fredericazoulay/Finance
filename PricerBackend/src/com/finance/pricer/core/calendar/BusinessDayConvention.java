package com.finance.pricer.core.calendar;

import java.time.LocalDate;
//import java.time.YearMonth;
import java.util.function.Predicate;

/**
 * Standard business day conventions for coupon schedules and payment dates
 * as described in John C. Hull (Chapter 6 & 7).
 */
public enum BusinessDayConvention {

    /**
     * No adjustment is made; payments occur on the scheduled calendar date.
     */
    UNADJUSTED {
        @Override
        public LocalDate adjust(LocalDate date, Predicate<LocalDate> isBusinessDay) {
            return date;
        }
    },

    /**
     * The payment date is rolled to the next business day.
     */
    FOLLOWING {
        @Override
        public LocalDate adjust(LocalDate date, Predicate<LocalDate> isBusinessDay) {
            LocalDate d = date;
            while (!isBusinessDay.test(d)) {
                d = d.plusDays(1);
            }
            return d;
        }
    },

    /**
     * The payment date is rolled to the next business day unless it falls into
     * the next calendar month, in which case it is rolled to the preceding business day.
     */
    MODIFIED_FOLLOWING {
        @Override
        public LocalDate adjust(LocalDate date, Predicate<LocalDate> isBusinessDay) {
            LocalDate next = FOLLOWING.adjust(date, isBusinessDay);
            if (next.getMonthValue() != date.getMonthValue()) {
                return PRECEDING.adjust(date, isBusinessDay);
            }
            return next;
        }
    },

    /**
     * The payment date is rolled to the previous business day.
     */
    PRECEDING {
        @Override
        public LocalDate adjust(LocalDate date, Predicate<LocalDate> isBusinessDay) {
            LocalDate d = date;
            while (!isBusinessDay.test(d)) {
                d = d.minusDays(1);
            }
            return d;
        }
    },

    /**
     * The payment date is rolled to the previous business day unless it falls into
     * the previous calendar month, in which case it is rolled to the following business day.
     */
    MODIFIED_PRECEDING {
        @Override
        public LocalDate adjust(LocalDate date, Predicate<LocalDate> isBusinessDay) {
            LocalDate prev = PRECEDING.adjust(date, isBusinessDay);
            if (prev.getMonthValue() != date.getMonthValue()) {
                return FOLLOWING.adjust(date, isBusinessDay);
            }
            return prev;
        }
    },

    /**
     * Nearest business day: if Saturday/Sunday/Holiday, roll to closest business day.
     * Ties (e.g. Sunday) roll to following Monday.
     */
    NEAREST {
        @Override
        public LocalDate adjust(LocalDate date, Predicate<LocalDate> isBusinessDay) {
            if (isBusinessDay.test(date)) return date;
            LocalDate next = FOLLOWING.adjust(date, isBusinessDay);
            LocalDate prev = PRECEDING.adjust(date, isBusinessDay);
            long daysToNext = java.time.temporal.ChronoUnit.DAYS.between(date, next);
            long daysToPrev = java.time.temporal.ChronoUnit.DAYS.between(prev, date);
            return (daysToNext <= daysToPrev) ? next : prev;
        }
    };

    /**
     * Adjust the given date according to this business day convention.
     *
     * @param date the date to adjust
     * @param isBusinessDay predicate returning true if a date is a business day
     * @return the adjusted business date
     */
    public abstract LocalDate adjust(LocalDate date, Predicate<LocalDate> isBusinessDay);
}

