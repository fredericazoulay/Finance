package com.finance.pricer;

import java.time.Instant;
import java.util.Map;

public interface MarketDataProvider {
    MarketSnapshot snapshot(String symbol);

    record MarketSnapshot(String symbol, Instant asOf, Map<String, Double> quotes) {
        public MarketSnapshot {
            quotes = Map.copyOf(quotes);
        }
        public double quote(String name) {
            Double value = quotes.get(name);
            if (value == null) throw new IllegalArgumentException("Missing quote: " + name);
            return value;
        }
    }
}
