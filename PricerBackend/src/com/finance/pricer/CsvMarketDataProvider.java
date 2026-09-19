package com.finance.pricer;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
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
        String[] header = null;
        for (int lineNumber = 0; lineNumber < lines.size(); lineNumber++) {
            String line = lines.get(lineNumber).trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            String[] fields = line.split(",");
            if (header == null) {
                header = new String[fields.length];
                for (int i = 0; i < fields.length; i++) {
                    header[i] = fields[i].trim().toLowerCase(Locale.ROOT);
                }
                continue;
            }
            if (fields.length != header.length) {
                throw new IllegalArgumentException("Invalid market CSV line " + (lineNumber + 1));
            }
            String symbol = fields[0].trim();
            Map<String, Double> quotes = new HashMap<>();
            for (int i = 1; i < fields.length; i++) {
                quotes.put(header[i].trim(), Double.parseDouble(fields[i].trim()));
            }
            result.put(symbol, new MarketSnapshot(symbol, Instant.now(), quotes));
        }
        return result;
    }
}
