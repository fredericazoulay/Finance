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
        return expandRootBracket(f, guessMin, guessMax, Double.NEGATIVE_INFINITY,
                Double.POSITIVE_INFINITY, false, absoluteAccuracy, relativeAccuracy, maxIterations);
    }

    public static double findRootWithBracket(DoubleUnaryOperator f, double guessMin, double guessMax,
                                             double minBound, double maxBound,
                                             double absoluteAccuracy, double relativeAccuracy, int maxIterations) {
        if (!Double.isFinite(minBound) || !Double.isFinite(maxBound) || minBound >= maxBound) {
            throw new IllegalArgumentException("Bounds must be finite and minBound must be less than maxBound");
        }
        if (guessMin < minBound || guessMax > maxBound) {
            throw new IllegalArgumentException("Initial bracket must lie within the specified bounds");
        }
        return expandRootBracket(f, guessMin, guessMax, minBound, maxBound, true,
                absoluteAccuracy, relativeAccuracy, maxIterations);
    }

    private static double expandRootBracket(DoubleUnaryOperator f, double guessMin, double guessMax,
                                            double minBound, double maxBound, boolean bounded,
                                            double absoluteAccuracy, double relativeAccuracy, int maxIterations) {
        validateArguments(f, guessMin, guessMax, absoluteAccuracy, relativeAccuracy, maxIterations);
        double a = guessMin;
        double b = guessMax;
        double fa = evaluate(f, a);
        double fb = evaluate(f, b);

        int bracketSteps = 0;
        double factor = 1.6;
        while (sameSign(fa, fb) && bracketSteps < 50) {
            double range = b - a;
            double expandedA = a - factor * range;
            double expandedB = b + factor * range;
            if (bounded) {
                expandedA = Math.max(minBound, expandedA);
                expandedB = Math.min(maxBound, expandedB);
            }
            if (!Double.isFinite(expandedA) || !Double.isFinite(expandedB)) {
                throw new ArithmeticException("Unable to expand root bracket within finite bounds");
            }
            if (expandedA == a && expandedB == b) break;
            a = expandedA;
            b = expandedB;
            fa = evaluate(f, a);
            fb = evaluate(f, b);
            bracketSteps++;
        }

        if (sameSign(fa, fb)) {
            throw new IllegalArgumentException("Unable to bracket root in expanded range [" + a + ", " + b + "]");
        }

        return findRoot(f, a, b, absoluteAccuracy, relativeAccuracy, maxIterations);
    }

    /**
     * Finds the root of f(x) = 0 in [min, max] with specified accuracies and maximum iterations.
     */
    public static double findRoot(DoubleUnaryOperator f, double min, double max,
                                  double absoluteAccuracy, double relativeAccuracy, int maxIterations) {
        validateArguments(f, min, max, absoluteAccuracy, relativeAccuracy, maxIterations);

        double a = min;
        double b = max;
        double fa = evaluate(f, a);
        double fb = evaluate(f, b);

        if (fa == 0.0) return a;
        if (fb == 0.0) return b;

        if (sameSign(fa, fb)) {
            throw new IllegalArgumentException("Root is not bracketed: f(" + min + ")=" + fa + ", f(" + max + ")=" + fb);
        }

        double c = a;
        double fc = fa;
        double d = b - a;
        double e = d;

        for (int i = 0; i < maxIterations; i++) {
            if (sameSign(fb, fc)) {
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

                double tol = absoluteAccuracy + relativeAccuracy * Math.abs(b)
                    + 2.0 * 2.220446049250313e-16 * Math.abs(b);
            double m = 0.5 * (c - b);

            if (Math.abs(m) <= tol) {
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

            fb = evaluate(f, b);
        }

        throw new ArithmeticException("Brent solver did not converge after " + maxIterations + " iterations");
    }

    private static void validateArguments(DoubleUnaryOperator f, double min, double max,
                                          double absoluteAccuracy, double relativeAccuracy, int maxIterations) {
        if (f == null) throw new IllegalArgumentException("Function must not be null");
        if (!Double.isFinite(min) || !Double.isFinite(max) || min >= max) {
            throw new IllegalArgumentException("min and max must be finite and min must be less than max");
        }
        if (!Double.isFinite(absoluteAccuracy) || absoluteAccuracy < 0.0
                || !Double.isFinite(relativeAccuracy) || relativeAccuracy < 0.0 || relativeAccuracy >= 1.0
                || (absoluteAccuracy == 0.0 && relativeAccuracy == 0.0)) {
            throw new IllegalArgumentException("Accuracy tolerances must be finite, non-negative, and not both zero");
        }
        if (maxIterations <= 0) throw new IllegalArgumentException("maxIterations must be positive");
    }

    private static double evaluate(DoubleUnaryOperator f, double x) {
        double value = f.applyAsDouble(x);
        if (!Double.isFinite(value)) {
            throw new ArithmeticException("Function returned a non-finite value at " + x);
        }
        return value;
    }

    private static boolean sameSign(double left, double right) {
        return (left > 0.0 && right > 0.0) || (left < 0.0 && right < 0.0);
    }
}

