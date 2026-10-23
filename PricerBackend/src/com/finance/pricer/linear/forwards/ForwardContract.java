package com.finance.pricer.linear.forwards;

import com.finance.pricer.core.curves.YieldCurve;

import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

/**
 * Universal forward pricing engine as formulated in John C. Hull (Chapter 3 & 5).
 * Handles:
 * - Equity forwards with discrete cash dividends: F0 = (S0 - PV(Div)) * exp(r * T)
 * - Equity / Index forwards with continuous dividend yield: F0 = S0 * exp((r - q) * T)
 * - FX Forwards (Covered Interest Parity): F0 = S0 * exp((r_d - r_f) * T), forward points = F0 - S0
 * - Commodity forwards with cost of carry (storage costs u and convenience yield y): F0 = S0 * exp((r + u - y) * T)
 */
public class ForwardContract {

    public enum UnderlyingType {
        EQUITY_DISCRETE_DIVIDEND,
        EQUITY_CONTINUOUS_DIVIDEND,
        FOREIGN_EXCHANGE,
        COMMODITY,
        INVESTMENT_ASSET_NO_INCOME
    }

    public record CashDividend(LocalDate exDividendDate, double amount) {}

    private final UnderlyingType type;
    private final double spotPrice;
    private final LocalDate settlementDate;
    private final LocalDate maturityDate;
    private final double timeToMaturity; // in years
    private final double deliveryPrice;  // K

    // Underlying specific parameters
    private final double continuousYield; // q for equity index, r_f for foreign exchange
    private final double storageCostRate; // u for commodities (percentage)
    private final double convenienceYield; // y for commodities
    private final List<CashDividend> cashDividends;

    private ForwardContract(Builder builder) {
        this.type = builder.type;
        this.spotPrice = builder.spotPrice;
        this.settlementDate = builder.settlementDate;
        this.maturityDate = builder.maturityDate;
        this.timeToMaturity = builder.timeToMaturity;
        this.deliveryPrice = builder.deliveryPrice;
        this.continuousYield = builder.continuousYield;
        this.storageCostRate = builder.storageCostRate;
        this.convenienceYield = builder.convenienceYield;
        this.cashDividends = builder.cashDividends != null ? List.copyOf(builder.cashDividends) : Collections.emptyList();
    }

    // Factory methods

    public static ForwardContract equityWithDiscreteDividends(double spot, double deliveryPrice, double timeToMaturity, List<CashDividend> dividends) {
        return new Builder(UnderlyingType.EQUITY_DISCRETE_DIVIDEND, spot, timeToMaturity)
                .deliveryPrice(deliveryPrice)
                .cashDividends(dividends)
                .build();
    }

    public static ForwardContract equityWithContinuousDividend(double spot, double deliveryPrice, double timeToMaturity, double dividendYield) {
        return new Builder(UnderlyingType.EQUITY_CONTINUOUS_DIVIDEND, spot, timeToMaturity)
                .deliveryPrice(deliveryPrice)
                .continuousYield(dividendYield)
                .build();
    }

    public static ForwardContract fxForward(double spotFx, double deliveryFx, double timeToMaturity, double foreignRate) {
        return new Builder(UnderlyingType.FOREIGN_EXCHANGE, spotFx, timeToMaturity)
                .deliveryPrice(deliveryFx)
                .continuousYield(foreignRate)
                .build();
    }

    public static ForwardContract commodityForward(double spot, double deliveryPrice, double timeToMaturity, double storageCostRate, double convenienceYield) {
        return new Builder(UnderlyingType.COMMODITY, spot, timeToMaturity)
                .deliveryPrice(deliveryPrice)
                .storageCostRate(storageCostRate)
                .convenienceYield(convenienceYield)
                .build();
    }

    public static ForwardContract assetNoIncome(double spot, double deliveryPrice, double timeToMaturity) {
        return new Builder(UnderlyingType.INVESTMENT_ASSET_NO_INCOME, spot, timeToMaturity)
                .deliveryPrice(deliveryPrice)
                .build();
    }

    /**
     * Theoretical forward price F0 (no-arbitrage price).
     */
    public double theoreticalForwardPrice(YieldCurve discountCurve) {
        double r = discountCurve.zeroRate(timeToMaturity);
        return switch (type) {
            case INVESTMENT_ASSET_NO_INCOME -> spotPrice * Math.exp(r * timeToMaturity);
            case EQUITY_CONTINUOUS_DIVIDEND -> spotPrice * Math.exp((r - continuousYield) * timeToMaturity);
            case FOREIGN_EXCHANGE -> spotPrice * Math.exp((r - continuousYield) * timeToMaturity);
            case COMMODITY -> spotPrice * Math.exp((r + storageCostRate - convenienceYield) * timeToMaturity);
            case EQUITY_DISCRETE_DIVIDEND -> {
                double pvDividends = 0.0;
                if (settlementDate != null && !cashDividends.isEmpty()) {
                    for (CashDividend div : cashDividends) {
                        if (div.exDividendDate.isAfter(settlementDate) && !div.exDividendDate.isAfter(maturityDate)) {
                            double df = discountCurve.discountFactor(div.exDividendDate);
                            pvDividends += div.amount * df;
                        }
                    }
                } else if (!cashDividends.isEmpty()) {
                    // Fallback assuming evenly spaced dividends
                    int m = cashDividends.size();
                    for (int i = 0; i < m; i++) {
                        double tDiv = (i + 1) * (timeToMaturity / (m + 1));
                        pvDividends += cashDividends.get(i).amount * discountCurve.discountFactor(tDiv);
                    }
                }
                yield (spotPrice - pvDividends) * Math.exp(r * timeToMaturity);
            }
        };
    }

    /**
     * Present value f of a long forward contract:
     * f = (F0 - K) * exp(-r * T)
     */
    public double presentValue(YieldCurve discountCurve) {
        double f0 = theoreticalForwardPrice(discountCurve);
        double df = discountCurve.discountFactor(timeToMaturity);
        return (f0 - deliveryPrice) * df;
    }

    /**
     * FX Forward points: F0 - S0 (Hull Chapter 5).
     */
    public double fxForwardPoints(YieldCurve domesticCurve) {
        if (type != UnderlyingType.FOREIGN_EXCHANGE) {
            throw new IllegalStateException("Forward points are only applicable for FX contracts");
        }
        return theoreticalForwardPrice(domesticCurve) - spotPrice;
    }

    public UnderlyingType getType() { return type; }
    public double getSpotPrice() { return spotPrice; }
    public double getTimeToMaturity() { return timeToMaturity; }
    public double getDeliveryPrice() { return deliveryPrice; }

    public static class Builder {
        private final UnderlyingType type;
        private final double spotPrice;
        private final double timeToMaturity;
        private double deliveryPrice = 0.0;
        private LocalDate settlementDate;
        private LocalDate maturityDate;
        private double continuousYield = 0.0;
        private double storageCostRate = 0.0;
        private double convenienceYield = 0.0;
        private List<CashDividend> cashDividends;

        public Builder(UnderlyingType type, double spotPrice, double timeToMaturity) {
            this.type = Objects.requireNonNull(type);
            this.spotPrice = spotPrice;
            this.timeToMaturity = timeToMaturity;
            this.deliveryPrice = spotPrice;
        }

        public Builder deliveryPrice(double deliveryPrice) {
            this.deliveryPrice = deliveryPrice;
            return this;
        }

        public Builder dates(LocalDate settlement, LocalDate maturity) {
            this.settlementDate = settlement;
            this.maturityDate = maturity;
            return this;
        }

        public Builder continuousYield(double continuousYield) {
            this.continuousYield = continuousYield;
            return this;
        }

        public Builder storageCostRate(double storageCostRate) {
            this.storageCostRate = storageCostRate;
            return this;
        }

        public Builder convenienceYield(double convenienceYield) {
            this.convenienceYield = convenienceYield;
            return this;
        }

        public Builder cashDividends(List<CashDividend> cashDividends) {
            this.cashDividends = cashDividends;
            return this;
        }

        public ForwardContract build() {
            return new ForwardContract(this);
        }
    }
}

