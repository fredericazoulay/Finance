package com.finance.pricer;

import java.util.Locale;

public final class PricerApp {
    private PricerApp() { }

    public static void main(String[] args) {
        if (args.length == 0 || "help".equalsIgnoreCase(args[0])) {
            printUsage();
            return;
        }
        try {
            String instrumentName = args[0].toLowerCase(Locale.ROOT);
            String modelName = args[1];
            PricingModel model = Models.create(modelName, 100_000, 42L);
            MarketData marketData;
            Instrument instrument;
            switch (instrumentName) {
                case "option" -> {
                    require(args, 9);
                    instrument = new Option(Double.parseDouble(args[2]), Double.parseDouble(args[3]),
                            OptionType.valueOf(args[4].toUpperCase(Locale.ROOT)), Boolean.parseBoolean(args[5]));
                    marketData = new MarketData(Double.parseDouble(args[6]), Double.parseDouble(args[7]),
                            Double.parseDouble(args[8]), args.length > 9 ? Double.parseDouble(args[9]) : 0);
                }
                case "bond" -> {
                    require(args, 7);
                    instrument = new Bond(Double.parseDouble(args[2]), Double.parseDouble(args[3]),
                            Integer.parseInt(args[4]), Double.parseDouble(args[5]));
                    marketData = new MarketData(0, Double.parseDouble(args[6]), 0, 0);
                }
                case "stock" -> {
                    require(args, 6);
                    instrument = new Stock(Double.parseDouble(args[2]), Double.parseDouble(args[3]));
                    marketData = new MarketData(Double.parseDouble(args[4]), Double.parseDouble(args[5]), 0, 0);
                }
                default -> throw new IllegalArgumentException("Unknown instrument: " + instrumentName);
            }
            System.out.printf(Locale.US, "%s %s price = %.8f%n", instrument.instrumentType(), model.name(), model.price(instrument, marketData));
        } catch (RuntimeException exception) {
            System.err.println("Pricing error: " + exception.getMessage());
            System.exit(1);
        }
    }

    private static void require(String[] args, int minimum) {
        if (args.length < minimum) throw new IllegalArgumentException("Missing arguments; use: java ... help");
    }

    private static void printUsage() {
        System.out.println("Finance Pricer - moteur extensible de valorisation");
        System.out.println("Models: BLACK_SCHOLES, BINOMIAL, MONTE_CARLO, DISCOUNTED_CASH_FLOW");
        System.out.println("Option: java ... option MODEL strike maturity CALL|PUT european spot rate volatility [dividendYield]");
        System.out.println("Bond:   java ... bond MODEL face couponRate couponsPerYear maturity yield");
        System.out.println("Stock:  java ... stock MODEL forecastDividend growthRate spot discountRate");
        System.out.println("Examples:");
        System.out.println("  java ... option BLACK_SCHOLES 100 1 CALL true 100 0.05 0.20 0.01");
        System.out.println("  java ... option BINOMIAL 100 1 PUT false 100 0.05 0.20");
        System.out.println("  java ... bond DISCOUNTED_CASH_FLOW 1000 0.05 2 5 0.04");
    }
}
