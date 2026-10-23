package com.finance.pricer;

import com.finance.pricer.core.curves.FlatYieldCurve;
import com.finance.pricer.core.curves.YieldCurve;
import com.finance.pricer.credit.CreditDefaultSwapEngine;
import com.finance.pricer.options.strategies.MultiLegStrategy;
import com.finance.pricer.options.vanilla.AnalyticalGreeks;
import com.finance.pricer.options.vanilla.BinomialTreePricer;
import com.finance.pricer.options.vanilla.BjerksundStensland;
import com.finance.pricer.options.vanilla.GeneralizedBlackScholes;
import com.finance.pricer.rates.derivatives.InterestRateCapFloor;
import com.finance.pricer.rates.derivatives.SwaptionPricer;

import java.util.List;

public final class ComprehensivePhase3And4SelfTest {

    public static void main(String[] args) {
        testGeneralizedBlackScholes();
        testAnalyticalGreeks();
        testAmericanOptionPricers();
        testMultiLegStrategies();
        testCapsFloorsAndParity();
        testSwaptions();
        testCreditDefaultSwaps();
        System.out.println("All Phase 3 & 4 Options, Rates & Credit Self-Tests PASSED successfully!");
    }

    private static void testGeneralizedBlackScholes() {
        // 1. Merton continuous dividend yield: S=100, K=100, T=1, r=0.05, q=0.02, sigma=0.20
        double c = GeneralizedBlackScholes.priceMerton(GeneralizedBlackScholes.OptionType.CALL, 100, 100, 1.0, 0.05, 0.02, 0.20);
        double p = GeneralizedBlackScholes.priceMerton(GeneralizedBlackScholes.OptionType.PUT, 100, 100, 1.0, 0.05, 0.02, 0.20);
        // Put-Call Parity: C - P = S * exp(-q*T) - K * exp(-r*T)
        double parityDiff = (c - p) - (100.0 * Math.exp(-0.02) - 100.0 * Math.exp(-0.05));
        assertEquals(0.0, parityDiff, 1e-10, "Merton Put-Call parity");

        // 2. Garman-Kohlhagen FX: S=1.30, K=1.30, T=0.5, rd=0.04, rf=0.02, sigma=0.15
        double cFx = GeneralizedBlackScholes.priceGarmanKohlhagen(GeneralizedBlackScholes.OptionType.CALL, 1.30, 1.30, 0.5, 0.04, 0.02, 0.15);
        double pFx = GeneralizedBlackScholes.priceGarmanKohlhagen(GeneralizedBlackScholes.OptionType.PUT, 1.30, 1.30, 0.5, 0.04, 0.02, 0.15);
        double fxParity = (cFx - pFx) - (1.30 * Math.exp(-0.02 * 0.5) - 1.30 * Math.exp(-0.04 * 0.5));
        assertEquals(0.0, fxParity, 1e-10, "Garman-Kohlhagen Put-Call parity");

        // 3. Black-76 Futures Option: F=50, K=50, T=0.5, r=0.05, sigma=0.25
        double cFut = GeneralizedBlackScholes.priceBlack76(GeneralizedBlackScholes.OptionType.CALL, 50, 50, 0.5, 0.05, 0.25);
        double pFut = GeneralizedBlackScholes.priceBlack76(GeneralizedBlackScholes.OptionType.PUT, 50, 50, 0.5, 0.05, 0.25);
        // Put-Call Parity for Futures: C - P = exp(-r*T) * (F - K) = 0 when F = K
        assertEquals(cFut, pFut, 1e-10, "Black-76 Put-Call parity at ATM");
    }

    private static void testAnalyticalGreeks() {
        double s = 100.0;
        double k = 105.0;
        double t = 0.75;
        double r = 0.04;
        double b = 0.04 - 0.01; // q = 1%
        double vol = 0.22;

        AnalyticalGreeks.GreeksResult g = AnalyticalGreeks.calculate(
                GeneralizedBlackScholes.OptionType.CALL, s, k, t, r, b, vol
        );

        // Finite difference check for Delta: (C(s + eps) - C(s - eps)) / (2 * eps)
        double eps = 1e-4;
        double cUp = GeneralizedBlackScholes.price(GeneralizedBlackScholes.OptionType.CALL, s + eps, k, t, r, b, vol);
        double cDown = GeneralizedBlackScholes.price(GeneralizedBlackScholes.OptionType.CALL, s - eps, k, t, r, b, vol);
        double fdDelta = (cUp - cDown) / (2.0 * eps);
        assertEquals(fdDelta, g.delta(), 1e-5, "Analytical Delta vs Finite Difference");

        // Finite difference Gamma: (C(s + eps) - 2C(s) + C(s - eps)) / eps^2
        double fdGamma = (cUp - 2.0 * g.price() + cDown) / (eps * eps);
        assertEquals(fdGamma, g.gamma(), 1e-4, "Analytical Gamma vs Finite Difference");

        // Finite difference Vega: (C(vol + eps) - C(vol - eps)) / (2 * eps)
        double cVolUp = GeneralizedBlackScholes.price(GeneralizedBlackScholes.OptionType.CALL, s, k, t, r, b, vol + eps);
        double cVolDown = GeneralizedBlackScholes.price(GeneralizedBlackScholes.OptionType.CALL, s, k, t, r, b, vol - eps);
        double fdVega = (cVolUp - cVolDown) / (2.0 * eps);
        assertEquals(fdVega, g.vega(), 1e-4, "Analytical Vega vs Finite Difference");

        // Finite difference Theta
        double cTimeDown = GeneralizedBlackScholes.price(GeneralizedBlackScholes.OptionType.CALL, s, k, t - eps, r, b, vol);
        double fdTheta = (cTimeDown - g.price()) / eps;
        assertEquals(fdTheta, g.thetaAnnual(), 1e-2, "Analytical Theta vs Finite Difference");
    }

    private static void testAmericanOptionPricers() {
        double s = 90.0;
        double k = 100.0;
        double t = 1.0;
        double r = 0.06;
        double b = 0.06; // Non-dividend stock
        double vol = 0.25;

        // American Put is strictly greater than European Put due to early exercise value
        double euroPut = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.PUT, s, k, t, r, vol);
        double amerPutBS = BjerksundStensland.price(GeneralizedBlackScholes.OptionType.PUT, s, k, t, r, b, vol);
        check(amerPutBS > euroPut, "American Put must be strictly greater than European Put (Amer=" + amerPutBS + ", Euro=" + euroPut + ")");

        // Binomial Tree CRR 300 steps
        BinomialTreePricer crr = new BinomialTreePricer(300, BinomialTreePricer.TreeType.COX_ROSS_RUBINSTEIN);
        double amerPutCrr = crr.priceAmerican(GeneralizedBlackScholes.OptionType.PUT, s, k, t, r, b, vol);
        assertEquals(amerPutCrr, amerPutBS, 0.15, "Bjerksund-Stensland vs CRR Binomial Tree");

        // For non-dividend stock, American Call == European Call
        double euroCall = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, s, k, t, r, vol);
        double amerCallBS = BjerksundStensland.price(GeneralizedBlackScholes.OptionType.CALL, s, k, t, r, b, vol);
        assertEquals(euroCall, amerCallBS, 1e-6, "American Call == European Call when q=0");
    }

    private static void testMultiLegStrategies() {
        // Bull Call Spread: S=100, K1=95, K2=105, T=0.5, r=0.05, vol=0.20
        MultiLegStrategy bullSpread = MultiLegStrategy.bullCallSpread(100.0, 95.0, 105.0, 0.5, 0.05, 0.20);
        check(bullSpread.netPremium() > 0, "Bull spread net debit positive");

        // Payoff at terminal spots:
        assertEquals(0.0, bullSpread.grossPayoffAt(90.0), 1e-9, "Bull spread payoff at 90");
        assertEquals(5.0, bullSpread.grossPayoffAt(100.0), 1e-9, "Bull spread payoff at 100");
        assertEquals(10.0, bullSpread.grossPayoffAt(115.0), 1e-9, "Bull spread payoff capped at 10");

        MultiLegStrategy.StrategyProfile profile = bullSpread.analyze(100.0, 0.05, 0.20);
        assertEquals(10.0 - bullSpread.netPremium(), profile.maxProfit(), 0.05, "Bull spread max profit");
        assertEquals(-bullSpread.netPremium(), profile.maxLoss(), 0.05, "Bull spread max loss");
        check(profile.breakevenPoints().size() == 1, "Bull spread has exactly 1 breakeven point");

        // Straddle: S=100, K=100
        MultiLegStrategy straddle = MultiLegStrategy.straddle(100.0, 100.0, 0.5, 0.05, 0.20);
        MultiLegStrategy.StrategyProfile straddleProf = straddle.analyze(100.0, 0.05, 0.20);
        check(straddleProf.breakevenPoints().size() == 2, "Straddle has 2 breakeven points");
    }

    private static void testCapsFloorsAndParity() {
        double notional = 1_000_000.0;
        double strike = 0.04;
        double[] paymentTimes = {0.0, 0.5, 1.0, 1.5, 2.0};
        YieldCurve curve = new FlatYieldCurve(0.04);
        double vol = 0.20;

        InterestRateCapFloor.CapFloorResult res = InterestRateCapFloor.priceCapOrFloor(
                notional, strike, paymentTimes, curve, curve, vol, true
        );
        check(res.capValue() > 0, "Cap value must be positive");
        check(res.floorValue() > 0, "Floor value must be positive");

        // Cap - Floor Parity: Cap - Floor == Payer Swap PV
        double swapValue = 0.0;
        for (int i = 0; i < paymentTimes.length - 1; i++) {
            double tStart = paymentTimes[i];
            double tEnd = paymentTimes[i + 1];
            double tau = tEnd - tStart;
            double pStart = curve.discountFactor(tStart);
            double pEnd = curve.discountFactor(tEnd);
            double fwd = (pStart / pEnd - 1.0) / tau;
            swapValue += notional * tau * pEnd * (fwd - strike);
        }
        assertEquals(swapValue, res.capValue() - res.floorValue(), 1e-4, "Cap - Floor Parity == Payer Swap PV");

        // When strike equals the par swap rate, Cap value == Floor value
        double annuity = 0.0;
        for (int i = 1; i < paymentTimes.length; i++) {
            annuity += (paymentTimes[i] - paymentTimes[i - 1]) * curve.discountFactor(paymentTimes[i]);
        }
        double parSwapRate = (curve.discountFactor(paymentTimes[0]) - curve.discountFactor(paymentTimes[paymentTimes.length - 1])) / annuity;
        InterestRateCapFloor.CapFloorResult atParRes = InterestRateCapFloor.priceCapOrFloor(
                notional, parSwapRate, paymentTimes, curve, curve, vol, true
        );
        assertEquals(atParRes.floorValue(), atParRes.capValue(), 1e-4, "Cap-Floor Parity at Par Swap Rate");

        // Collar with identical par strikes is 0 (Cap(par) - Floor(par) == 0)
        double collarZero = InterestRateCapFloor.priceCollar(notional, parSwapRate, parSwapRate, paymentTimes, curve, curve, vol);
        assertEquals(0.0, collarZero, 1e-4, "Collar with equal par strikes is 0");
    }

    private static void testSwaptions() {
        double notional = 10_000_000.0;
        double strike = 0.04;
        double t0 = 1.0;  // 1Y into
        double swapTenor = 5.0; // 5Y swap
        YieldCurve curve = new FlatYieldCurve(0.04);
        double vol = 0.20;

        SwaptionPricer.EuropeanSwaptionResult payerRes = SwaptionPricer.priceEuropeanBlack76(
                SwaptionPricer.SwaptionType.PAYER, notional, strike, t0, swapTenor, 2, curve, vol
        );
        SwaptionPricer.EuropeanSwaptionResult receiverRes = SwaptionPricer.priceEuropeanBlack76(
                SwaptionPricer.SwaptionType.RECEIVER, notional, strike, t0, swapTenor, 2, curve, vol
        );

        check(payerRes.price() > 0, "Payer swaption price > 0");
        // Swaption Parity: Payer - Receiver == L * A * (s0 - sK)
        double expectedParityDiff = notional * payerRes.swapAnnuity() * (payerRes.forwardSwapRate() - strike);
        assertEquals(expectedParityDiff, payerRes.price() - receiverRes.price(), 1e-4, "Swaption Parity: Payer - Receiver == L * A * (s0 - sK)");

        // At exact ATM forward swap rate (s0), Payer price equals Receiver price
        double atmForwardRate = payerRes.forwardSwapRate();
        SwaptionPricer.EuropeanSwaptionResult atmPayer = SwaptionPricer.priceEuropeanBlack76(
                SwaptionPricer.SwaptionType.PAYER, notional, atmForwardRate, t0, swapTenor, 2, curve, vol
        );
        SwaptionPricer.EuropeanSwaptionResult atmReceiver = SwaptionPricer.priceEuropeanBlack76(
                SwaptionPricer.SwaptionType.RECEIVER, notional, atmForwardRate, t0, swapTenor, 2, curve, vol
        );
        assertEquals(atmReceiver.price(), atmPayer.price(), 1e-4, "Swaption Payer == Receiver at forward swap rate");

        // Bermudan Swaption on Hull-White trinomial tree
        double bermudanPrice = SwaptionPricer.priceBermudanHullWhite(
                SwaptionPricer.SwaptionType.PAYER, notional, strike, t0, swapTenor, 2, 0.04, 0.03, 0.015, 60, null
        );
        check(bermudanPrice > 0, "Bermudan swaption price positive: " + bermudanPrice);
    }

    private static void testCreditDefaultSwaps() {
        YieldCurve discountCurve = new FlatYieldCurve(0.03);
        double recovery = 0.40;

        // Market quotes for CDS spreads across 1Y, 3Y, 5Y
        double[] pillarTenors = {1.0, 3.0, 5.0};
        double[] marketSpreadsBps = {60.0, 90.0, 120.0};

        // Bootstrap hazard rates
        CreditDefaultSwapEngine.HazardRateCurve hrCurve = CreditDefaultSwapEngine.bootstrapHazardRates(
                pillarTenors, marketSpreadsBps, recovery, 4, discountCurve
        );

        check(hrCurve != null, "Hazard rate curve successfully bootstrapped");
        check(hrCurve.hazardRates()[0] > 0, "Hazard rate 1Y > 0");

        // Repricing test: repricing each tenor must yield par spread == market quote
        for (int i = 0; i < pillarTenors.length; i++) {
            double tenor = pillarTenors[i];
            int steps = (int) Math.round(tenor * 4);
            double[] paymentTimes = new double[steps];
            for (int s = 0; s < steps; s++) paymentTimes[s] = (s + 1.0) / 4.0;

            CreditDefaultSwapEngine.CdsPricingResult res = CreditDefaultSwapEngine.priceCds(
                    10_000_000.0, marketSpreadsBps[i] / 10000.0, recovery, paymentTimes, discountCurve, hrCurve
            );

            // Present value at contractual spread == par spread must be ~0 (within $1 on $10M notional)
            assertEquals(0.0, res.presentValue(), 1.0, "Repriced CDS PV at pillar " + tenor + "Y must be 0");
            assertEquals(marketSpreadsBps[i], res.parSpreadBps(), 1e-3, "Repriced par spread matches market quote");
        }
    }

    private static void assertEquals(double expected, double actual, double tol, String msg) {
        if (Math.abs(expected - actual) > tol) {
            throw new AssertionError(msg + " -> Expected: " + expected + ", Actual: " + actual + ", Diff: " + Math.abs(expected - actual));
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
