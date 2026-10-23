package com.finance.pricer;

public record OptionGreeks(double delta, double gamma, double theta, double vega, double rho) {
}
