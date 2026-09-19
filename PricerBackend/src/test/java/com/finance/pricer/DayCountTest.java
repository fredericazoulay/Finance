package com.finance.pricer;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DayCountTest {
    @Test
    void calculatesActualDayCountConventions() {
        LocalDate start = LocalDate.of(2024, 1, 1);
        LocalDate end = LocalDate.of(2025, 1, 1);

        assertEquals(366.0 / 365, DayCount.ACT_365F.yearFraction(start, end), 1e-12);
        assertEquals(366.0 / 360, DayCount.ACT_360.yearFraction(start, end), 1e-12);
    }

    @Test
    void calculatesThirty360AndSupportsReversedDates() {
        LocalDate start = LocalDate.of(2024, 1, 31);
        LocalDate end = LocalDate.of(2024, 7, 31);

        assertEquals(180.0 / 360, DayCount.THIRTY_360.yearFraction(start, end), 1e-12);
        assertEquals(-182.0 / 365, DayCount.ACT_365F.yearFraction(end, start), 1e-12);
    }
}
