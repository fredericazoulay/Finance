package com.finance.pricer.core.calendar;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * High-performance holiday calendar engine supporting major financial centers
 * (TARGET2, London, US Government Bonds, US NYSE, Tokyo).
 * Computes exact floating holidays (Easter, Bank Holidays, Federal Holidays) dynamically.
 */
public class FinancialCalendar {

    public enum Center {
        TARGET2,
        US_GOVERNMENT,
        US_NYSE,
        LONDON,
        TOKYO,
        WEEKENDS_ONLY
    }

    private final Center center;
    private final Set<LocalDate> customHolidays;
    private final Map<Integer, Set<LocalDate>> yearHolidayCache = new ConcurrentHashMap<>();

    public FinancialCalendar(Center center) {
        this(center, Collections.emptySet());
    }

    public FinancialCalendar(Center center, Set<LocalDate> customHolidays) {
        this.center = Objects.requireNonNull(center, "center cannot be null");
        this.customHolidays = new HashSet<>(customHolidays);
    }

    public static FinancialCalendar of(Center center) {
        return new FinancialCalendar(center);
    }

    public static FinancialCalendar weekendsOnly() {
        return new FinancialCalendar(Center.WEEKENDS_ONLY);
    }

    public boolean isBusinessDay(LocalDate date) {
        DayOfWeek dow = date.getDayOfWeek();
        if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) {
            return false;
        }
        if (center == Center.WEEKENDS_ONLY && customHolidays.isEmpty()) {
            return true;
        }
        if (customHolidays.contains(date)) {
            return false;
        }
        return !getHolidaysForYear(date.getYear()).contains(date);
    }

    public LocalDate adjust(LocalDate date, BusinessDayConvention convention) {
        return convention.adjust(date, this::isBusinessDay);
    }

    public LocalDate addBusinessDays(LocalDate date, int days) {
        if (days == 0) return isBusinessDay(date) ? date : adjust(date, BusinessDayConvention.FOLLOWING);
        LocalDate result = date;
        int direction = days > 0 ? 1 : -1;
        int count = Math.abs(days);
        while (count > 0) {
            result = result.plusDays(direction);
            if (isBusinessDay(result)) {
                count--;
            }
        }
        return result;
    }

    public long countBusinessDays(LocalDate start, LocalDate end) {
        if (start.isAfter(end)) return -countBusinessDays(end, start);
        long count = 0;
        LocalDate curr = start;
        while (curr.isBefore(end)) {
            if (isBusinessDay(curr)) {
                count++;
            }
            curr = curr.plusDays(1);
        }
        return count;
    }

    public Set<LocalDate> getHolidaysForYear(int year) {
        return yearHolidayCache.computeIfAbsent(year, this::computeHolidaysForYear);
    }

    private Set<LocalDate> computeHolidaysForYear(int year) {
        Set<LocalDate> holidays = new HashSet<>();
        switch (center) {
            case TARGET2 -> populateTarget2(year, holidays);
            case US_GOVERNMENT -> populateUsGovernment(year, holidays);
            case US_NYSE -> populateUsNyse(year, holidays);
            case LONDON -> populateLondon(year, holidays);
            case TOKYO -> populateTokyo(year, holidays);
            case WEEKENDS_ONLY -> { /* weekends only */ }
        }
        return Collections.unmodifiableSet(holidays);
    }

    // --- Holiday Rules by Financial Center ---

    private void populateTarget2(int year, Set<LocalDate> holidays) {
        // New Year's Day
        holidays.add(LocalDate.of(year, 1, 1));
        // Good Friday and Easter Monday
        LocalDate easter = computeEasterSunday(year);
        holidays.add(easter.minusDays(2)); // Good Friday
        holidays.add(easter.plusDays(1));  // Easter Monday
        // Labour Day
        holidays.add(LocalDate.of(year, 5, 1));
        // Christmas Day & Boxing Day
        holidays.add(LocalDate.of(year, 12, 25));
        holidays.add(LocalDate.of(year, 12, 26));
    }

    private void populateUsGovernment(int year, Set<LocalDate> holidays) {
        // SIFMA US Government Securities
        addUsObserved(holidays, LocalDate.of(year, 1, 1)); // New Year
        holidays.add(nthDayOfWeek(year, 1, DayOfWeek.MONDAY, 3)); // MLK Day: 3rd Monday of Jan
        holidays.add(nthDayOfWeek(year, 2, DayOfWeek.MONDAY, 3)); // Washington's Birthday: 3rd Monday of Feb
        LocalDate easter = computeEasterSunday(year);
        holidays.add(easter.minusDays(2)); // Good Friday
        holidays.add(lastDayOfWeek(year, 5, DayOfWeek.MONDAY)); // Memorial Day: last Monday of May
        if (year >= 2021) {
            addUsObserved(holidays, LocalDate.of(year, 6, 19)); // Juneteenth
        }
        addUsObserved(holidays, LocalDate.of(year, 7, 4)); // Independence Day
        holidays.add(nthDayOfWeek(year, 9, DayOfWeek.MONDAY, 1)); // Labor Day: 1st Monday of Sep
        holidays.add(nthDayOfWeek(year, 10, DayOfWeek.MONDAY, 2)); // Columbus Day: 2nd Monday of Oct
        addUsObserved(holidays, LocalDate.of(year, 11, 11)); // Veterans Day
        holidays.add(nthDayOfWeek(year, 11, DayOfWeek.THURSDAY, 4)); // Thanksgiving: 4th Thursday of Nov
        addUsObserved(holidays, LocalDate.of(year, 12, 25)); // Christmas
    }

    private void populateUsNyse(int year, Set<LocalDate> holidays) {
        addUsObserved(holidays, LocalDate.of(year, 1, 1));
        holidays.add(nthDayOfWeek(year, 1, DayOfWeek.MONDAY, 3)); // MLK Day
        holidays.add(nthDayOfWeek(year, 2, DayOfWeek.MONDAY, 3)); // Washington's Birthday
        LocalDate easter = computeEasterSunday(year);
        holidays.add(easter.minusDays(2)); // Good Friday
        holidays.add(lastDayOfWeek(year, 5, DayOfWeek.MONDAY)); // Memorial Day
        if (year >= 2021) {
            addUsObserved(holidays, LocalDate.of(year, 6, 19)); // Juneteenth
        }
        addUsObserved(holidays, LocalDate.of(year, 7, 4));
        holidays.add(nthDayOfWeek(year, 9, DayOfWeek.MONDAY, 1)); // Labor Day
        holidays.add(nthDayOfWeek(year, 11, DayOfWeek.THURSDAY, 4)); // Thanksgiving
        addUsObserved(holidays, LocalDate.of(year, 12, 25));
    }

    private void populateLondon(int year, Set<LocalDate> holidays) {
        addUkObserved(holidays, LocalDate.of(year, 1, 1));
        LocalDate easter = computeEasterSunday(year);
        holidays.add(easter.minusDays(2)); // Good Friday
        holidays.add(easter.plusDays(1));  // Easter Monday
        holidays.add(nthDayOfWeek(year, 5, DayOfWeek.MONDAY, 1)); // Early May Bank Holiday
        holidays.add(lastDayOfWeek(year, 5, DayOfWeek.MONDAY)); // Spring Bank Holiday
        holidays.add(lastDayOfWeek(year, 8, DayOfWeek.MONDAY)); // Summer Bank Holiday
        addUkChristmasAndBoxingDay(year, holidays);
    }

    private void populateTokyo(int year, Set<LocalDate> holidays) {
        // Japan Bank Holidays
        addJapanObserved(holidays, LocalDate.of(year, 1, 1)); // New Year's Day
        addJapanObserved(holidays, LocalDate.of(year, 1, 2)); // Bank Holiday
        addJapanObserved(holidays, LocalDate.of(year, 1, 3)); // Bank Holiday
        holidays.add(nthDayOfWeek(year, 1, DayOfWeek.MONDAY, 2)); // Coming of Age Day
        addJapanObserved(holidays, LocalDate.of(year, 2, 11)); // National Foundation Day
        addJapanObserved(holidays, LocalDate.of(year, 2, 23)); // Emperor's Birthday
        addJapanObserved(holidays, LocalDate.of(year, 4, 29)); // Showa Day
        addJapanObserved(holidays, LocalDate.of(year, 5, 3));  // Constitution Memorial Day
        addJapanObserved(holidays, LocalDate.of(year, 5, 4));  // Greenery Day
        addJapanObserved(holidays, LocalDate.of(year, 5, 5));  // Children's Day
        holidays.add(nthDayOfWeek(year, 7, DayOfWeek.MONDAY, 3)); // Marine Day
        addJapanObserved(holidays, LocalDate.of(year, 8, 11)); // Mountain Day
        holidays.add(nthDayOfWeek(year, 9, DayOfWeek.MONDAY, 3)); // Respect for the Aged Day
        holidays.add(nthDayOfWeek(year, 10, DayOfWeek.MONDAY, 2)); // Sports Day
        addJapanObserved(holidays, LocalDate.of(year, 11, 3)); // Culture Day
        addJapanObserved(holidays, LocalDate.of(year, 11, 23)); // Labor Thanksgiving Day
        addJapanObserved(holidays, LocalDate.of(year, 12, 31)); // Bank Holiday
    }

    // --- Helper date calculations ---

    private static void addUsObserved(Set<LocalDate> holidays, LocalDate date) {
        DayOfWeek dow = date.getDayOfWeek();
        if (dow == DayOfWeek.SATURDAY) {
            holidays.add(date.minusDays(1));
        } else if (dow == DayOfWeek.SUNDAY) {
            holidays.add(date.plusDays(1));
        } else {
            holidays.add(date);
        }
    }

    private static void addUkObserved(Set<LocalDate> holidays, LocalDate date) {
        DayOfWeek dow = date.getDayOfWeek();
        if (dow == DayOfWeek.SATURDAY) {
            holidays.add(date.plusDays(2));
        } else if (dow == DayOfWeek.SUNDAY) {
            holidays.add(date.plusDays(1));
        } else {
            holidays.add(date);
        }
    }

    private static void addJapanObserved(Set<LocalDate> holidays, LocalDate date) {
        holidays.add(date);
        if (date.getDayOfWeek() == DayOfWeek.SUNDAY) {
            holidays.add(date.plusDays(1));
        }
    }

    private static void addUkChristmasAndBoxingDay(int year, Set<LocalDate> holidays) {
        LocalDate christmas = LocalDate.of(year, 12, 25);
        LocalDate boxing = LocalDate.of(year, 12, 26);
        DayOfWeek cDow = christmas.getDayOfWeek();

        if (cDow == DayOfWeek.FRIDAY) {
            holidays.add(christmas);
            holidays.add(LocalDate.of(year, 12, 28)); // Boxing day observed Monday
        } else if (cDow == DayOfWeek.SATURDAY) {
            holidays.add(LocalDate.of(year, 12, 27)); // Monday
            holidays.add(LocalDate.of(year, 12, 28)); // Tuesday
        } else if (cDow == DayOfWeek.SUNDAY) {
            holidays.add(LocalDate.of(year, 12, 26)); // Monday
            holidays.add(LocalDate.of(year, 12, 27)); // Tuesday
        } else {
            holidays.add(christmas);
            holidays.add(boxing);
        }
    }

    private static LocalDate nthDayOfWeek(int year, int month, DayOfWeek dow, int n) {
        return LocalDate.of(year, month, 1).with(TemporalAdjusters.dayOfWeekInMonth(n, dow));
    }

    private static LocalDate lastDayOfWeek(int year, int month, DayOfWeek dow) {
        return LocalDate.of(year, month, 1).with(TemporalAdjusters.lastInMonth(dow));
    }

    /**
     * Anonymous Gregorian algorithm (Meeus/Jones/Butcher) for Easter Sunday.
     */
    public static LocalDate computeEasterSunday(int year) {
        int a = year % 19;
        int b = year / 100;
        int c = year % 100;
        int d = b / 4;
        int e = b % 4;
        int f = (b + 8) / 25;
        int g = (b - f + 1) / 3;
        int h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4;
        int k = c % 4;
        int l = (32 + 2 * e + 2 * i - h - k) % 7;
        int m = (a + 11 * h + 22 * l) / 451;
        int month = (h + l - 7 * m + 114) / 31;
        int day = ((h + l - 7 * m + 114) % 31) + 1;
        return LocalDate.of(year, month, day);
    }
}

