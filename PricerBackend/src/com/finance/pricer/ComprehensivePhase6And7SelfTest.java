package com.finance.pricer;

import com.finance.pricer.multiasset.MargrabeKirkSpreadOption;
import com.finance.pricer.multiasset.MultiAssetMonteCarloEngine;
import com.finance.pricer.options.vanilla.GeneralizedBlackScholes;
import com.finance.pricer.risk.MarketRiskEngine;
import com.finance.pricer.risk.StressScenarioEngine;

import java.util.List;

public final class ComprehensivePhase6And7SelfTest {

    public static void main(String[] args) {
        testMargrabeAndKirkSpread();
        testMultiAssetMonteCarlo();
        testMarketRiskVaRAndES();
        testStressScenarios();
        System.out.println("All Phase 6 & 7 Multi-Asset & Enterprise Risk Self-Tests PASSED successfully!");
    }

    private static void testMargrabeAndKirkSpread() {
        double s1 = 100.0;
        double s2 = 100.0;
        double q1 = 0.0;
        double q2 = 0.0;
        double sigma1 = 0.20;
        double sigma2 = 0.20;
        double rho = 0.50; // rho = 0.5
        double t = 1.0;

        // Effective volatility: sqrt(0.2^2 + 0.2^2 - 2*0.5*0.2*0.2) = 0.20
        double margrabe = MargrabeKirkSpreadOption.priceMargrabe(s1, s2, q1, q2, sigma1, sigma2, rho, t);
        // Margrabe with r=0 equals Black-Scholes call with S=100, K=100, r=0, vol=0.20
        double bsEquiv = GeneralizedBlackScholes.priceStandard(GeneralizedBlackScholes.OptionType.CALL, s1, s2, t, 0.0, 0.20);
        assertEquals(bsEquiv, margrabe, 1e-6, "Margrabe exchange option == Black-Scholes equivalent");

        // Kirk with strike K = 0 should match Margrabe
        double kirkZero = MargrabeKirkSpreadOption.priceKirkSpread(s1, s2, 0.0, 0.05, q1, q2, sigma1, sigma2, rho, t);
        // When r > 0, Margrabe has no discounting (since both assets are under zero dividends)
        double kirkZeroNoR = MargrabeKirkSpreadOption.priceKirkSpread(s1, s2, 0.0, 0.0, q1, q2, sigma1, sigma2, rho, t);
        assertEquals(margrabe, kirkZeroNoR, 1e-6, "Kirk at K=0 matches Margrabe");

        // Kirk with strike K = 5.0
        double kirkStrike5 = MargrabeKirkSpreadOption.priceKirkSpread(s1, s2, 5.0, 0.05, q1, q2, sigma1, sigma2, rho, t);
        check(kirkStrike5 > 0.0 && kirkStrike5 < margrabe, "Kirk with positive strike is positive and strictly lower than exchange option");
    }

    private static void testMultiAssetMonteCarlo() {
        double[] spots = {100.0, 100.0};
        double[] yields = {0.0, 0.0};
        double[] vols = {0.20, 0.20};
        double[][] corr = {
                {1.0, 0.6},
                {0.6, 1.0}
        };
        double r = 0.05;
        double t = 1.0;

        MultiAssetMonteCarloEngine mc = new MultiAssetMonteCarloEngine(spots, yields, vols, corr, r, t);

        // 50/50 basket call with strike 100
        double[] weights = {0.5, 0.5};
        MultiAssetMonteCarloEngine.SimulationResult basketRes = mc.priceEuropean(
                MultiAssetMonteCarloEngine.arithmeticBasketCall(weights, 100.0),
                5000, // 10,000 total paths with antithetic variates
                12345L
        );

        check(basketRes.price() > 5.0 && basketRes.price() < 15.0, "Basket call price in reasonable range: " + basketRes.price());
        check(basketRes.standardError() < 0.20, "Tight standard error from antithetic variates: " + basketRes.standardError());

        // Rainbow Min Call: max(0, min(S1, S2) - 100)
        MultiAssetMonteCarloEngine.SimulationResult minRes = mc.priceEuropean(
                MultiAssetMonteCarloEngine.rainbowMinCall(100.0),
                5000,
                12345L
        );
        // Rainbow Max Call: max(0, max(S1, S2) - 100)
        MultiAssetMonteCarloEngine.SimulationResult maxRes = mc.priceEuropean(
                MultiAssetMonteCarloEngine.rainbowMaxCall(100.0),
                5000,
                12345L
        );

        // Max rainbow is strictly more valuable than Min rainbow
        check(maxRes.price() > minRes.price(), "Rainbow Max (" + maxRes.price() + ") > Rainbow Min (" + minRes.price() + ")");
    }

    private static void testMarketRiskVaRAndES() {
        double portfolioVal = 1_000_000.0; // $1,000,000 portfolio
        double[] weights = {0.6, 0.4};
        // Daily covariance corresponding to 1% daily vol (approx 16% annualized)
        double[][] dailyCov = {
                {0.0001, 0.00005},
                {0.00005, 0.0001}
        };

        // 99% Parametric VaR (1-day)
        double var99 = MarketRiskEngine.computeParametricVaR(portfolioVal, weights, dailyCov, 0.99, 1);
        double es99 = MarketRiskEngine.computeParametricExpectedShortfall(portfolioVal, weights, dailyCov, 0.99, 1);

        check(var99 > 15000.0 && var99 < 25000.0, "1-day 99% VaR in expected range: " + var99);
        check(es99 > var99, "Expected Shortfall must be strictly greater than VaR (ES=" + es99 + ", VaR=" + var99 + ")");

        // Historical simulation test on 1000 simulated daily PnL returns
        double[] histPnl = new double[1000];
        java.util.Random rnd = new java.util.Random(999);
        for (int i = 0; i < 1000; i++) {
            histPnl[i] = portfolioVal * 0.01 * rnd.nextGaussian(); // Normal(0, 10,000)
        }

        double[] histRisk = MarketRiskEngine.computeHistoricalVaRAndES(histPnl, 0.99, 1);
        double histVaR = histRisk[0];
        double histES = histRisk[1];

        check(histVaR > 18000.0 && histVaR < 28000.0, "Historical 99% VaR aligns with parametric: " + histVaR);
        check(histES > histVaR, "Historical ES > Historical VaR");

        // Hull-White volatility updating: if current vol is twice historical vol, updated losses should double
        double[] rawReturns = {-0.02, -0.01, 0.03};
        double[] histVols = {0.01, 0.01, 0.01};
        double currentVol = 0.02;
        double[] adjReturns = MarketRiskEngine.applyHullWhiteVolatilityUpdating(rawReturns, currentVol, histVols);
        assertEquals(-0.04, adjReturns[0], 1e-9, "Hull-White scaled return");
    }

    private static void testStressScenarios() {
        double portfolioVal = 5_000_000.0;

        List<StressScenarioEngine.ScenarioImpact> impacts = StressScenarioEngine.runStressTests(
                portfolioVal,
                scenario -> {
                    // Toy portfolio: 60% equities, 40% fixed income (duration 5Y)
                    double eqPnl = 0.60 * portfolioVal * scenario.equityShockPct();
                    double irPnl = -0.40 * portfolioVal * 5.0 * (scenario.rateParallelShiftBps() / 10000.0);
                    return portfolioVal + eqPnl + irPnl;
                }
        );

        check(!impacts.isEmpty(), "Stress test impacts generated");
        for (StressScenarioEngine.ScenarioImpact imp : impacts) {
            check(imp.basePortfolioValue() == portfolioVal, "Correct base value");
            if (imp.scenarioName().equals("1987 Black Monday")) {
                check(imp.pnlChange() < 0.0, "1987 Black Monday produces loss");
            }
            if (imp.scenarioName().equals("Rates Up 100 bps")) {
                check(imp.pnlChange() < 0.0, "Rates hike produces bond loss");
            }
            if (imp.scenarioName().equals("Rates Down 100 bps")) {
                check(imp.pnlChange() > 0.0, "Rates cut produces bond gain");
            }
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

