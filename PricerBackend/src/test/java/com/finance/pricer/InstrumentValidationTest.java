package com.finance.pricer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class InstrumentValidationTest {
    @Test
    void optionValidatesParametersAndReportsType() {
        Option option = new Option(100, 1, OptionType.CALL, true);

        assertEquals("CALL EUROPEAN", option.instrumentType());
        assertThrows(IllegalArgumentException.class, () -> new Option(0, 1, OptionType.CALL, true));
        assertThrows(IllegalArgumentException.class, () -> new Option(100, 0, OptionType.CALL, true));
        assertThrows(IllegalArgumentException.class, () -> new Option(100, 1, null, true));
    }

    @Test
    void marketDataValidatesSupportedRanges() {
        assertThrows(IllegalArgumentException.class, () -> new MarketData(-1, 0, 0.2, 0));
        assertThrows(IllegalArgumentException.class, () -> new MarketData(100, -1.1, 0.2, 0));
        assertThrows(IllegalArgumentException.class, () -> new MarketData(100, 0, -0.1, 0));
        assertThrows(IllegalArgumentException.class, () -> new MarketData(100, 0, 0.2, -0.1));
    }

    @Test
    void bondAndStockReportInstrumentTypes() {
        assertEquals("COUPON_BOND", new Bond(1000, 0.05, 2, 5).instrumentType());
        assertEquals("EQUITY", new Stock(5, 0.02).instrumentType());
        assertThrows(IllegalArgumentException.class, () -> new Bond(0, 0.05, 2, 5));
        assertThrows(IllegalArgumentException.class, () -> new Stock(5, -1));
    }
}
