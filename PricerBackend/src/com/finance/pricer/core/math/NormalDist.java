package com.finance.pricer.core.math;

/**
 * Standard Normal Distribution calculations:
 * - PDF (Probability Density Function)
 * - Univariate CDF (Cumulative Distribution Function) using high-precision error function
 * - Inverse CDF (Quantile / Probit function) via Peter J. Acklam's algorithm
 * - Bivariate Normal CDF M(a, b; rho) using Gauss-Legendre quadrature
 * 
 * References:
 * - John C. Hull, "Options, Futures, and Other Derivatives", Technical Notes 5 & Appendix
 * - Peter J. Acklam, "An algorithm for computing the inverse normal cumulative distribution function"
 */
public final class NormalDist {

    private static final double SQRT_2PI = Math.sqrt(2.0 * Math.PI);
    private static final double ONE_OVER_SQRT_2PI = 1.0 / SQRT_2PI;
    private static final double SQRT_2 = Math.sqrt(2.0);

    // Coefficients for Acklam's inverse normal CDF algorithm
    private static final double[] A = {
            -3.969683028665376e+01,
            2.209460984245205e+02,
            -2.759285104469687e+02,
            1.383577518672690e+02,
            -3.066479806614716e+01,
            2.506628277459239e+00
    };

    private static final double[] B = {
            -5.447609879822406e+01,
            1.615858368580409e+02,
            -1.556989798598866e+02,
            6.680131188771972e+01,
            -1.328068155288572e+01
    };

    private static final double[] C = {
            -7.784894002430293e-03,
            -3.223964580411365e-01,
            -2.400758277161838e+00,
            -2.549732539343734e+00,
            4.374664141464968e+00,
            2.938163982698783e+00
    };

    private static final double[] D = {
            7.784695709041462e-03,
            3.224671290700398e-01,
            2.445134137142996e+00,
            3.754408661907416e+00
    };

    private static final double P_LOW = 0.02425;
    private static final double P_HIGH = 1.0 - P_LOW;

    // Gauss-Legendre 10-point quadrature abscissas and weights on [-1, 1]
    private static final double[] GL_X = {
            -0.9739065285171717,
            -0.8650633666889845,
            -0.6794095682990244,
            -0.4333953941292472,
            -0.1488743389816312,
            0.1488743389816312,
            0.4333953941292472,
            0.6794095682990244,
            0.8650633666889845,
            0.9739065285171717
    };

    private static final double[] GL_W = {
            0.0666713443086881,
            0.1494513491505806,
            0.2190863625159820,
            0.2692667193099963,
            0.2955242247147529,
            0.2955242247147529,
            0.2692667193099963,
            0.2190863625159820,
            0.1494513491505806,
            0.0666713443086881
    };

    private NormalDist() { }

    /**
     * Standard normal probability density function: phi(x) = (1/sqrt(2*pi)) * exp(-x^2 / 2)
     */
    public static double pdf(double x) {
        return ONE_OVER_SQRT_2PI * Math.exp(-0.5 * x * x);
    }

    /**
     * Standard normal cumulative distribution function Phi(x)
     * High precision numerical approximation (error < 7.5e-8).
     */
    public static double cdf(double x) {
        if (Double.isNaN(x)) return Double.NaN;
        if (x == 0.0) return 0.5;
        if (x < -10.0) return 0.0;
        if (x > 10.0) return 1.0;

        double sign = x < 0 ? -1 : 1;
        double absX = Math.abs(x) / SQRT_2;
        double t = 1.0 / (1.0 + 0.3275911 * absX);
        double polynomial = (((((1.061405429 * t - 1.453152027) * t)
                + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
        double erf = 1.0 - polynomial * Math.exp(-absX * absX);
        return 0.5 * (1.0 + sign * erf);
    }

    /**
     * Inverse normal cumulative distribution function (Quantile / Probit function).
     * Computes x such that Phi(x) = p, for p in (0, 1).
     */
    public static double inverseCdf(double p) {
        if (p <= 0.0 || p >= 1.0) {
            throw new IllegalArgumentException("Probability p must be strictly in (0, 1), got: " + p);
        }

        if (p < P_LOW) {
            // Rational approximation for lower region
            double q = Math.sqrt(-2.0 * Math.log(p));
            return (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5])
                    / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0);
        } else if (p <= P_HIGH) {
            // Rational approximation for central region
            double q = p - 0.5;
            double r = q * q;
            return (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q
                    / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1.0);
        } else {
            // Rational approximation for upper region
            double q = Math.sqrt(-2.0 * Math.log(1.0 - p));
            return -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5])
                    / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0);
        }
    }

    /**
     * Bivariate normal cumulative distribution function:
     * M(a, b; rho) = P(X <= a, Y <= b) where X, Y ~ N(0, 1) with correlation rho.
     * Uses Gauss-Legendre quadrature on the integral of the derivative wrt rho.
     */
    public static double bivariateCdf(double a, double b, double rho) {
        if (Math.abs(rho) > 1.0) {
            throw new IllegalArgumentException("Correlation rho must be in [-1, 1], got: " + rho);
        }
        if (Double.isNaN(a) || Double.isNaN(b) || Double.isNaN(rho)) {
            return Double.NaN;
        }

        // Boundary cases
        if (Math.abs(rho - 1.0) < 1e-12) {
            return cdf(Math.min(a, b));
        }
        if (Math.abs(rho + 1.0) < 1e-12) {
            return a + b <= 0 ? Math.max(0.0, cdf(a) + cdf(b) - 1.0) : Math.max(0.0, cdf(a) - cdf(-b));
        }
        if (Math.abs(rho) < 1e-12) {
            return cdf(a) * cdf(b);
        }

        // When a or b are very large in magnitude
        if (a <= -10.0 || b <= -10.0) return 0.0;
        if (a >= 10.0) return cdf(b);
        if (b >= 10.0) return cdf(a);

        // M(a, b; rho) = Phi(a) * Phi(b) + integral from 0 to rho of [ 1 / (2*pi*sqrt(1-z^2)) * exp(-(a^2 + b^2 - 2*a*b*z)/(2*(1-z^2))) ] dz
        double integral = 0.0;
        double halfRho = 0.5 * rho;
        for (int i = 0; i < GL_X.length; i++) {
            double z = halfRho * (GL_X[i] + 1.0); // map [-1, 1] to [0, rho]
            double oneMinusZ2 = 1.0 - z * z;
            if (oneMinusZ2 > 1e-14) {
                double exponent = -(a * a + b * b - 2.0 * a * b * z) / (2.0 * oneMinusZ2);
                double integrand = Math.exp(exponent) / (2.0 * Math.PI * Math.sqrt(oneMinusZ2));
                integral += GL_W[i] * integrand;
            }
        }
        integral *= halfRho;

        double result = cdf(a) * cdf(b) + integral;
        return Math.max(0.0, Math.min(1.0, result));
    }
}
