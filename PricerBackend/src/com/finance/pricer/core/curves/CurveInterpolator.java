package com.finance.pricer.core.curves;

import java.util.Arrays;

/**
 * Strategy interface for mathematical interpolation across curve pillars.
 */
public interface CurveInterpolator {

    /**
     * Interpolate the value at {@code targetX} given strictly increasing nodes {@code x} and values {@code y}.
     *
     * @param x strictly increasing x-coordinates (e.g. maturities)
     * @param y corresponding y-coordinates (e.g. rates or discount factors)
     * @param targetX target x-coordinate
     * @return interpolated y value
     */
    double interpolate(double[] x, double[] y, double targetX);

    /**
     * Standard Linear Interpolator. Flat extrapolation beyond bounds.
     */
    class Linear implements CurveInterpolator {
        @Override
        public double interpolate(double[] x, double[] y, double targetX) {
            validateInputs(x, y);
            int n = x.length;
            if (targetX <= x[0]) return y[0];
            if (targetX >= x[n - 1]) return y[n - 1];

            int idx = Arrays.binarySearch(x, targetX);
            if (idx >= 0) return y[idx];

            int insertionPoint = -idx - 1;
            int i = insertionPoint - 1;
            double dx = x[i + 1] - x[i];
            double dy = y[i + 1] - y[i];
            return y[i] + (targetX - x[i]) * dy / dx;
        }
    }

    /**
     * Log-Linear Interpolator: linear interpolation on ln(y), so y(x) = y_i * (y_{i+1}/y_i)^((x-x_i)/(x_{i+1}-x_i)).
     * Standard for discount factor interpolation to ensure piecewise constant forward rates.
     */
    class LogLinear implements CurveInterpolator {
        @Override
        public double interpolate(double[] x, double[] y, double targetX) {
            validateInputs(x, y);
            int n = x.length;
            if (targetX <= x[0]) return y[0];
            if (targetX >= x[n - 1]) {
                // Extrapolate with the last forward rate
                double lastDt = x[n - 1] - x[n - 2];
                double lastFwd = -Math.log(y[n - 1] / y[n - 2]) / lastDt;
                return y[n - 1] * Math.exp(-lastFwd * (targetX - x[n - 1]));
            }

            int idx = Arrays.binarySearch(x, targetX);
            if (idx >= 0) return y[idx];

            int insertionPoint = -idx - 1;
            int i = insertionPoint - 1;
            double t = (targetX - x[i]) / (x[i + 1] - x[i]);
            return Math.exp(Math.log(y[i]) + t * (Math.log(y[i + 1]) - Math.log(y[i])));
        }
    }

    /**
     * Natural Cubic Spline with tridiagonal solver, yielding C2-continuous curves (continuous 1st and 2nd derivatives).
     */
    class CubicSpline implements CurveInterpolator {
        @Override
        public double interpolate(double[] x, double[] y, double targetX) {
            validateInputs(x, y);
            int n = x.length;
            if (n == 2) {
                return new Linear().interpolate(x, y, targetX);
            }
            if (targetX <= x[0]) return y[0];
            if (targetX >= x[n - 1]) return y[n - 1];

            // Compute second derivatives y'' using Thomas algorithm for tridiagonal system
            double[] h = new double[n - 1];
            for (int i = 0; i < n - 1; i++) {
                h[i] = x[i + 1] - x[i];
            }

            double[] alpha = new double[n - 1];
            for (int i = 1; i < n - 1; i++) {
                alpha[i] = (3.0 / h[i]) * (y[i + 1] - y[i]) - (3.0 / h[i - 1]) * (y[i] - y[i - 1]);
            }

            double[] l = new double[n];
            double[] mu = new double[n];
            double[] z = new double[n];
            l[0] = 1.0;
            mu[0] = 0.0;
            z[0] = 0.0;

            for (int i = 1; i < n - 1; i++) {
                l[i] = 2.0 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1];
                mu[i] = h[i] / l[i];
                z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
            }

            l[n - 1] = 1.0;
            z[n - 1] = 0.0;
            double[] c = new double[n];
            c[n - 1] = 0.0;

            for (int j = n - 2; j >= 0; j--) {
                c[j] = z[j] - mu[j] * c[j + 1];
            }

            int idx = Arrays.binarySearch(x, targetX);
            if (idx >= 0) return y[idx];
            int i = -idx - 2;

            double dx = targetX - x[i];
            double b = (y[i + 1] - y[i]) / h[i] - h[i] * (c[i + 1] + 2.0 * c[i]) / 3.0;
            double d = (c[i + 1] - c[i]) / (3.0 * h[i]);

            return y[i] + b * dx + c[i] * dx * dx + d * dx * dx * dx;
        }
    }

    /**
     * Monotone Convex Interpolator (Hagan & West 2006).
     * Prevents negative forward rates and artificial unphysical oscillations between yield curve nodes.
     */
    class MonotoneConvex implements CurveInterpolator {
        @Override
        public double interpolate(double[] x, double[] y, double targetX) {
            validateInputs(x, y);
            int n = x.length;
            if (n < 3) {
                return new Linear().interpolate(x, y, targetX);
            }
            if (targetX <= x[0]) return y[0];
            if (targetX >= x[n - 1]) return y[n - 1];

            // Estimate discrete slopes
            double[] m = new double[n];
            for (int i = 1; i < n - 1; i++) {
                double h1 = x[i] - x[i - 1];
                double h2 = x[i + 1] - x[i];
                double d1 = (y[i] - y[i - 1]) / h1;
                double d2 = (y[i + 1] - y[i]) / h2;
                if (d1 * d2 <= 0) {
                    m[i] = 0.0;
                } else {
                    // Harmonic mean to enforce monotonicity
                    m[i] = 2.0 * d1 * d2 / (d1 + d2);
                }
            }
            m[0] = (y[1] - y[0]) / (x[1] - x[0]);
            m[n - 1] = (y[n - 1] - y[n - 2]) / (x[n - 1] - x[n - 2]);

            int idx = Arrays.binarySearch(x, targetX);
            if (idx >= 0) return y[idx];
            int i = -idx - 2;

            double h = x[i + 1] - x[i];
            double t = (targetX - x[i]) / h;
            double t2 = t * t;
            double t3 = t2 * t;

            // Hermite cubic spline basis
            double h00 = 2 * t3 - 3 * t2 + 1;
            double h10 = t3 - 2 * t2 + t;
            double h01 = -2 * t3 + 3 * t2;
            double h11 = t3 - t2;

            return h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1];
        }
    }

    private static void validateInputs(double[] x, double[] y) {
        if (x == null || y == null || x.length != y.length || x.length < 2) {
            throw new IllegalArgumentException("x and y arrays must be non-null, have equal length and at least 2 points.");
        }
    }
}

