package com.finance.pricer;

public final class PricerSelfTest {
    private PricerSelfTest() { }

    public static void main(String[] args) {
        MarketData market = new MarketData(100, 0.05, 0.20, 0.01);
        Option call = new Option(100, 1, OptionType.CALL, true);
        double blackScholes = new BlackScholesModel().price(call, market);
        double binomial = new BinomialModel(800).price(call, market);
        check(blackScholes > 8 && blackScholes < 12, "Black-Scholes call out of expected range");
        check(Math.abs(blackScholes - binomial) < 0.1, "Binomial does not converge to Black-Scholes");
        Bond bond = new Bond(1000, 0.05, 2, 5);
        check(new DiscountedCashFlowModel().price(bond, new MarketData(0, 0.05, 0, 0)) > 990, "Par bond price is wrong");
        System.out.println("All pricing self-tests passed.");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
