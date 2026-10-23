package com.finance.pricer.core.math;

import java.util.function.DoubleUnaryOperator;

/**
 * Root finding via Brent's method (combines bisection, secant method, and inverse quadratic interpolation).
 * Guaranteed superlinear convergence and robust bracketing.
 * 
 * Used for:
 * - Yield to Maturity (YTM)
 * - Implied Volatility
 * - CDS Implied Hazard Rate
 * - Internal Rate of Return (IRR)
 * - American Option early exercise boundary calculations
 */
public final class BrentSolver {

    private static final int DEFAULT_MAX_ITERATIONS = 150;
    private static final double DEFAULT_ABSOLUTE_ACCURACY = 1e-10;
    private static final double DEFAULT_RELATIVE_ACCURACY = 1e-10;

    private BrentSolver() { }

    /**
     * Finds the root of f(x) = 0 in the interval [min, max].
     */
    public static double findRoot(DoubleUnaryOperator f, double min, double max) {
        return findRoot(f, min, max, DEFAULT_ABSOLUTE_ACCURACY, DEFAULT_RELATIVE_ACCURACY, DEFAULT_MAX_ITERATIONS);
    }

    /**
     * Finds the root of f(x) = 0 by expanding initial interval [guessMin, guessMax] if needed.
     */
    public static double findRootWithBracket(DoubleUnaryOperator f, double guessMin, double guessMax) {
        return findRootWithBracket(f, guessMin, guessMax, DEFAULT_ABSOLUTE_ACCURACY, DEFAULT_RELATIVE_ACCURACY, DEFAULT_MAX_ITERATIONS);
    }

    public static double findRootWithBracket(DoubleUnaryOperator f, double guessMin, double guessMax,
                                             double absoluteAccuracy, double relativeAccuracy, int maxIterations) {
        double a = guessMin;
        double b = guessMax;
        double fa = f.applyAsDouble(a);
        double fb = f.applyAsDouble(b);

        int bracketSteps = 0;
        double factor = 1.6;
        while (fa * fb > 0.0 && bracketSteps < 50) {
            double range = b - a;
            a -= factor * range;
            b += factor * range;
            fa = f.applyAsDouble(a);
            fb = f.applyAsDouble(b);
            bracketSteps++;
        }

        if (fa * fb > 0.0) {
            throw new IllegalArgumentException("Unable to bracket root in expanded range [" + a + ", " + b + "]");
        }

        return findRoot(f, a, b, absoluteAccuracy, relativeAccuracy, maxIterations);
    }

    /**
     * Finds the root of f(x) = 0 in [min, max] with specified accuracies and maximum iterations.
     */
    public static double findRoot(DoubleUnaryOperator f, double min, double max,
                                  double absoluteAccuracy, double relativeAccuracy, int maxIterations) {
        if (min >= max) {
            throw new IllegalArgumentException("min must be strictly less than max: [" + min + ", " + max + "]");
        }

        double a = min;
        double b = max;
        double fa = f.applyAsDouble(a);
        double fb = f.applyAsDouble(b);

        if (Math.abs(fa) <= absoluteAccuracy) return a;
        if (Math.abs(fb) <= absoluteAccuracy) return b;

        if (fa * fb > 0.0) {
            throw new IllegalArgumentException("Root is not bracketed: f(" + min + ")=" + fa + ", f(" + max + ")=" + fb);
        }

        double c = a;
        double fc = fa;
        double d = b - a;
        double e = d;

        for (int i = 0; i < maxIterations; i++) {
            if (fb * fc > 0.0) {
                c = a;
                fc = fa;
                d = b - a;
                e = d;
            }

            if (Math.abs(fc) < Math.abs(fb)) {
                a = b;
                b = c;
                c = a;
                fa = fb;
                fb = fc;
                fc = fa;
            }

            double tol = 2.0 * 2.220446049250313e-16 * Math.abs(b) + 0.5 * absoluteAccuracy;
            double m = 0.5 * (c - b);

            if (Math.abs(m) <= tol || Math.abs(fb) <= absoluteAccuracy) {
                return b;
            }

            if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
                double s = fb / fa;
                double p;
                double q;

                if (Math.abs(a - c) < 1e-15) {
                    // Linear interpolation (secant)
                    p = 2.0 * m * s;
                    q = 1.0 - s;
                } else {
                    // Inverse quadratic interpolation
                    q = fa / fc;
                    double r = fb / fc;
                    p = s * (2.0 * m * q * (q - r) - (b - a) * (r - 1.0));
                    q = (q - 1.0) * (r - 1.0) * (s - 1.0);
                }

                if (p > 0.0) {
                    q = -q;
                } else {
                    p = -p;
                }

                s = e;
                e = d;

                if (2.0 * p < 3.0 * m * q - Math.abs(tol * q) && p < Math.abs(0.5 * s * q)) {
                    d = p / q;
                } else {
                    d = m;
                    e = d;
                }
            } else {
                // Bisection step
                d = m;
                e = d;
            }

            a = b;
            fa = fb;

            if (Math.abs(d) > tol) {
                b += d;
            } else if (m > 0.0) {
                b += tol;
            } else {
                b -= tol;
            }

            fb = f.applyAsDouble(b);
        }

        return b;
    }
}

