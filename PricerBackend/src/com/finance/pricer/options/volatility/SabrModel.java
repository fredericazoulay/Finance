package com.finance.pricer.options.volatility;

/**
 * Stochastic Alpha Beta Rho (SABR) volatility smile model (Hagan et al. 2002; Hull Chapter 25).
 * Generates continuous implied Black volatility smiles across all strikes.
 *
 * Dynamics:
 * dF_t = alpha_t * F_t^beta * dW_1
 * d(alpha_t) = nu * alpha_t * dW_2
 * d<W_1, W_2> = rho * dt
 */
public class SabrModel {

    private final double alpha; // initial volatility level
    private final double beta;  // CEV elasticity parameter (0 <= beta <= 1, e.g. 0.5 for CIR, 1.0 for lognormal)
    private final double rho;   // correlation between underlying asset and volatility (-1 < rho < 1)
    private final double nu;    // volatility of volatility (vol-of-vol, nu >= 0)

    public SabrModel(double alpha, double beta, double rho, double nu) {
        if (alpha <= 0.0) throw new IllegalArgumentException("alpha must be positive");
        if (beta < 0.0 || beta > 1.0) throw new IllegalArgumentException("beta must be in [0, 1]");
        if (rho <= -1.0 || rho >= 1.0) throw new IllegalArgumentException("rho must be in (-1, 1)");
        if (nu < 0.0) throw new IllegalArgumentException("nu must be non-negative");

        this.alpha = alpha;
        this.beta = beta;
        this.rho = rho;
        this.nu = nu;
    }

    /**
     * Hagan's asymptotic formula for implied Black volatility sigma_B(K, F).
     *
     * @param forward forward price F
     * @param strike strike price K
     * @param timeToMaturity time to expiration T in years
     * @return implied Black-76 volatility
     */
    public double impliedVolatility(double forward, double strike, double timeToMaturity) {
        if (forward <= 0.0 || strike <= 0.0) {
            throw new IllegalArgumentException("Forward and Strike must be strictly positive");
        }
        if (timeToMaturity <= 0.0) {
            return alpha;
        }

        double f = forward;
        double k = strike;
        double t = timeToMaturity;

        // ATM case (F == K)
        if (Math.abs(f - k) < 1e-8) {
            double f1MinusBeta = Math.pow(f, 1.0 - beta);
            double term1 = ((1.0 - beta) * (1.0 - beta) / 24.0) * (alpha * alpha) / Math.pow(f, 2.0 - 2.0 * beta);
            double term2 = 0.25 * (rho * beta * nu * alpha) / f1MinusBeta;
            double term3 = ((2.0 - 3.0 * rho * rho) / 24.0) * (nu * nu);
            return (alpha / f1MinusBeta) * (1.0 + (term1 + term2 + term3) * t);
        }

        double logFOverK = Math.log(f / k);
        double fK = f * k;
        double sqrtFK = Math.sqrt(fK);
        double powFK1MinusBeta = Math.pow(fK, 0.5 * (1.0 - beta));

        double z = (nu / alpha) * powFK1MinusBeta * logFOverK;
        double xZ;

        if (Math.abs(z) < 1e-8) {
            xZ = 1.0;
        } else {
            double termSqrt = Math.sqrt(1.0 - 2.0 * rho * z + z * z);
            double numerator = termSqrt + z - rho;
            double denom = 1.0 - rho;
            double chiZ = Math.log(numerator / denom);
            xZ = z / chiZ;
        }

        double denomSeries = 1.0
                + ((1.0 - beta) * (1.0 - beta) / 24.0) * (logFOverK * logFOverK)
                + (Math.pow(1.0 - beta, 4.0) / 1920.0) * Math.pow(logFOverK, 4.0);

        double bracketTerm = 1.0 + (
                ((1.0 - beta) * (1.0 - beta) / 24.0) * (alpha * alpha) / Math.pow(fK, 1.0 - beta)
                        + 0.25 * (rho * beta * nu * alpha) / powFK1MinusBeta
                        + ((2.0 - 3.0 * rho * rho) / 24.0) * (nu * nu)
        ) * t;

        return (alpha / (powFK1MinusBeta * denomSeries)) * xZ * bracketTerm;
    }

    public double getAlpha() { return alpha; }
    public double getBeta() { return beta; }
    public double getRho() { return rho; }
    public double getNu() { return nu; }
}

