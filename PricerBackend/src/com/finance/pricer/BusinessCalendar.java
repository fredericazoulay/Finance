package com.finance.pricer;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

public final class BusinessCalendar {
    private final Set<LocalDate> holidays;

    public BusinessCalendar(Set<LocalDate> holidays) {
        this.holidays = new HashSet<>(holidays);
    }

    public static BusinessCalendar standard() {
        return new BusinessCalendar(Set.of());
    }

    public boolean isBusinessDay(LocalDate date) {
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
        LocalDate result = date;
        int direction = days < 0 ? -1 : 1;
        for (int i = 0; i < Math.abs(days); i++) {
            do result = result.plusDays(direction); while (!isBusinessDay(result));
        }
        return result;
    }
}
