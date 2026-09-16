package com.finance.pricer;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

public enum DayCount {
    ACT_365F {
        public double yearFraction(LocalDate start, LocalDate end) {
            return ChronoUnit.DAYS.between(start, end) / 365.0;
        }
    },
    ACT_360 {
        public double yearFraction(LocalDate start, LocalDate end) {
            return ChronoUnit.DAYS.between(start, end) / 360.0;
        }
    },
    THIRTY_360 {
        public double yearFraction(LocalDate start, LocalDate end) {
            int d1 = Math.min(start.getDayOfMonth(), 30);
            int d2 = Math.min(end.getDayOfMonth(), 30);
            return ((end.getYear() - start.getYear()) * 360.0
                    + (end.getMonthValue() - start.getMonthValue()) * 30.0 + d2 - d1) / 360.0;
        }
    };

    public abstract double yearFraction(LocalDate start, LocalDate end);
}
