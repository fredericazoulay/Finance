package com.finance.pricer;

public record MarketData(double spot, double riskFreeRate, double volatility, double dividendYield) {
    public MarketData {
        if (spot < 0 || volatility < 0 || riskFreeRate < -1 || dividendYield < 0) {
            throw new IllegalArgumentException("Market data are outside supported ranges");
        }
    }
}
