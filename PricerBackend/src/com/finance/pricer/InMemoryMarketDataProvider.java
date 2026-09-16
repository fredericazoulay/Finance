package com.finance.pricer;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class InMemoryMarketDataProvider implements MarketDataProvider {
    private final Map<String, MarketSnapshot> snapshots = new ConcurrentHashMap<>();

    public void publish(String symbol, Map<String, Double> quotes) {
        snapshots.put(symbol, new MarketSnapshot(symbol, Instant.now(), quotes));
    }

    @Override
    public MarketSnapshot snapshot(String symbol) {
        MarketSnapshot result = snapshots.get(symbol);
        if (result == null) throw new IllegalArgumentException("Unknown market symbol: " + symbol);
        return result;
    }
}
