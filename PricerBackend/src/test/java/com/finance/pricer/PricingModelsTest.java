package com.finance.pricer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PricingModelsTest {
    private static final double TOLERANCE = 1e-3;

    @Test
    void blackScholesPricesEuropeanCall() {
        Option option = new Option(100, 1, OptionType.CALL, true);
        MarketData marketData = new MarketData(100, 0.05, 0.2, 0.01);

        double price = new BlackScholesModel().price(option, marketData);

        assertEquals(9.8263, price, TOLERANCE);
    }

    @Test
    void blackScholesPricesEuropeanPut() {
        Option option = new Option(100, 1, OptionType.PUT, true);
        MarketData marketData = new MarketData(100, 0.05, 0.2, 0.01);

        double price = new BlackScholesModel().price(option, marketData);

        assertEquals(5.9442, price, TOLERANCE);
    }

    @Test
    void blackScholesUsesIntrinsicValueForZeroVolatility() {
        Option option = new Option(100, 1, OptionType.CALL, true);
        MarketData marketData = new MarketData(120, 0.05, 0, 0);

        assertEquals(20, new BlackScholesModel().price(option, marketData), TOLERANCE);
    }

    @Test
    void blackScholesRejectsAmericanOptions() {
        Option option = new Option(100, 1, OptionType.CALL, false);

        assertThrows(IllegalArgumentException.class,
                () -> new BlackScholesModel().price(option, new MarketData(100, 0.05, 0.2, 0)));
    }

    @Test
    void binomialPricesEuropeanOptionAndRejectsInvalidSteps() {
        Option option = new Option(100, 1, OptionType.CALL, true);
        MarketData marketData = new MarketData(100, 0.05, 0.2, 0);

        double price = new BinomialModel(500).price(option, marketData);

        assertEquals(10.4466, price, 2e-2);
        assertThrows(IllegalArgumentException.class, () -> new BinomialModel(0));
    }

    @Test
    void binomialSupportsAmericanEarlyExercise() {
        Option option = new Option(100, 1, OptionType.PUT, false);
        MarketData marketData = new MarketData(80, 0.05, 0.2, 0);

        double price = new BinomialModel(100).price(option, marketData);

        assertEquals(20, price, 1.0);
    }

    @Test
    void binomialRejectsInvalidCrrParameters() {
        Option option = new Option(100, 1, OptionType.CALL, true);
        MarketData marketData = new MarketData(100, 0.5, 0.0001, 0);

        assertThrows(IllegalArgumentException.class,
                () -> new BinomialModel(10).price(option, marketData));
    }

    @Test
    void dcfPricesBondAndDividendPayingStock() {
        DiscountedCashFlowModel model = new DiscountedCashFlowModel();

        double bondPrice = model.price(new Bond(1000, 0.05, 2, 5),
                new MarketData(100, 0.04, 0.2, 0));
        double stockPrice = model.price(new Stock(5, 0.02),
                new MarketData(100, 0.06, 0.2, 0));

        assertEquals(1044.9129, bondPrice, 0.02);
        assertEquals(125, stockPrice, TOLERANCE);
    }

    @Test
    void dcfRejectsUnsupportedOrInvalidStockInputs() {
        DiscountedCashFlowModel model = new DiscountedCashFlowModel();

        assertThrows(IllegalArgumentException.class,
                () -> model.price(new Stock(0, 0.02), new MarketData(100, 0.06, 0.2, 0)));
        assertThrows(IllegalArgumentException.class,
                () -> model.price(new Stock(5, 0.06), new MarketData(100, 0.06, 0.2, 0)));
        assertThrows(IllegalArgumentException.class,
                () -> model.price(new Option(100, 1, OptionType.CALL, true),
                        new MarketData(100, 0.06, 0.2, 0)));
    }

    @Test
    void impliedVolatilityRecoversMarketVolatility() {
        Option option = new Option(100, 1, OptionType.CALL, true);
        MarketData marketData = new MarketData(100, 0.05, 0.2, 0.01);
        double marketPrice = new BlackScholesModel().price(option, marketData);

        double impliedVolatility = ImpliedVolatility.solve(option, marketPrice, marketData);

        assertEquals(0.2, impliedVolatility, 1e-6);
    }

    @Test
    void impliedVolatilityRejectsPriceBelowIntrinsicValue() {
        Option option = new Option(100, 1, OptionType.CALL, true);

        assertThrows(IllegalArgumentException.class,
                () -> ImpliedVolatility.solve(option, 1, new MarketData(120, 0.05, 0.2, 0)));
    }
}
