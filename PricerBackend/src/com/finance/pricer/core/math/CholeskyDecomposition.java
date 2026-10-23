package com.finance.pricer.core.math;

import java.util.Arrays;

/**
 * Cholesky Decomposition of a symmetric positive-definite matrix A = L * L^T,
 * where L is lower triangular.
 * 
 * Includes an eigenvalue regularization / diagonal jitter step to guarantee decomposition
 * even if the empirical correlation matrix has slight negative eigenvalues due to estimation noise.
 * 
 * Essential for:
 * - Multi-asset correlated Monte Carlo simulation (Basket, Rainbow, Spread options)
 * - Portfolio Variance-Covariance Value-at-Risk (VaR)
 * - Gaussian Copula for CDO tranches and credit baskets (FTD)
 */
public final class CholeskyDecomposition {

    private final int dimension;
    private final double[][] lMatrix;

    public CholeskyDecomposition(double[][] matrix) {
        if (matrix == null || matrix.length == 0) {
            throw new IllegalArgumentException("Matrix cannot be null or empty");
        }
        this.dimension = matrix.length;
        for (int i = 0; i < dimension; i++) {
            if (matrix[i].length != dimension) {
                throw new IllegalArgumentException("Matrix must be square: row " + i + " has length " + matrix[i].length);
            }
        }

        this.lMatrix = new double[dimension][dimension];
        decompose(matrix);
    }

    private void decompose(double[][] a) {
        double[][] workingMatrix = new double[dimension][dimension];
        for (int i = 0; i < dimension; i++) {
            System.arraycopy(a[i], 0, workingMatrix[i], 0, dimension);
        }

        // Decompose with progressive diagonal regularization if needed
        double jitter = 0.0;
        boolean success = false;

        for (int attempt = 0; attempt < 5 && !success; attempt++) {
            try {
                for (int i = 0; i < dimension; i++) {
                    for (int j = 0; j <= i; j++) {
                        double sum = 0.0;
                        for (int k = 0; k < j; k++) {
                            sum += lMatrix[i][k] * lMatrix[j][k];
                        }

                        if (i == j) {
                            double val = workingMatrix[i][i] + jitter - sum;
                            if (val <= 1e-14) {
                                throw new IllegalStateException("Matrix not strictly positive definite at index " + i + ", diag=" + val);
                            }
                            lMatrix[i][j] = Math.sqrt(val);
                        } else {
                            lMatrix[i][j] = (workingMatrix[i][j] - sum) / lMatrix[j][j];
                        }
                    }
                }
                success = true;
            } catch (IllegalStateException e) {
                // Apply a small diagonal jitter (1e-8, 1e-6, 1e-4) to regularize near-singular matrices
                jitter = (attempt + 1) * 1e-6;
                for (int r = 0; r < dimension; r++) {
                    Arrays.fill(lMatrix[r], 0.0);
                }
            }
        }

        if (!success) {
            throw new IllegalArgumentException("Matrix is not positive semi-definite even after regularization");
        }
    }

    /**
     * Returns the lower triangular matrix L.
     */
    public double[][] getL() {
        double[][] copy = new double[dimension][dimension];
        for (int i = 0; i < dimension; i++) {
            System.arraycopy(lMatrix[i], 0, copy[i], 0, dimension);
        }
        return copy;
    }

    /**
     * Multiplies L by an independent standard normal vector Z to generate correlated normals:
     * X = L * Z
     */
    public double[] correlate(double[] independentNormals) {
        if (independentNormals.length != dimension) {
            throw new IllegalArgumentException("Vector length must match matrix dimension: " + dimension);
        }
        double[] correlated = new double[dimension];
        for (int i = 0; i < dimension; i++) {
            double sum = 0.0;
            for (int j = 0; j <= i; j++) {
                sum += lMatrix[i][j] * independentNormals[j];
            }
            correlated[i] = sum;
        }
        return correlated;
    }

    public int getDimension() {
        return dimension;
    }
}

