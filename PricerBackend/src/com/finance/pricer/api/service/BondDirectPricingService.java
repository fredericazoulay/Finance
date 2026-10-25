package com.finance.pricer.api.service;

import com.finance.pricer.api.dto.BondDirectPricingRequest;
import com.finance.pricer.api.dto.BondDirectPricingResponse;
import com.finance.pricer.core.calendar.BusinessDayConvention;
import com.finance.pricer.core.calendar.DayCountConvention;
import com.finance.pricer.core.calendar.FinancialCalendar;
import com.finance.pricer.fixedincome.bonds.BondAnalytics;
import com.finance.pricer.fixedincome.bonds.FixedCouponBond;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Locale;

@Service
public class BondDirectPricingService {
    private static final String SOLVE_FOR_PRICE = "PRICE";
    private static final String FIELD_PRICE = "price";
    private static final double ROOT_TOLERANCE = 1e-10;
    private static final double MAX_TERM_YEARS = 200;
    private static final double MAX_SOLVED_YIELD = 1_000_000.0;

    public BondDirectPricingResponse calculate(BondDirectPricingRequest request) {
        if (request == null) throw new IllegalArgumentException("Request is required");

        String solveFor = request.solveFor() == null ? "" : request.solveFor().trim().toUpperCase(Locale.ROOT);
        double faceValue = positive(request.faceValue(), "faceValue");
        double couponRate = nonNegative(request.couponRate(), "couponRate");
        int frequency = positiveFrequency(request.couponFrequency());
        boolean dateBased = request.issueDate() != null || request.maturityDate() != null || request.settlementDate() != null;

        if (dateBased) {
            return calculateDateBased(request, solveFor, faceValue, couponRate, frequency);
        }
        return calculateBasic(request, solveFor, faceValue, couponRate, frequency);
    }

    private BondDirectPricingResponse calculateBasic(
            BondDirectPricingRequest request,
            String solveFor,
            double faceValue,
            double couponRate,
            int frequency) {
        double termYears;
        double ytm;
        double price;

        switch (solveFor) {
            case SOLVE_FOR_PRICE -> {
                termYears = positive(request.termYears(), "termYears");
                ytm = validYield(request.ytm(), frequency);
                price = basicPrice(faceValue, couponRate, frequency, termYears, ytm);
            }
            case "YTM" -> {
                termYears = positive(request.termYears(), "termYears");
                price = positive(request.price(), FIELD_PRICE);
                ytm = solveYield(faceValue, couponRate, frequency, termYears, price);
            }
            case "TERM" -> {
                price = positive(request.price(), FIELD_PRICE);
                ytm = validYield(request.ytm(), frequency);
                termYears = solveTerm(faceValue, couponRate, frequency, ytm, price);
            }
            default -> throw new IllegalArgumentException("solveFor must be PRICE, YTM or TERM");
        }

        return new BondDirectPricingResponse(solveFor, faceValue, price, ytm, termYears,
                price, 0.0, 0L, "N/A", null, null, null, null);
    }

    private BondDirectPricingResponse calculateDateBased(
            BondDirectPricingRequest request,
            String solveFor,
            double faceValue,
            double couponRate,
            int frequency) {
        if (!solveFor.equals(SOLVE_FOR_PRICE) && !solveFor.equals("YTM")) {
            throw new IllegalArgumentException("Date-based pricing supports solveFor PRICE or YTM");
        }

        LocalDate issueDate = required(request.issueDate(), "issueDate");
        LocalDate maturityDate = required(request.maturityDate(), "maturityDate");
        LocalDate settlementDate = required(request.settlementDate(), "settlementDate");
        if (issueDate.isAfter(settlementDate)) throw new IllegalArgumentException("issueDate must be on or before settlementDate");
        if (!settlementDate.isBefore(maturityDate)) throw new IllegalArgumentException("settlementDate must be before maturityDate");
        DayCountConvention dayCount = parseDayCount(request.dayCount());

        FixedCouponBond bond = new FixedCouponBond(
                "DIRECT-BOND", faceValue, couponRate, frequency, issueDate, maturityDate,
                dayCount, FinancialCalendar.weekendsOnly(), BusinessDayConvention.MODIFIED_FOLLOWING);

        double ytm = solveFor.equals(SOLVE_FOR_PRICE)
                ? validYield(request.ytm(), frequency)
            : BondAnalytics.ytmFromCleanPrice(bond, settlementDate, positive(request.price(), FIELD_PRICE));
        double dirtyPrice = BondAnalytics.dirtyPriceFromYtm(bond, settlementDate, ytm);
        double accruedInterest = bond.calculateAccruedInterest(settlementDate);
        double cleanPrice = dirtyPrice - accruedInterest;
        if (solveFor.equals("YTM")) cleanPrice = request.price();

        return new BondDirectPricingResponse(
                solveFor,
                faceValue,
                cleanPrice,
                ytm,
                dayCount.yearFraction(settlementDate, maturityDate, null),
                dirtyPrice,
                accruedInterest,
                ChronoUnit.DAYS.between(previousCouponDate(bond, settlementDate), settlementDate),
                dayCount.name(),
                BondAnalytics.macaulayDuration(bond, settlementDate, ytm),
                BondAnalytics.modifiedDuration(bond, settlementDate, ytm),
                BondAnalytics.convexity(bond, settlementDate, ytm),
                BondAnalytics.dv01(bond, settlementDate, ytm));
    }

    private static double basicPrice(double faceValue, double couponRate, int frequency, double termYears, double ytm) {
        if (termYears > MAX_TERM_YEARS) throw new IllegalArgumentException("termYears must not exceed 200");
        double periods = termYears * frequency;
        double periodicYield = 1 + ytm / frequency;
        if (periodicYield <= 0) throw new IllegalArgumentException("ytm must be greater than -couponFrequency");

        int fullCoupons = (int) Math.floor(periods + ROOT_TOLERANCE);
        double fractionalPeriod = periods - fullCoupons;
        double couponPayment = faceValue * couponRate / frequency;
        double price = 0;
        boolean integerMaturity = fractionalPeriod < ROOT_TOLERANCE;

        for (int period = 1; period <= fullCoupons; period++) {
            double cashFlow = couponPayment;
            if (integerMaturity && period == fullCoupons) cashFlow += faceValue;
            price += cashFlow / Math.pow(periodicYield, period);
        }
        if (!integerMaturity) {
            double finalCashFlow = faceValue + couponPayment * fractionalPeriod;
            price += finalCashFlow / Math.pow(periodicYield, periods);
        }
        return price;
    }

    private static double solveYield(double faceValue, double couponRate, int frequency, double termYears, double targetPrice) {
        double lower = Math.nextUp(-frequency);
        double upper = 100;
        double lowerValue = basicPrice(faceValue, couponRate, frequency, termYears, lower) - targetPrice;
        double upperValue = basicPrice(faceValue, couponRate, frequency, termYears, upper) - targetPrice;
        while (!oppositeSigns(lowerValue, upperValue) && upper < MAX_SOLVED_YIELD) {
            upper = Math.min(MAX_SOLVED_YIELD, upper * 2 + 1);
            upperValue = basicPrice(faceValue, couponRate, frequency, termYears, upper) - targetPrice;
        }
        if (!oppositeSigns(lowerValue, upperValue)) throw new IllegalArgumentException("price does not imply a solvable YTM");

        for (int iteration = 0; iteration < 200; iteration++) {
            double middle = (lower + upper) / 2;
            double middleValue = basicPrice(faceValue, couponRate, frequency, termYears, middle) - targetPrice;
                if (Math.abs(middleValue) <= ROOT_TOLERANCE * targetPrice
                    || upper - lower <= ROOT_TOLERANCE * Math.max(1.0, Math.abs(middle))) return middle;
            if (oppositeSigns(lowerValue, middleValue)) {
                upper = middle;
            } else {
                lower = middle;
                lowerValue = middleValue;
            }
        }
        throw new ArithmeticException("YTM solver did not converge after 200 iterations");
    }

    private static double solveTerm(double faceValue, double couponRate, int frequency, double ytm, double targetPrice) {
        if (Math.abs(couponRate - ytm) < ROOT_TOLERANCE && Math.abs(faceValue - targetPrice) < 1e-8) {
            throw new IllegalArgumentException("term cannot be uniquely determined when coupon equals YTM and price equals par");
        }
        double lower = 1e-8;
        double upper = MAX_TERM_YEARS;
        double lowerValue = basicPrice(faceValue, couponRate, frequency, lower, ytm) - targetPrice;
        double upperValue = basicPrice(faceValue, couponRate, frequency, upper, ytm) - targetPrice;
        if (!oppositeSigns(lowerValue, upperValue)) throw new IllegalArgumentException("price does not imply a solvable term");

        for (int iteration = 0; iteration < 200; iteration++) {
            double middle = (lower + upper) / 2;
            double middleValue = basicPrice(faceValue, couponRate, frequency, middle, ytm) - targetPrice;
                if (Math.abs(middleValue) <= ROOT_TOLERANCE * targetPrice
                    || upper - lower <= ROOT_TOLERANCE * Math.max(1.0, Math.abs(middle))) return middle;
            if (oppositeSigns(lowerValue, middleValue)) {
                upper = middle;
            } else {
                lower = middle;
                lowerValue = middleValue;
            }
        }
        throw new ArithmeticException("Term solver did not converge after 200 iterations");
    }

    private static DayCountConvention parseDayCount(String value) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("dayCount is required");
        return switch (value.trim().toUpperCase(Locale.ROOT).replace('/', '_')) {
            case "30_360", "THIRTY_360", "THIRTY_E_360" -> DayCountConvention.THIRTY_E_360;
            case "THIRTY_360_US" -> DayCountConvention.THIRTY_360_US;
            case "ACT_360", "ACTUAL_360" -> DayCountConvention.ACT_360;
            case "ACT_365F", "ACT_365", "ACTUAL_365", "ACTUAL_365F" -> DayCountConvention.ACT_365F;
            case "ACT_ACT", "ACTUAL_ACTUAL", "ACT_ACT_ICMA" -> DayCountConvention.ACT_ACT_ICMA;
            case "ACT_ACT_ISDA", "ACTUAL_ACTUAL_ISDA" -> DayCountConvention.ACT_ACT_ISDA;
            default -> throw new IllegalArgumentException("Unsupported dayCount: " + value);
        };
    }

    private static LocalDate previousCouponDate(FixedCouponBond bond, LocalDate settlementDate) {
        for (FixedCouponBond.CouponPayment payment : bond.getCashFlows()) {
            if (!payment.periodStart().isAfter(settlementDate) && settlementDate.isBefore(payment.periodEnd())) {
                return payment.periodStart();
            }
        }
        return settlementDate;
    }

    private static LocalDate required(LocalDate value, String field) {
        if (value == null) throw new IllegalArgumentException(field + " is required");
        return value;
    }

    private static double positive(Double value, String field) {
        if (value == null || !Double.isFinite(value) || value <= 0) throw new IllegalArgumentException(field + " must be greater than zero");
        return value;
    }

    private static double nonNegative(Double value, String field) {
        if (value == null || !Double.isFinite(value) || value < 0) throw new IllegalArgumentException(field + " must be non-negative");
        return value;
    }

    private static int positiveFrequency(Integer value) {
        if (value == null || value <= 0 || 12 % value != 0) throw new IllegalArgumentException("couponFrequency must be 1, 2, 3, 4, 6 or 12");
        return value;
    }

    private static double validYield(Double value, int frequency) {
        if (value == null || !Double.isFinite(value) || value <= -frequency) {
            throw new IllegalArgumentException("ytm must be greater than -couponFrequency");
        }
        return value;
    }

    private static boolean oppositeSigns(double left, double right) {
        return (left <= 0 && right >= 0) || (left >= 0 && right <= 0);
    }
}