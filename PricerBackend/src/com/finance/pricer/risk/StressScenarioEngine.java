package com.finance.pricer.risk;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.Function;

/**
 * Enterprise Stress Testing and Scenario Analysis Engine (Hull Chapter 22).
 * Evaluates portfolios under historical shocks, regulatory baseline shocks,
 * and custom yield curve steepeners/flatteners and volatility shocks.
 */
public class StressScenarioEngine {

    public record Scenario(
            String name,
            double equityShockPct,       // e.g. -0.226 for Black Monday 1987
            double rateParallelShiftBps, // e.g. +100 for 100 bps rate hike
            double rateSteepenerBps,     // e.g. short -50 bps, long +50 bps
            double creditSpreadShockBps, // e.g. +150 bps
            double volRelativeShockPct   // e.g. +0.50 for 50% relative vol spike
    ) {}

    public record ScenarioImpact(
            String scenarioName,
            double basePortfolioValue,
            double stressedPortfolioValue,
            double pnlChange,
            double pnlPercentage
    ) {}

    public static List<Scenario> standardHistoricalScenarios() {
        return List.of(
                new Scenario("1987 Black Monday", -0.226, -50.0, 0.0, 50.0, 1.00),
                new Scenario("2008 Lehman Collapse", -0.100, -75.0, 50.0, 250.0, 0.80),
                new Scenario("2020 Covid Shock", -0.120, -100.0, 25.0, 150.0, 0.70),
                new Scenario("Rates Up 100 bps", 0.0, 100.0, 0.0, 0.0, 0.0),
                new Scenario("Rates Down 100 bps", 0.0, -100.0, 0.0, 0.0, 0.0),
                new Scenario("Curve Steepener (+50/-50)", 0.0, 0.0, 50.0, 0.0, 0.0),
                new Scenario("Curve Flattener (-50/+50)", 0.0, 0.0, -50.0, 0.0, 0.0),
                new Scenario("Volatility Spike +50%", 0.0, 0.0, 0.0, 0.0, 0.50),
                new Scenario("Volatility Crush -30%", 0.0, 0.0, 0.0, 0.0, -0.30)
        );
    }

    /**
     * Runs stress tests across all scenarios.
     *
     * @param basePortfolioValue initial unperturbed portfolio value
     * @param revaluationFunction function mapping Scenario -> stressed portfolio value
     * @return list of scenario impacts
     */
    public static List<ScenarioImpact> runStressTests(
            double basePortfolioValue,
            Function<Scenario, Double> revaluationFunction) {

        List<ScenarioImpact> impacts = new ArrayList<>();
        for (Scenario scenario : standardHistoricalScenarios()) {
            double stressedVal = revaluationFunction.apply(scenario);
            double pnl = stressedVal - basePortfolioValue;
            double pnlPct = (basePortfolioValue != 0.0) ? (pnl / Math.abs(basePortfolioValue)) : 0.0;
            impacts.add(new ScenarioImpact(scenario.name(), basePortfolioValue, stressedVal, pnl, pnlPct));
        }
        return Collections.unmodifiableList(impacts);
    }
}

