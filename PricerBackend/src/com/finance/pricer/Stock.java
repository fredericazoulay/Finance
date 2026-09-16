package com.finance.pricer;

public record Stock(double forecastDividend, double growthRate) implements Instrument {
    public Stock {
        if (forecastDividend < 0 || growthRate <= -1) {
            throw new IllegalArgumentException("Invalid stock parameters");
        }
    }

    @Override
    public String instrumentType() {
        return "EQUITY";
    }
}
