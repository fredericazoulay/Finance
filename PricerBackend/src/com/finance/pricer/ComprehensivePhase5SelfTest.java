package com.finance.pricer;

import com.finance.pricer.options.exotics.*;
import com.finance.pricer.options.vanilla.GeneralizedBlackScholes;
import com.finance.pricer.options.volatility.DupireLocalVolatility;
import com.finance.pricer.options.volatility.SabrModel;

public final class ComprehensivePhase5SelfTest {

    public static void main(String[] args) {
        testBarrierOptionsAndParity();
        testBinaryOptions();
        testAsianOptions();
        testLookbackOptions();
        testCompoundAndChooser();
        testSabrAndDupire();
        System.out.println("All Phase 5 Exotic Options & Volatility Surface Self-Tests PASSED successfully!");
    }

    private static void testBarrierOptionsAndParity() {
        double s = 100.0;
        double k = 100.0;
        double t = 1.0;
        double r = 0.05;
        double b = 0.05 - 0.02; // q = 2%
        double vol = 0.25;

        // Down barrier at H = 90 (below spot)
        double hDown = 90.0;
        BarrierOptionPricer.BarrierResult doc = BarrierOptionPricer.price(
                GeneralizedBlackScholes.OptionType.CALL, BarrierOptionPricer.BarrierType.DOWN_AND_OUT, s, k, hDown, 0.0, t, r, b, vol
        );
        BarrierOptionPricer.BarrierResult dic = BarrierOptionPricer.price(
                GeneralizedBlackScholes.OptionType.CALL, BarrierOptionPricer.BarrierType.DOWN_AND_IN, s, k, hDown, 0.0, t, r, b, vol
        );
        // In-Out Parity: Down-and-Out + Down-and-In == Vanilla Call
        assertEquals(doc.vanillaPrice(), doc.price() + dic.price(), 1e-6, "Down Call In-Out Parity");

        // Up barrier at H = 115 (above spot)
        double hUp = 115.0;
        BarrierOptionPricer.BarrierResult uoc = BarrierOptionPricer.price(
                GeneralizedBlackScholes.OptionType.CALL, BarrierOptionPricer.BarrierType.UP_AND_OUT, s, k, hUp, 0.0, t, r, b, vol
        );
        BarrierOptionPricer.BarrierResult uic = BarrierOptionPricer.price(
                GeneralizedBlackScholes.OptionType.CALL, BarrierOptionPricer.BarrierType.UP_AND_IN, s, k, hUp, 0.0, t, r, b, vol
        );
        assertEquals(uoc.vanillaPrice(), uoc.price() + uic.price(), 1e-6, "Up Call In-Out Parity");

        // Put In-Out Parity
        BarrierOptionPricer.BarrierResult dop = BarrierOptionPricer.price(
                GeneralizedBlackScholes.OptionType.PUT, BarrierOptionPricer.BarrierType.DOWN_AND_OUT, s, k, hDown, 0.0, t, r, b, vol
        );
        BarrierOptionPricer.BarrierResult dip = BarrierOptionPricer.price(
                GeneralizedBlackScholes.OptionType.PUT, BarrierOptionPricer.BarrierType.DOWN_AND_IN, s, k, hDown, 0.0, t, r, b, vol
        );
        assertEquals(dop.vanillaPrice(), dop.price() + dip.price(), 1e-6, "Down Put In-Out Parity");
    }

    private static void testBinaryOptions() {
        double s = 100.0;
        double k = 100.0;
        double t = 0.5;
        double r = 0.05;
        double b = 0.05; // q = 0
        double vol = 0.20;
        double cashPayout = 10.0;

        double cashCall = BinaryOptionPricer.priceCashOrNothing(GeneralizedBlackScholes.OptionType.CALL, s, k, cashPayout, t, r, b, vol);
        double cashPut = BinaryOptionPricer.priceCashOrNothing(GeneralizedBlackScholes.OptionType.PUT, s, k, cashPayout, t, r, b, vol);
        // Cash Call + Cash Put == Q * exp(-r * T)
        assertEquals(cashPayout * Math.exp(-r * t), cashCall + cashPut, 1e-9, "Digital Cash Put-Call Parity");

        // Asset-or-Nothing Call + Put == S0 * exp(-q * T)
        double assetCall = BinaryOptionPricer.priceAssetOrNothing(GeneralizedBlackScholes.OptionType.CALL, s, k, t, r, b, vol);
        double assetPut = BinaryOptionPricer.priceAssetOrNothing(GeneralizedBlackScholes.OptionType.PUT, s, k, t, r, b, vol);
        assertEquals(s, assetCall + assetPut, 1e-9, "Asset-or-Nothing Put-Call Parity");

        // Replication of Vanilla Call: C = AssetCall - K * (CashCall / Q)
        double vanillaCall = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, s, k, t, r, vol);
        double replicatedCall = assetCall - k * (cashCall / cashPayout);
        assertEquals(vanillaCall, replicatedCall, 1e-9, "Vanilla Call replication via Digital Options");
    }

    private static void testAsianOptions() {
        double s = 100.0;
        double k = 100.0;
        double t = 1.0;
        double r = 0.05;
        double b = 0.05;
        double vol = 0.20;

        double vanillaCall = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, s, k, t, r, vol);
        double geomCall = AsianOptionPricer.priceGeometricAverage(
                GeneralizedBlackScholes.OptionType.CALL, s, k, t, r, b, vol, 100
        );

        // Averaging dampens volatility, so Asian price is strictly lower than vanilla price
        check(geomCall < vanillaCall, "Geometric Asian call strictly cheaper than vanilla (Geom=" + geomCall + ", Vanilla=" + vanillaCall + ")");

        // Turnbull-Wakeman arithmetic approximation vs Monte Carlo with control variate
        double arithTW = AsianOptionPricer.priceArithmeticTurnbullWakeman(
                GeneralizedBlackScholes.OptionType.CALL, s, k, t, r, b, vol
        );
        AsianOptionPricer.AsianResult mc = AsianOptionPricer.priceArithmeticMonteCarloControlVariate(
                GeneralizedBlackScholes.OptionType.CALL, s, k, t, r, b, vol, 10000, 50
        );
        assertEquals(arithTW, mc.price(), 0.15, "Turnbull-Wakeman vs MC Control Variate");
    }

    private static void testLookbackOptions() {
        double s = 100.0;
        double t = 0.5;
        double r = 0.05;
        double b = 0.05;
        double vol = 0.20;

        // Floating Strike Call: pays S_T - S_min
        double floatCall = LookbackOptionPricer.priceFloatingCall(s, s, t, r, b, vol);
        double vanillaCall = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, s, s, t, r, vol);

        // Lookback Call is strictly more valuable than ATM Vanilla Call
        check(floatCall > vanillaCall, "Lookback floating call > Vanilla call (Lookback=" + floatCall + ", Vanilla=" + vanillaCall + ")");
    }

    private static void testCompoundAndChooser() {
        double s = 50.0;
        double k1 = 3.0;   // strike of compound option
        double k2 = 50.0;  // strike of underlying option
        double t1 = 0.5;   // compound expiry
        double t2 = 1.0;   // underlying expiry
        double r = 0.05;
        double b = 0.05;
        double vol = 0.25;

        double callOnCall = CompoundChooserOptionPricer.priceCompound(
                CompoundChooserOptionPricer.CompoundType.CALL_ON_CALL, s, k1, k2, t1, t2, r, b, vol
        );
        check(callOnCall > 0.0, "Call-on-call price positive: " + callOnCall);

        // Chooser Option: at t1 holder chooses whether option is call or put expiring at t2
        double chooser = CompoundChooserOptionPricer.priceSimpleChooser(s, k2, t1, t2, r, 0.0, vol);
        double vanillaCall = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, s, k2, t2, r, vol);
        double vanillaPut = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.PUT, s, k2, t2, r, vol);

        // Chooser is strictly more valuable than either individual vanilla call or put
        check(chooser > vanillaCall, "Chooser > Vanilla Call");
        check(chooser > vanillaPut, "Chooser > Vanilla Put");
    }

    private static void testSabrAndDupire() {
        // SABR Model: alpha = 0.20, beta = 0.5 (CIR elasticity), rho = -0.30 (equity negative skew), nu = 0.40
        SabrModel sabr = new SabrModel(0.20, 0.5, -0.30, 0.40);
        double fwd = 100.0;
        double t = 1.0;

        double volAtm = sabr.impliedVolatility(fwd, 100.0, t);
        double volOtmPut = sabr.impliedVolatility(fwd, 80.0, t);
        double volOtmCall = sabr.impliedVolatility(fwd, 120.0, t);

        // With rho = -0.30, lower strike (OTM put) has higher implied vol than higher strike (OTM call)
        check(volOtmPut > volAtm, "SABR negative skew: Vol(80) > Vol(100)");
        check(volOtmPut > volOtmCall, "SABR negative skew: Vol(80) > Vol(120)");

        // Dupire Local Volatility test on Black-Scholes surface (where local vol == constant sigma)
        double flatVol = 0.22;
        double localVol = DupireLocalVolatility.computeLocalVolatility(
                (strike, maturity) -> GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, 100.0, strike, maturity, 0.05, flatVol),
                100.0,
                1.0,
                0.05,
                0.0
        );
        assertEquals(flatVol, localVol, 0.02, "Dupire local volatility recovers flat Black-Scholes volatility");
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
