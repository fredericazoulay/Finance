package com.finance.pricer.linear.forwards;

import com.finance.pricer.core.calendar.DayCountConvention;
import com.finance.pricer.core.curves.YieldCurve;

import java.time.LocalDate;
import java.util.Objects;

/**
 * Forward Rate Agreement (FRA) pricing and valuation engine according to John C. Hull (Chapter 4, Section 4.7).
 * Evaluates par FRA rate, present value, and settlement payoff at T1 or T2.
 */
public class FraContract {

    public enum PayReceive {
        PAY_FIXED_RECEIVE_FLOAT,  // Borrower (protects against rising rates)
        RECEIVE_FIXED_PAY_FLOAT   // Lender (protects against falling rates)
    }

    private final PayReceive side;
    private final double notional;
    private final double agreedRate; // R_K
    private final LocalDate startDate;   // T1 (fixing and settlement date)
    private final LocalDate maturityDate; // T2 (end of accrual period)
    private final DayCountConvention dayCount;

    public FraContract(
            PayReceive side,
            double notional,
            double agreedRate,
            LocalDate startDate,
            LocalDate maturityDate,
            DayCountConvention dayCount) {

        this.side = Objects.requireNonNull(side, "side cannot be null");
        this.notional = notional;
        this.agreedRate = agreedRate;
        this.startDate = Objects.requireNonNull(startDate, "startDate cannot be null");
        this.maturityDate = Objects.requireNonNull(maturityDate, "maturityDate cannot be null");
        this.dayCount = Objects.requireNonNull(dayCount, "dayCount cannot be null");

        if (maturityDate.isBefore(startDate)) {
            throw new IllegalArgumentException("maturityDate must be after startDate");
        }
    }

    /**
     * Accrual period tau = (T2 - T1).
     */
    public double accrualFraction() {
        return dayCount.yearFraction(startDate, maturityDate);
    }

    /**
     * Par FRA rate R_M implied by the forwarding yield curve:
     * R_M = (1 / tau) * [ P(0, T1) / P(0, T2) - 1 ]
     */
    public double parFraRate(YieldCurve forwardCurve) {
        double tau = accrualFraction();
        if (tau <= 0.0) return 0.0;
        double p1 = forwardCurve.discountFactor(startDate);
        double p2 = forwardCurve.discountFactor(maturityDate);
        return (p1 / p2 - 1.0) / tau;
    }

    /**
     * Present Value (PV) of the FRA at time 0 (settlement at T1 or T2 discounted to today):
     * V0 = Notional * (R_M - R_K) * tau * P_discount(0, T2)   (for PAY_FIXED)
     */
    public double presentValue(YieldCurve discountCurve, YieldCurve forwardCurve) {
        double tau = accrualFraction();
        double rm = parFraRate(forwardCurve);
        double p2Disc = discountCurve.discountFactor(maturityDate);

        double direction = (side == PayReceive.PAY_FIXED_RECEIVE_FLOAT) ? 1.0 : -1.0;
        return direction * notional * (rm - agreedRate) * tau * p2Disc;
    }

    /**
     * Convenience present value when discounting and forwarding use the same yield curve.
     */
    public double presentValue(YieldCurve yieldCurve) {
        return presentValue(yieldCurve, yieldCurve);
    }

    /**
     * Settlement payoff at start date T1 (standard money market convention):
     * Payoff_T1 = Notional * [ (R_M - R_K) * tau ] / [ 1 + R_M * tau ]
     */
    public double settlementPayoffAtT1(double fixingRate) {
        double tau = accrualFraction();
        double direction = (side == PayReceive.PAY_FIXED_RECEIVE_FLOAT) ? 1.0 : -1.0;
        double numerator = direction * notional * (fixingRate - agreedRate) * tau;
        double denominator = 1.0 + fixingRate * tau;
        return numerator / denominator;
    }

    public PayReceive getSide() { return side; }
    public double getNotional() { return notional; }
    public double getAgreedRate() { return agreedRate; }
    public LocalDate getStartDate() { return startDate; }
    public LocalDate getMaturityDate() { return maturityDate; }
    public DayCountConvention getDayCountConvention() { return dayCount; }
}

