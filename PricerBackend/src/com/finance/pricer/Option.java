package com.finance.pricer;

public record Option(double strike, double maturity, OptionType type, boolean european) implements Instrument {
    public Option {
        if (strike <= 0 || maturity <= 0 || type == null) {
            throw new IllegalArgumentException("Strike and maturity must be positive");
        }
    }

    @Override
    public String instrumentType() {
        return type + (european ? " EUROPEAN" : " AMERICAN");
    }
}
