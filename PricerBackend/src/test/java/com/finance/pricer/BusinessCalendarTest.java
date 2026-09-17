package com.finance.pricer;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BusinessCalendarTest {
    private static final LocalDate FRIDAY = LocalDate.of(2026, 9, 18);
    private static final LocalDate SATURDAY = LocalDate.of(2026, 9, 19);
    private static final LocalDate MONDAY = LocalDate.of(2026, 9, 21);

    @Test
    void identifiesWeekendsAndHolidays() {
        LocalDate holiday = LocalDate.of(2026, 9, 21);
        BusinessCalendar calendar = new BusinessCalendar(Set.of(holiday));

        assertTrue(calendar.isBusinessDay(FRIDAY));
        assertFalse(calendar.isBusinessDay(SATURDAY));
        assertFalse(calendar.isBusinessDay(holiday));
    }

    @Test
    void adjustsFollowingAndPrecedingDates() {
        BusinessCalendar calendar = new BusinessCalendar(Set.of(MONDAY));

        assertEquals(LocalDate.of(2026, 9, 22), calendar.following(SATURDAY));
        assertEquals(FRIDAY, calendar.preceding(SATURDAY));
    }

    @Test
    void modifiedFollowingRevertsAcrossMonthBoundary() {
        LocalDate monthEndSaturday = LocalDate.of(2026, 10, 31);
        BusinessCalendar calendar = BusinessCalendar.standard();

        assertEquals(LocalDate.of(2026, 10, 30), calendar.modifiedFollowing(monthEndSaturday));
    }

    @Test
    void addsPositiveAndNegativeBusinessDays() {
        BusinessCalendar calendar = BusinessCalendar.standard();

        assertEquals(LocalDate.of(2026, 9, 23), calendar.addBusinessDays(FRIDAY, 3));
        assertEquals(LocalDate.of(2026, 9, 16), calendar.addBusinessDays(FRIDAY, -2));
        assertEquals(FRIDAY, calendar.addBusinessDays(FRIDAY, 0));
    }
}
