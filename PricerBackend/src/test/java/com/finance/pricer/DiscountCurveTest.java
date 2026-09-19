package com.finance.pricer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DiscountCurveTest {
    private static final double TOLERANCE = 1e-10;

    @Test
    void constructsFromZeroRatesAndInterpolatesDiscountFactors() {
        DiscountCurve curve = DiscountCurve.fromZeroRates(new double[]{1, 2}, new double[]{0.05, 0.05});

        assertEquals(Math.exp(-0.05), curve.discountFactor(1), TOLERANCE);
        assertEquals(Math.exp(-0.075), curve.discountFactor(1.5), TOLERANCE);
        assertEquals(Math.exp(-0.05 * 3), curve.discountFactor(3), TOLERANCE);
    }

    @Test
    void returnsUnitDiscountAtNonPositiveMaturityAndExposesCopyOfMaturities() {
        DiscountCurve curve = new DiscountCurve(new double[]{1, 2}, new double[]{0.95, 0.9});
        double[] maturities = curve.maturities();
        maturities[0] = 99;

        assertEquals(1, curve.discountFactor(0), TOLERANCE);
        assertEquals(1, curve.discountFactor(-1), TOLERANCE);
        assertArrayEquals(new double[]{1, 2}, curve.maturities());
    }

    @Test
    void calculatesForwardAndParRates() {
        DiscountCurve curve = DiscountCurve.fromZeroRates(new double[]{1, 2}, new double[]{0.05, 0.05});

        assertEquals((curve.discountFactor(1) / curve.discountFactor(2) - 1),
                curve.forwardRate(1, 2), TOLERANCE);
        assertEquals(0.05, curve.parRate(2, 1), TOLERANCE);
        assertThrows(IllegalArgumentException.class, () -> curve.forwardRate(2, 1));
    }

    @Test
    void rejectsInvalidCurvePillars() {
        assertThrows(IllegalArgumentException.class, () -> new DiscountCurve(new double[0], new double[0]));
        assertThrows(IllegalArgumentException.class, () -> new DiscountCurve(new double[]{1}, new double[]{0.9, 0.8}));
        assertThrows(IllegalArgumentException.class, () -> new DiscountCurve(new double[]{1, 1}, new double[]{0.9, 0.8}));
        assertThrows(IllegalArgumentException.class, () -> new DiscountCurve(new double[]{0}, new double[]{0.9}));
    }
}
