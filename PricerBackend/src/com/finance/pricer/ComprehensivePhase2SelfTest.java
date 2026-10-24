package com.finance.pricer;

import com.finance.pricer.core.calendar.DayCountConvention;
import com.finance.pricer.core.calendar.FinancialCalendar;
import com.finance.pricer.core.curves.FlatYieldCurve;
import com.finance.pricer.core.curves.YieldCurve;
import com.finance.pricer.core.curves.ZeroRateCurve;
import com.finance.pricer.fixedincome.bonds.BondAnalytics;
import com.finance.pricer.fixedincome.bonds.FixedCouponBond;
import com.finance.pricer.linear.forwards.BondFutures;
import com.finance.pricer.linear.forwards.ForwardContract;
import com.finance.pricer.linear.forwards.FraContract;
import com.finance.pricer.linear.forwards.InterestRateFutures;

import java.time.LocalDate;
import java.util.List;
import java.util.logging.Logger;

public final class ComprehensivePhase2SelfTest {
    private static final Logger LOGGER = Logger.getLogger(ComprehensivePhase2SelfTest.class.getName());

    public static void main(String[] args) {
        testForwardsAndFutures();
        testFra();
        testBondFuturesAndCtd();
        testBondAnalytics();
        LOGGER.info("All Phase 2 Linear & Fixed Income Self-Tests PASSED successfully!");
    }

    private static void testForwardsAndFutures() {
        YieldCurve flat5 = new FlatYieldCurve(0.05);

        // 1. Equity with continuous dividend: S0 = 1000, r = 0.05, q = 0.02, T = 1.0
        // F0 = 1000 * exp((0.05 - 0.02) * 1) = 1000 * exp(0.03) = 1030.4545
        ForwardContract eqCont = ForwardContract.equityWithContinuousDividend(1000.0, 1000.0, 1.0, 0.02);
        double f0 = eqCont.theoreticalForwardPrice(flat5);
        assertEquals(1000.0 * Math.exp(0.03), f0, 1e-4, "Continuous dividend equity forward F0");
        // PV when K = 1000: (F0 - 1000) * exp(-0.05)
        double pv = eqCont.presentValue(flat5);
        assertEquals((f0 - 1000.0) * Math.exp(-0.05), pv, 1e-4, "Forward PV");

        // 2. FX Forward: S0 = 1.20, r_d = 0.05, r_f = 0.02, T = 0.5
        // F0 = 1.20 * exp((0.05 - 0.02) * 0.5) = 1.20 * exp(0.015) = 1.218136
        ForwardContract fx = ForwardContract.fxForward(1.20, 1.20, 0.5, 0.02);
        double fxF0 = fx.theoreticalForwardPrice(flat5);
        assertEquals(1.20 * Math.exp(0.015), fxF0, 1e-4, "FX forward F0");
        double fwdPoints = fx.fxForwardPoints(flat5);
        assertEquals(fxF0 - 1.20, fwdPoints, 1e-6, "FX forward points");

        // 3. Commodity with storage cost u=0.02, convenience yield y=0.01
        // F0 = S0 * exp((r + u - y) * T) = 100 * exp((0.05 + 0.02 - 0.01) * 2) = 100 * exp(0.12)
        ForwardContract comm = ForwardContract.commodityForward(100.0, 100.0, 2.0, 0.02, 0.01);
        assertEquals(100.0 * Math.exp(0.12), comm.theoreticalForwardPrice(flat5), 1e-4, "Commodity forward");
    }

    private static void testFra() {
        LocalDate start = LocalDate.of(2024, 1, 1);
        LocalDate end = LocalDate.of(2024, 7, 1);
        // 6-month period, tau = 0.5 with ACT/360 approx or ACT/365
        YieldCurve curve = new FlatYieldCurve(start, DayCountConvention.ACT_365F, 0.04);
        FraContract fra = new FraContract(
                FraContract.PayReceive.PAY_FIXED_RECEIVE_FLOAT,
                10_000_000.0, // 10M notional
                0.038,        // agreed 3.8%
                start,
                end,
                DayCountConvention.ACT_365F
        );

        double parRate = fra.parFraRate(curve);
        // For flat 4% curve, par simple rate over dt is (exp(0.04*dt) - 1) / dt approx 4.04%
        double dt = DayCountConvention.ACT_365F.yearFraction(start, end);
        double expectedRate = (Math.exp(0.04 * dt) - 1.0) / dt;
        assertEquals(expectedRate, parRate, 1e-6, "Par FRA rate");

        // PV should be positive since parRate > agreedRate (0.0404 > 0.038)
        double pv = fra.presentValue(curve);
        check(pv > 0.0, "FRA PV should be positive for payer of below-market fixed rate");
    }

    private static void testBondFuturesAndCtd() {
        // Hull Ch. 6: If coupon = 6%, CF must be exactly 1.0000 regardless of maturity
        double cf6 = BondFutures.computeConversionFactor(0.06, 10.0, 2);
        assertEquals(1.0, cf6, 1e-6, "6% coupon bond CF must be 1.0000");

        // Higher coupon bond (> 6%) has CF > 1.0
        double cf8 = BondFutures.computeConversionFactor(0.08, 15.0, 2);
        check(cf8 > 1.0, "8% coupon bond must have CF > 1.0 (actual: " + cf8 + ")");

        // Lower coupon bond (< 6%) has CF < 1.0
        double cf4 = BondFutures.computeConversionFactor(0.04, 15.0, 2);
        check(cf4 < 1.0, "4% coupon bond must have CF < 1.0 (actual: " + cf4 + ")");

        // CTD solver test
        List<BondFutures.DeliverableBond> basket = List.of(
                new BondFutures.DeliverableBond("US-BOND-1", 112.50, 0.08, 15.0, 2, 1.25),
                new BondFutures.DeliverableBond("US-BOND-2", 98.00, 0.055, 9.0, 2, 0.80),
                new BondFutures.DeliverableBond("US-BOND-3", 101.20, 0.06, 10.0, 2, 1.00)
        );

        double futuresPrice = 100.0;
        BondFutures.CtdResult ctd = BondFutures.findCheapestToDeliver(basket, futuresPrice);
        check(ctd.bond() != null, "CTD bond must be found");
        check(ctd.basisCost() < Double.POSITIVE_INFINITY, "Valid basis cost");

        // Convexity adjustment
        double convAdj = InterestRateFutures.convexityAdjustment(0.015, 1.0, 1.25);
        assertEquals(0.5 * 0.015 * 0.015 * 1.0 * 1.25, convAdj, 1e-9, "Convexity adjustment formula");
    }

    private static void testBondAnalytics() {
        LocalDate issue = LocalDate.of(2024, 1, 1);
        LocalDate maturity = LocalDate.of(2029, 1, 1); // 5-year bond
        FixedCouponBond bond = new FixedCouponBond(
                "TEST-BOND-5Y",
                1000.0,
                0.05, // 5% coupon
                2,    // semi-annual
                issue,
                maturity,
                DayCountConvention.THIRTY_360_US,
                FinancialCalendar.weekendsOnly(),
                com.finance.pricer.core.calendar.BusinessDayConvention.UNADJUSTED
        );

        // At issue date, with YTM = 5%, dirty price should be par (1000.0)
        double dirtyPar = BondAnalytics.dirtyPriceFromYtm(bond, issue, 0.05);
        assertEquals(1000.0, dirtyPar, 1e-4, "Par bond price at 5% YTM");

        // Clean price should equal dirty price since accrued interest at issue is 0
        double cleanPar = BondAnalytics.cleanPriceFromYtm(bond, issue, 0.05);
        assertEquals(1000.0, cleanPar, 1e-4, "Clean par price");

        // Round-trip YTM test: given dirty = 1025.0, solve YTM and reprice
        double targetDirty = 1025.0;
        double solvedYtm = BondAnalytics.ytmFromDirtyPrice(bond, issue, targetDirty);
        double repricedDirty = BondAnalytics.dirtyPriceFromYtm(bond, issue, solvedYtm);
        assertEquals(targetDirty, repricedDirty, 1e-6, "YTM solver roundtrip");
        check(solvedYtm < 0.05, "Higher bond price implies lower YTM");

        // Duration & Convexity
        double macDur = BondAnalytics.macaulayDuration(bond, issue, 0.05);
        check(macDur > 4.0 && macDur < 5.0, "5Y bond Macaulay duration between 4 and 5 (actual: " + macDur + ")");
        double modDur = BondAnalytics.modifiedDuration(bond, issue, 0.05);
        assertEquals(macDur / (1.0 + 0.05 / 2.0), modDur, 1e-8, "Modified duration relationship");

        double conv = BondAnalytics.convexity(bond, issue, 0.05);
        check(conv > 0.0, "Convexity must be positive");

        double dv01 = BondAnalytics.dv01(bond, issue, 0.05);
        assertEquals(modDur * 1000.0 * 0.0001, dv01, 1e-8, "DV01 formula");

        // Z-Spread test: against spot curve
        double[] times = {1.0, 2.0, 3.0, 5.0, 10.0};
        double[] rates = {0.04, 0.042, 0.045, 0.048, 0.05};
        ZeroRateCurve spotCurve = new ZeroRateCurve(issue, DayCountConvention.THIRTY_360_US, times, rates);

        // Price bond with an exact 100 bps (0.01) spread over spotCurve
        double pvWith100Bps = 0.0;
        for (FixedCouponBond.CouponPayment cp : bond.getCashFlows()) {
            double t = bond.getDayCountConvention().yearFraction(issue, cp.paymentDate());
            double r = spotCurve.zeroRate(cp.paymentDate());
            pvWith100Bps += cp.totalCashFlow() * Math.exp(-(r + 0.01) * t);
        }

        double solvedZSpread = BondAnalytics.calculateZSpread(bond, issue, pvWith100Bps, spotCurve);
        assertEquals(0.01, solvedZSpread, 1e-6, "Z-Spread exact solver");

        // Key Rate Durations: sum of KRDs should be roughly equal to total duration
        double[] keyTenors = {1.0, 2.0, 3.0, 5.0};
        double[] krds = BondAnalytics.calculateKeyRateDurations(bond, issue, keyTenors, spotCurve);
        double sumKrd = 0.0;
        for (double k : krds) sumKrd += k;
        check(Math.abs(sumKrd - modDur) < 0.5, "Sum of KRDs aligns with modified duration (Sum=" + sumKrd + ", ModDur=" + modDur + ")");
    }

    private static void assertEquals(double expected, double actual, double tol, String msg) {
        if (Math.abs(expected - actual) > tol) {
            throw new AssertionError(msg + " -> Expected: " + expected + ", Actual: " + actual + ", Diff: " + Math.abs(expected - actual));
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
