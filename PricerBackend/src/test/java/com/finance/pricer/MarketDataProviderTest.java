package com.finance.pricer;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class MarketDataProviderTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void publishesAndReadsInMemorySnapshots() {
        InMemoryMarketDataProvider provider = new InMemoryMarketDataProvider();
        Map<String, Double> quotes = new HashMap<>();
        quotes.put("BID", 99.5);
        provider.publish("AAPL", quotes);

        assertEquals("AAPL", provider.snapshot("AAPL").symbol());
        assertEquals(99.5, provider.snapshot("AAPL").quotes().get("BID"));
        assertThrows(IllegalArgumentException.class, () -> provider.snapshot("MSFT"));
    }

    @Test
    void loadsCsvHeadersCommentsAndQuotes() throws IOException {
        Path csv = temporaryDirectory.resolve("market.csv");
        Files.writeString(csv, "symbol,bid,ask\n# comment\nAAPL,99.5,100.5\n");

        CsvMarketDataProvider provider = new CsvMarketDataProvider(csv);

        assertEquals(99.5, provider.snapshot("AAPL").quotes().get("bid"));
        assertEquals(100.5, provider.snapshot("AAPL").quotes().get("ask"));
    }

    @Test
    void rejectsMalformedCsvRowsAndUnknownSymbols() throws IOException {
        Path csv = temporaryDirectory.resolve("invalid.csv");
        Files.writeString(csv, "AAPL,99.5\n");

        assertThrows(IllegalArgumentException.class, () -> new CsvMarketDataProvider(csv));
        Path validCsv = temporaryDirectory.resolve("valid.csv");
        Files.writeString(validCsv, "AAPL,bid,99.5\n");
        CsvMarketDataProvider provider = new CsvMarketDataProvider(validCsv);
        assertThrows(IllegalArgumentException.class, () -> provider.snapshot("MSFT"));
    }
}
