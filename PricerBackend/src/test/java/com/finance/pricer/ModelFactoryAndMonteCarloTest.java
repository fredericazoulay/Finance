package com.finance.pricer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ModelFactoryAndMonteCarloTest {
    @Test
    void createsModelsForSupportedAliases() {
        assertEquals("BLACK_SCHOLES", Models.create("bs", 1, 1).name());
        assertEquals("BINOMIAL_CRR", Models.create("crr", 1, 1).name());
        assertEquals("MONTE_CARLO_GBM", Models.create("mc", 100, 1).name());
        assertEquals("DISCOUNTED_CASH_FLOW", Models.create("dcf", 1, 1).name());
        assertThrows(IllegalArgumentException.class, () -> Models.create("unknown", 1, 1));
    }

    @Test
    void monteCarloIsDeterministicForASeedAndRejectsInvalidInputs() {
        MonteCarloModel first = new MonteCarloModel(5000, 42);
        MonteCarloModel second = new MonteCarloModel(5000, 42);
        Option option = new Option(100, 1, OptionType.CALL, true);
        MarketData marketData = new MarketData(100, 0.05, 0.2, 0.01);

        assertEquals(first.price(option, marketData), second.price(option, marketData), 0);
        assertThrows(IllegalArgumentException.class, () -> new MonteCarloModel(0, 1));
        assertThrows(IllegalArgumentException.class,
                () -> first.price(new Option(100, 1, OptionType.CALL, false), marketData));
        assertThrows(IllegalArgumentException.class,
                () -> first.price(new Bond(100, 0.02, 1, 1), marketData));
    }
}
