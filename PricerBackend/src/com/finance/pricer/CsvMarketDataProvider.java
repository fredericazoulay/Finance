package com.finance.pricer;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class CsvMarketDataProvider implements MarketDataProvider {
    private final Map<String, MarketSnapshot> snapshots;

    public CsvMarketDataProvider(Path csvFile) throws IOException {
        this.snapshots = load(csvFile);
    }

    @Override
    public MarketSnapshot snapshot(String symbol) {
        MarketSnapshot result = snapshots.get(symbol);
        if (result == null) throw new IllegalArgumentException("Unknown market symbol: " + symbol);
        return result;
    }

    private static Map<String, MarketSnapshot> load(Path csvFile) throws IOException {
        Map<String, MarketSnapshot> result = new HashMap<>();
        List<String> lines = Files.readAllLines(csvFile);
        for (int lineNumber = 0; lineNumber < lines.size(); lineNumber++) {
            String line = lines.get(lineNumber).trim();
            if (line.isEmpty() || line.startsWith("#") || line.toLowerCase().startsWith("symbol,")) continue;
            String[] fields = line.split(",");
            if (fields.length < 3) throw new IllegalArgumentException("Invalid market CSV line " + (lineNumber + 1));
            Map<String, Double> quotes = new HashMap<>();
            for (int i = 1; i + 1 < fields.length; i += 2) quotes.put(fields[i].trim(), Double.parseDouble(fields[i + 1].trim()));
            result.put(fields[0].trim(), new MarketSnapshot(fields[0].trim(), Instant.now(), quotes));
        }
        return result;
    }
}
