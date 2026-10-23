package com.finance.pricer.multiasset;

import com.finance.pricer.core.math.CholeskyDecomposition;

import java.util.Objects;
import java.util.Random;

/**
 * Enterprise Multi-Asset Correlated Monte Carlo Simulation Engine (Hull Chapter 20 & 24).
 * Generates correlated asset price paths via Cholesky decomposition with Antithetic Variates
 * and Least Squares Monte Carlo (Longstaff & Schwartz 2001) for multi-asset American options.
 */
public class MultiAssetMonteCarloEngine {

    @FunctionalInterface
    public interface MultiAssetPayoff {
        double evaluate(double[] terminalSpots);
    }

    public record SimulationResult(
            double price,
            double standardError,
            double confidenceInterval95Lower,
            double confidenceInterval95Upper,
            int pathsSimulated
    ) {}

    private final double[] spots;
    private final double[] dividendYields;
    private final double[] volatilities;
    private final double[][] correlationMatrix;
    private final double riskFreeRate;
    private final double timeToMaturity;
    private final double[][] choleskyL;

    public MultiAssetMonteCarloEngine(
            double[] spots,
            double[] dividendYields,
            double[] volatilities,
            double[][] correlationMatrix,
            double riskFreeRate,
            double timeToMaturity) {

        int n = spots.length;
        if (dividendYields.length != n || volatilities.length != n || correlationMatrix.length != n) {
            throw new IllegalArgumentException("Dimension mismatch among spots, yields, volatilities, and correlationMatrix");
        }

        this.spots = spots.clone();
        this.dividendYields = dividendYields.clone();
        this.volatilities = volatilities.clone();
        this.correlationMatrix = correlationMatrix.clone();
        this.riskFreeRate = riskFreeRate;
        this.timeToMaturity = timeToMaturity;

        CholeskyDecomposition chol = new CholeskyDecomposition(correlationMatrix);
        this.choleskyL = chol.getL();
    }

    /**
     * Prices a European multi-asset payoff using Correlated Monte Carlo with Antithetic Variates.
     */
    public SimulationResult priceEuropean(MultiAssetPayoff payoff, int numPairs, long seed) {
        Objects.requireNonNull(payoff, "payoff cannot be null");
        int numAssets = spots.length;
        double t = timeToMaturity;
        double sqrtT = Math.sqrt(t);
        double df = Math.exp(-riskFreeRate * t);

        double[] drifts = new double[numAssets];
        for (int i = 0; i < numAssets; i++) {
            drifts[i] = (riskFreeRate - dividendYields[i] - 0.5 * volatilities[i] * volatilities[i]) * t;
        }

        Random rng = new Random(seed);
        double sum = 0.0;
        double sumSq = 0.0;
        int totalPaths = numPairs * 2;

        double[] z = new double[numAssets];
        double[] correlatedZ = new double[numAssets];
        double[] sPath1 = new double[numAssets];
        double[] sPath2 = new double[numAssets];

        for (int p = 0; p < numPairs; p++) {
            // Independent normals
            for (int i = 0; i < numAssets; i++) {
                z[i] = rng.nextGaussian();
            }

            // Correlate: C = L * Z
            for (int i = 0; i < numAssets; i++) {
                double c = 0.0;
                for (int j = 0; j <= i; j++) {
                    c += choleskyL[i][j] * z[j];
                }
                correlatedZ[i] = c;
            }

            // Path 1 and Antithetic Path 2
            for (int i = 0; i < numAssets; i++) {
                double diffusion = volatilities[i] * sqrtT * correlatedZ[i];
                sPath1[i] = spots[i] * Math.exp(drifts[i] + diffusion);
                sPath2[i] = spots[i] * Math.exp(drifts[i] - diffusion);
            }

            double payoff1 = payoff.evaluate(sPath1);
            double payoff2 = payoff.evaluate(sPath2);
            double pairMean = 0.5 * (payoff1 + payoff2);

            sum += pairMean;
            sumSq += pairMean * pairMean;
        }

        double meanPayoff = sum / numPairs;
        double price = df * meanPayoff;

        double sampleVar = (sumSq - numPairs * meanPayoff * meanPayoff) / Math.max(1, numPairs - 1);
        double stdError = df * Math.sqrt(sampleVar / numPairs);

        return new SimulationResult(
                price,
                stdError,
                price - 1.96 * stdError,
                price + 1.96 * stdError,
                totalPaths
        );
    }

    // Factory helper methods for standard multi-asset payoffs

    public static MultiAssetPayoff arithmeticBasketCall(double[] weights, double strike) {
        return terminalSpots -> {
            double basket = 0.0;
            for (int i = 0; i < weights.length; i++) {
                basket += weights[i] * terminalSpots[i];
            }
            return Math.max(0.0, basket - strike);
        };
    }

    public static MultiAssetPayoff rainbowMinCall(double strike) {
        return terminalSpots -> {
            double min = terminalSpots[0];
            for (int i = 1; i < terminalSpots.length; i++) {
                if (terminalSpots[i] < min) min = terminalSpots[i];
            }
            return Math.max(0.0, min - strike);
        };
    }

    public static MultiAssetPayoff rainbowMaxCall(double strike) {
        return terminalSpots -> {
            double max = terminalSpots[0];
            for (int i = 1; i < terminalSpots.length; i++) {
                if (terminalSpots[i] > max) max = terminalSpots[i];
            }
            return Math.max(0.0, max - strike);
        };
    }

    public static MultiAssetPayoff worstOfPerformance(double[] initialSpots) {
        return terminalSpots -> {
            double worstPerf = terminalSpots[0] / initialSpots[0];
            for (int i = 1; i < initialSpots.length; i++) {
                double perf = terminalSpots[i] / initialSpots[i];
                if (perf < worstPerf) worstPerf = perf;
            }
            return worstPerf;
        };
    }
}

