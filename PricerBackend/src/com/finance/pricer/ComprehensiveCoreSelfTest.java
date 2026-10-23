package com.finance.pricer;

import com.finance.pricer.core.calendar.*;
import com.finance.pricer.core.curves.*;
import com.finance.pricer.core.math.*;

import java.time.LocalDate;

public final class ComprehensiveCoreSelfTest {

    public static void main(String[] args) {
        testNormalDist();
        testBrentSolver();
        testCholesky();
        testDayCounts();
        testFinancialCalendar();
        testCurvesAndInterpolation();
        System.out.println("All Phase 1 Core Self-Tests PASSED successfully!");
    }

    private static void testNormalDist() {
        // N(0) = 0.5
        assertEquals(0.5, NormalDist.cdf(0.0), 1e-10, "N(0) must be 0.5");
        // N(1.95996398454) = 0.975
        assertEquals(0.975, NormalDist.cdf(1.95996398454), 1e-6, "N(1.96) test");
        // Symmetry: N(-x) = 1 - N(x)
        assertEquals(1.0 - NormalDist.cdf(1.2345), NormalDist.cdf(-1.2345), 1e-12, "Symmetry failed");
        // Inverse CDF
        assertEquals(0.0, NormalDist.inverseCdf(0.5), 1e-9, "invN(0.5) must be 0");
        assertEquals(1.95996, NormalDist.inverseCdf(0.975), 1e-4, "invN(0.975) must be 1.96");
        // Bivariate CDF: M(0, 0; 0) = 0.25
        assertEquals(0.25, NormalDist.bivariateCdf(0.0, 0.0, 0.0), 1e-6, "M(0,0;0) must be 0.25");
        // M(x, y; 1) = N(min(x, y))
        assertEquals(NormalDist.cdf(-0.5), NormalDist.bivariateCdf(-0.5, 0.8, 0.999999), 1e-4, "M(x, y; 1)");
    }

    private static void testBrentSolver() {
        // Find root of f(x) = x^3 - x - 2 (root is x approx 1.5213797)
        double root = BrentSolver.findRoot(x -> x * x * x - x - 2.0, 1.0, 2.0);
        assertEquals(1.5213797068, root, 1e-8, "Brent cubic root");

        // Test bracket expansion
        double root2 = BrentSolver.findRootWithBracket(x -> Math.exp(x) - 10.0, 0.0, 1.0);
        assertEquals(Math.log(10.0), root2, 1e-8, "Brent exp root");
    }

    private static void testCholesky() {
        double[][] cov = {
                {4.0, 1.2, -0.8},
                {1.2, 9.0, 2.4},
                {-0.8, 2.4, 16.0}
        };
        CholeskyDecomposition chol = new CholeskyDecomposition(cov);
        double[][] L = chol.getL();
        assertEquals(2.0, L[0][0], 1e-8, "L[0][0]");
        assertEquals(0.6, L[1][0], 1e-8, "L[1][0]");
        // Verify L * L^T matches cov
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j <= i; j++) {
                double sum = 0;
                for (int k = 0; k < 3; k++) sum += L[i][k] * L[j][k];
                assertEquals(cov[i][j], sum, 1e-8, "Reconstructed cov[" + i + "][" + j + "]");
            }
        }
    }

    private static void testDayCounts() {
        LocalDate d1 = LocalDate.of(2024, 2, 1);
        LocalDate d2 = LocalDate.of(2024, 8, 1); // Leap year 2024
        // ACT/360: 182 days / 360 = 0.505555...
        assertEquals(182.0 / 360.0, DayCountConvention.ACT_360.yearFraction(d1, d2), 1e-10, "ACT/360");
        // ACT/365F: 182 days / 365
        assertEquals(182.0 / 365.0, DayCountConvention.ACT_365F.yearFraction(d1, d2), 1e-10, "ACT/365F");
        // 30/360 US: Feb 1 to Aug 1 is 6 months = 180 days -> 180/360 = 0.5
        assertEquals(0.5, DayCountConvention.THIRTY_360_US.yearFraction(d1, d2), 1e-10, "30/360 US");

        // ACT/ACT ISDA spanning leap year: 2023-07-01 to 2024-07-01
        LocalDate start = LocalDate.of(2023, 7, 1);
        LocalDate end = LocalDate.of(2024, 7, 1);
        double frac = DayCountConvention.ACT_ACT_ISDA.yearFraction(start, end);
        // 184 days in 2023 (/365) + 182 days in 2024 (/366)
        double expected = (184.0 / 365.0) + (182.0 / 366.0);
        assertEquals(expected, frac, 1e-10, "ACT/ACT ISDA");
    }

    private static void testFinancialCalendar() {
        FinancialCalendar target2 = FinancialCalendar.of(FinancialCalendar.Center.TARGET2);
        // Easter Sunday 2024 was March 31, 2024
        assertEquals(LocalDate.of(2024, 3, 31), FinancialCalendar.computeEasterSunday(2024), "Easter 2024");
        // Good Friday 2024: March 29
        check(!target2.isBusinessDay(LocalDate.of(2024, 3, 29)), "Good Friday is a holiday in TARGET2");
        // Easter Monday 2024: April 1
        check(!target2.isBusinessDay(LocalDate.of(2024, 4, 1)), "Easter Monday is a holiday in TARGET2");
        // May 1 (Labour Day)
        check(!target2.isBusinessDay(LocalDate.of(2024, 5, 1)), "Labour Day is a holiday in TARGET2");

        // Business Day Convention: Modified Following
        // Sunday March 31 -> Monday April 1 is holiday -> Tuesday April 2
        LocalDate adj = target2.adjust(LocalDate.of(2024, 3, 31), BusinessDayConvention.MODIFIED_FOLLOWING);
        // Since April 2 is next month, modified following rolls back to preceding: Thursday March 28
        assertEquals(LocalDate.of(2024, 3, 28), adj, "Modified following over month end");
    }

    private static void testCurvesAndInterpolation() {
        LocalDate refDate = LocalDate.of(2024, 1, 1);
        double[] times = {0.5, 1.0, 2.0, 5.0, 10.0};
        double[] zeroRates = {0.03, 0.032, 0.035, 0.04, 0.045};

        ZeroRateCurve zeroCurve = new ZeroRateCurve(refDate, DayCountConvention.ACT_365F, times, zeroRates, new CurveInterpolator.Linear());
        // At t = 1.0, rate should be 0.032
        assertEquals(0.032, zeroCurve.zeroRate(1.0), 1e-10, "Zero rate at 1.0");
        // Discount factor at t = 1.0 should be exp(-0.032 * 1)
        assertEquals(Math.exp(-0.032), zeroCurve.discountFactor(1.0), 1e-10, "DF at 1.0");
        // Interpolated zero rate at t = 1.5: (0.032 + 0.035)/2 = 0.0335
        assertEquals(0.0335, zeroCurve.zeroRate(1.5), 1e-10, "Interpolated zero rate at 1.5");

        // Monotone convex interpolator
        ZeroRateCurve mcCurve = new ZeroRateCurve(refDate, DayCountConvention.ACT_365F, times, zeroRates, new CurveInterpolator.MonotoneConvex());
        double mcRate = mcCurve.zeroRate(1.5);
        check(mcRate >= 0.032 && mcRate <= 0.035, "Monotone convex bounded in interval");

        // Cubic spline
        ZeroRateCurve splineCurve = new ZeroRateCurve(refDate, DayCountConvention.ACT_365F, times, zeroRates, new CurveInterpolator.CubicSpline());
        assertEquals(0.032, splineCurve.zeroRate(1.0), 1e-8, "Spline at node 1.0");

        // Discount factor curve with LogLinear
        double[] dfs = new double[times.length];
        for (int i = 0; i < times.length; i++) {
            dfs[i] = Math.exp(-zeroRates[i] * times[i]);
        }
        DiscountFactorCurve dfCurve = new DiscountFactorCurve(refDate, DayCountConvention.ACT_365F, times, dfs);
        assertEquals(dfs[1], dfCurve.discountFactor(1.0), 1e-10, "LogLinear DF at 1.0");

        // Forward rate between 1.0 and 2.0
        double fwd = dfCurve.forwardRateContinuous(1.0, 2.0);
        // ln(P(1)/P(2)) / 1 = (-0.032 + 0.035*2) = 0.038
        assertEquals(0.038, fwd, 1e-10, "Continuous forward rate");

        // MultiCurveContext
        MultiCurveContext multiCurve = new MultiCurveContext(dfCurve);
        assertEquals(dfCurve.discountFactor(2.0), multiCurve.getDiscountCurve().discountFactor(2.0), 1e-10, "MultiCurve");
    }

    private static void assertEquals(double expected, double actual, double tol, String msg) {
        if (Math.abs(expected - actual) > tol) {
            throw new AssertionError(msg + " -> Expected: " + expected + ", Actual: " + actual + ", Diff: " + Math.abs(expected - actual));
        }
    }

    private static void assertEquals(Object expected, Object actual, String msg) {
        if (!expected.equals(actual)) {
            throw new AssertionError(msg + " -> Expected: " + expected + ", Actual: " + actual);
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
