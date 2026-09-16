package com.finance.pricer;

import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class AdvancedPricingDemo {
    private AdvancedPricingDemo() { }

    public static void main(String[] args) {
        DiscountCurve curve = DiscountCurve.bootstrapParSwaps(
                new double[] {1, 2, 3, 5, 10},
                new double[] {0.035, 0.037, 0.039, 0.042, 0.045}, 1);
        double swapRate = SwapPricer.parRate(5, 2, curve);
        InterestRateSwap swap = new InterestRateSwap(1_000_000, 0.04, 5, 2, true);
        double swapPv = SwapPricer.presentValue(swap, curve);
        CreditDefaultSwap cds = new CreditDefaultSwap(10_000_000, 0.012, 5, 4, 0.40);
        double hazard = CdsPricer.impliedHazardRate(cds, curve);
        double fxForward = FxForwardPricer.forward(1.08, 0.045, 0.025, 1);
        Option option = new Option(100, 1, OptionType.CALL, true);
        MarketData market = new MarketData(100, 0.05, 0.20, 0.01);
        double impliedVol = ImpliedVolatility.solve(option, 9.82628559, market);
        BusinessCalendar calendar = new BusinessCalendar(Set.of(LocalDate.of(2026, 1, 1)));
        InMemoryMarketDataProvider feed = new InMemoryMarketDataProvider();
        feed.publish("EURUSD", Map.of("spot", 1.08, "domesticRate", 0.045, "foreignRate", 0.025));
        System.out.printf(Locale.US, "5Y par swap rate: %.6f%nSwap PV: %.2f%nCDS implied hazard: %.6f%nFX 1Y forward: %.6f%nImplied volatility: %.6f%nNext business day: %s%nFeed EURUSD: %.4f%n",
                swapRate, swapPv, hazard, fxForward, impliedVol,
                calendar.following(LocalDate.of(2026, 1, 1)), feed.snapshot("EURUSD").quote("spot"));
    }
}
