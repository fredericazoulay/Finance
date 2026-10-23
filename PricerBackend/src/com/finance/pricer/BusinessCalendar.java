package com.finance.pricer;

import com.finance.pricer.core.calendar.FinancialCalendar;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

public final class BusinessCalendar {
    private final Set<LocalDate> holidays;
    private final FinancialCalendar financialCalendar;

    public BusinessCalendar(Set<LocalDate> holidays) {
        this.holidays = new HashSet<>(holidays);
        this.financialCalendar = null;
    }

    private BusinessCalendar(FinancialCalendar.Center center) {
        this.holidays = Set.of();
        this.financialCalendar = FinancialCalendar.of(center);
    }

    public static BusinessCalendar standard() {
        return new BusinessCalendar(Set.of());
    }

    public static BusinessCalendar target2() {
        return new BusinessCalendar(FinancialCalendar.Center.TARGET2);
    }

    public static BusinessCalendar usGovernment() {
        return new BusinessCalendar(FinancialCalendar.Center.US_GOVERNMENT);
    }

    public static BusinessCalendar usNyse() {
        return new BusinessCalendar(FinancialCalendar.Center.US_NYSE);
    }

    public static BusinessCalendar london() {
        return new BusinessCalendar(FinancialCalendar.Center.LONDON);
    }

    public boolean isBusinessDay(LocalDate date) {
        if (financialCalendar != null) {
            return financialCalendar.isBusinessDay(date);
        }
        DayOfWeek day = date.getDayOfWeek();
        return day != DayOfWeek.SATURDAY && day != DayOfWeek.SUNDAY && !holidays.contains(date);
    }

    public LocalDate following(LocalDate date) {
        LocalDate adjusted = date;
        while (!isBusinessDay(adjusted)) adjusted = adjusted.plusDays(1);
        return adjusted;
    }

    public LocalDate modifiedFollowing(LocalDate date) {
        LocalDate adjusted = following(date);
        return adjusted.getMonth() == date.getMonth() ? adjusted : preceding(date);
    }

    public LocalDate preceding(LocalDate date) {
        LocalDate adjusted = date;
        while (!isBusinessDay(adjusted)) adjusted = adjusted.minusDays(1);
        return adjusted;
    }

    public LocalDate addBusinessDays(LocalDate date, int days) {
        if (days == 0) return isBusinessDay(date) ? date : following(date);
        LocalDate result = date;
        int direction = days < 0 ? -1 : 1;
        for (int i = 0; i < Math.abs(days); i++) {
            do result = result.plusDays(direction); while (!isBusinessDay(result));
        }
        return result;
    }
}
