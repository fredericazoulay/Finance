package com.finance.pricer.api.service;

import com.finance.pricer.core.curves.YieldCurve;
import com.finance.pricer.credit.CreditDefaultSwapEngine;
import com.finance.pricer.fixedincome.bonds.BondAnalytics;
import com.finance.pricer.fixedincome.bonds.FixedCouponBond;
import com.finance.pricer.linear.forwards.ForwardContract;
import com.finance.pricer.multiasset.MargrabeKirkSpreadOption;
import com.finance.pricer.options.exotics.*;
import com.finance.pricer.options.strategies.MultiLegStrategy;
import com.finance.pricer.options.vanilla.AnalyticalGreeks;
import com.finance.pricer.options.vanilla.BjerksundStensland;
import com.finance.pricer.options.vanilla.GeneralizedBlackScholes;
import com.finance.pricer.options.volatility.SabrModel;
import com.finance.pricer.rates.derivatives.InterestRateCapFloor;
import com.finance.pricer.rates.derivatives.SwaptionPricer;
import com.finance.pricer.risk.MarketRiskEngine;
import com.finance.pricer.risk.StressScenarioEngine;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Unified Financial Instrument Facade Service
 * Exposes all 8 phases of John C. Hull derivatives and financial engineering models.
 */
@Service
public class ComprehensivePricerService {

    // 1. Forwards & Futures
    public double priceForward(ForwardContract contract, YieldCurve discountCurve) {
        return contract.presentValue(discountCurve);
    }

    public double forwardTheoreticalPrice(ForwardContract contract, YieldCurve discountCurve) {
        return contract.theoreticalForwardPrice(discountCurve);
    }

    // 2. Fixed Income & Bonds
    public BondAnalytics.BondMetrics priceBond(FixedCouponBond bond, LocalDate settlementDate, double cleanPrice) {
        return BondAnalytics.computeAllMetrics(bond, settlementDate, cleanPrice);
    }

    public double calculateBondZSpread(FixedCouponBond bond, LocalDate settlementDate, double dirtyPrice, YieldCurve zeroCurve) {
        return BondAnalytics.calculateZSpread(bond, settlementDate, dirtyPrice, zeroCurve);
    }

    // 3. Vanilla Options & Greeks
    public AnalyticalGreeks.GreeksResult priceVanillaWithGreeks(
            GeneralizedBlackScholes.OptionType type,
            double spot,
            double strike,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        return AnalyticalGreeks.calculate(type, spot, strike, timeToMaturity, riskFreeRate, costOfCarry, volatility);
    }

    public double priceAmericanOption(
            GeneralizedBlackScholes.OptionType type,
            double spot,
            double strike,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        return BjerksundStensland.price(type, spot, strike, timeToMaturity, riskFreeRate, costOfCarry, volatility);
    }

    // 4. Multi-Leg Strategies
    public MultiLegStrategy.StrategyProfile analyzeStrategy(MultiLegStrategy strategy, double spot, double r, double vol) {
        return strategy.analyze(spot, r, vol);
    }

    // 5. Interest Rate Options & Credit
    public InterestRateCapFloor.CapFloorResult priceCapOrFloor(
            double notional,
            double strikeRate,
            double[] paymentTimes,
            YieldCurve discountCurve,
            YieldCurve forwardCurve,
            double volatility,
            boolean isCap) {

        return InterestRateCapFloor.priceCapOrFloor(notional, strikeRate, paymentTimes, discountCurve, forwardCurve, volatility, isCap);
    }

    public SwaptionPricer.EuropeanSwaptionResult priceSwaption(
            SwaptionPricer.SwaptionType type,
            double notional,
            double strikeRate,
            double optionMaturity,
            double swapTenor,
            int swapPaymentFrequency,
            YieldCurve yieldCurve,
            double volatility) {

        return SwaptionPricer.priceEuropeanBlack76(type, notional, strikeRate, optionMaturity, swapTenor, swapPaymentFrequency, yieldCurve, volatility);
    }

    public CreditDefaultSwapEngine.CdsPricingResult priceCds(
            double notional,
            double runningSpread,
            double recoveryRate,
            double[] paymentTenors,
            YieldCurve discountCurve,
            CreditDefaultSwapEngine.HazardRateCurve hazardRateCurve) {

        return CreditDefaultSwapEngine.priceCds(notional, runningSpread, recoveryRate, paymentTenors, discountCurve, hazardRateCurve);
    }

    // 6. Exotic Options
    public BarrierOptionPricer.BarrierResult priceBarrier(
            GeneralizedBlackScholes.OptionType optionType,
            BarrierOptionPricer.BarrierType barrierType,
            double spot,
            double strike,
            double barrier,
            double rebate,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        return BarrierOptionPricer.price(optionType, barrierType, spot, strike, barrier, rebate, timeToMaturity, riskFreeRate, costOfCarry, volatility);
    }

    public double priceAsianOption(
            AsianOptionPricer.AverageType avgType,
            GeneralizedBlackScholes.OptionType type,
            double spot,
            double strike,
            double timeToMaturity,
            double riskFreeRate,
            double costOfCarry,
            double volatility) {

        if (avgType == AsianOptionPricer.AverageType.GEOMETRIC) {
            return AsianOptionPricer.priceGeometricAverage(type, spot, strike, timeToMaturity, riskFreeRate, costOfCarry, volatility, 100);
        } else {
            return AsianOptionPricer.priceArithmeticTurnbullWakeman(type, spot, strike, timeToMaturity, riskFreeRate, costOfCarry, volatility);
        }
    }

    public double priceSpreadOption(
            double s1,
            double s2,
            double strike,
            double r,
            double q1,
            double q2,
            double sigma1,
            double sigma2,
            double correlation,
            double timeToMaturity) {

        return MargrabeKirkSpreadOption.priceKirkSpread(s1, s2, strike, r, q1, q2, sigma1, sigma2, correlation, timeToMaturity);
    }

    // 7. Volatility Smile & Surface
    public double getSabrImpliedVol(double alpha, double beta, double rho, double nu, double forward, double strike, double timeToMaturity) {
        SabrModel sabr = new SabrModel(alpha, beta, rho, nu);
        return sabr.impliedVolatility(forward, strike, timeToMaturity);
    }

    // 8. Market Risk & Stress Testing
    public MarketRiskEngine.RiskReport calculateMarketRisk(
            double portfolioValue,
            double[] weights,
            double[][] dailyCovariance,
            double[] historicalPnl,
            double confidenceLevel,
            int horizonDays) {

        double paramVaR = MarketRiskEngine.computeParametricVaR(portfolioValue, weights, dailyCovariance, confidenceLevel, horizonDays);
        double paramES = MarketRiskEngine.computeParametricExpectedShortfall(portfolioValue, weights, dailyCovariance, confidenceLevel, horizonDays);

        double histVaR = 0.0;
        double histES = 0.0;
        if (historicalPnl != null && historicalPnl.length >= 10) {
            double[] histRisk = MarketRiskEngine.computeHistoricalVaRAndES(historicalPnl, confidenceLevel, horizonDays);
            histVaR = histRisk[0];
            histES = histRisk[1];
        }

        return new MarketRiskEngine.RiskReport(confidenceLevel, horizonDays, paramVaR, paramES, histVaR, histES, portfolioValue);
    }

    public List<StressScenarioEngine.ScenarioImpact> runStressScenarios(
            double basePortfolioValue,
            java.util.function.Function<StressScenarioEngine.Scenario, Double> revaluationFunction) {

        return StressScenarioEngine.runStressTests(basePortfolioValue, revaluationFunction);
    }
}

