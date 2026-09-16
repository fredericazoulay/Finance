package com.finance.pricer;

final class NormalDistribution {
    private NormalDistribution() { }

    static double cdf(double x) {
        double sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.sqrt(2.0);
        double t = 1.0 / (1.0 + 0.3275911 * x);
        double polynomial = (((((1.061405429 * t - 1.453152027) * t)
                + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
        double erf = 1.0 - polynomial * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * erf);
    }
}
