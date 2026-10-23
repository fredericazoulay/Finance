package com.finance.pricer.fixedincome.bonds;

import com.finance.pricer.core.calendar.BusinessDayConvention;
import com.finance.pricer.core.calendar.DayCountConvention;
import com.finance.pricer.core.calendar.FinancialCalendar;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Fixed coupon bond representation with full payment schedule,
 * day count conventions, and business day adjustments (Hull Chapter 4 & 6).
 */
public class FixedCouponBond {

    public record CouponPayment(
            LocalDate periodStart,
            LocalDate periodEnd,
            LocalDate paymentDate,
            double accrualFraction,
            double couponAmount,
            double principalAmount
    ) {
        public double totalCashFlow() {
            return couponAmount + principalAmount;
        }
    }

    private final String bondId;
    private final double notional;
    private final double annualCouponRate;
    private final int frequency; // 1 = annual, 2 = semi-annual, 4 = quarterly, 12 = monthly
    private final LocalDate issueDate;
    private final LocalDate maturityDate;
    private final DayCountConvention dayCount;
    private final FinancialCalendar calendar;
    private final BusinessDayConvention businessDayConvention;
    private final List<CouponPayment> cashFlows;

    public FixedCouponBond(
            String bondId,
            double notional,
            double annualCouponRate,
            int frequency,
            LocalDate issueDate,
            LocalDate maturityDate,
            DayCountConvention dayCount,
            FinancialCalendar calendar,
            BusinessDayConvention businessDayConvention) {

        this.bondId = Objects.requireNonNull(bondId, "bondId cannot be null");
        this.notional = notional;
        this.annualCouponRate = annualCouponRate;
        this.frequency = frequency;
        this.issueDate = Objects.requireNonNull(issueDate, "issueDate cannot be null");
        this.maturityDate = Objects.requireNonNull(maturityDate, "maturityDate cannot be null");
        this.dayCount = Objects.requireNonNull(dayCount, "dayCount cannot be null");
        this.calendar = calendar != null ? calendar : FinancialCalendar.weekendsOnly();
        this.businessDayConvention = businessDayConvention != null ? businessDayConvention : BusinessDayConvention.MODIFIED_FOLLOWING;

        if (maturityDate.isBefore(issueDate)) {
            throw new IllegalArgumentException("maturityDate must be after issueDate");
        }
        if (frequency <= 0) {
            throw new IllegalArgumentException("frequency must be positive");
        }

        this.cashFlows = generateCashFlows();
    }

    /**
     * Convenience constructor for standard bonds without custom calendar.
     */
    public FixedCouponBond(
            double notional,
            double annualCouponRate,
            int frequency,
            LocalDate issueDate,
            LocalDate maturityDate,
            DayCountConvention dayCount) {
        this("BOND", notional, annualCouponRate, frequency, issueDate, maturityDate, dayCount, FinancialCalendar.weekendsOnly(), BusinessDayConvention.MODIFIED_FOLLOWING);
    }

    private List<CouponPayment> generateCashFlows() {
        List<CouponPayment> list = new ArrayList<>();
        int monthsPerPeriod = 12 / frequency;

        LocalDate periodEnd = maturityDate;
        List<LocalDate> unadjustedDates = new ArrayList<>();
        unadjustedDates.add(periodEnd);

        while (true) {
            LocalDate prev = periodEnd.minusMonths(monthsPerPeriod);
            if (prev.isBefore(issueDate) || prev.isEqual(issueDate)) {
                unadjustedDates.add(issueDate);
                break;
            }
            unadjustedDates.add(prev);
            periodEnd = prev;
        }

        // Reverse to chronological order
        java.util.Collections.reverse(unadjustedDates);

        for (int i = 0; i < unadjustedDates.size() - 1; i++) {
            LocalDate start = unadjustedDates.get(i);
            LocalDate end = unadjustedDates.get(i + 1);
            LocalDate paymentDate = calendar.adjust(end, businessDayConvention);

            DayCountConvention.ScheduleContext ctx = DayCountConvention.ScheduleContext.of(frequency, start, end);
            double accrualFraction = dayCount.yearFraction(start, end, ctx);
            double couponAmount = notional * annualCouponRate * accrualFraction;
            boolean isMaturity = (i == unadjustedDates.size() - 2);
            double principal = isMaturity ? notional : 0.0;

            list.add(new CouponPayment(start, end, paymentDate, accrualFraction, couponAmount, principal));
        }

        return List.copyOf(list);
    }

    /**
     * Calculates accrued interest from the last coupon date up to the settlement date:
     * Accrued Interest = Notional * CouponRate * YearFraction(LastCouponDate, SettlementDate)
     */
    public double calculateAccruedInterest(LocalDate settlementDate) {
        if (settlementDate.isBefore(issueDate) || !settlementDate.isBefore(maturityDate)) {
            return 0.0;
        }

        for (CouponPayment cp : cashFlows) {
            if (!settlementDate.isBefore(cp.periodStart()) && settlementDate.isBefore(cp.periodEnd())) {
                DayCountConvention.ScheduleContext ctx = DayCountConvention.ScheduleContext.of(frequency, cp.periodStart(), cp.periodEnd());
                double accruedFraction = dayCount.yearFraction(cp.periodStart(), settlementDate, ctx);
                return notional * annualCouponRate * accruedFraction;
            }
        }
        return 0.0;
    }

    public List<CouponPayment> getCashFlows() { return cashFlows; }
    public String getBondId() { return bondId; }
    public double getNotional() { return notional; }
    public double getAnnualCouponRate() { return annualCouponRate; }
    public int getFrequency() { return frequency; }
    public LocalDate getIssueDate() { return issueDate; }
    public LocalDate getMaturityDate() { return maturityDate; }
    public DayCountConvention getDayCountConvention() { return dayCount; }
    public FinancialCalendar getCalendar() { return calendar; }
}

