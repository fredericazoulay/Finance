package com.finance.pricer.api.service;

import com.finance.pricer.DayCount;
import com.finance.pricer.api.dto.FinancialCalculatorRequest;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class FinancialCalculatorService {
    public Map<String, Object> calculate(String name, FinancialCalculatorRequest r) {
        return switch (name.trim().toLowerCase(Locale.ROOT).replace('_', '-')) {
            case "loan", "payment", "mortgage", "auto-loan", "student-loan" -> loan(r);
            case "refinance" -> refinance(r);
            case "house-affordability", "affordability" -> affordability(r);
            case "rent" -> rent(r);
            case "auto-lease", "lease" -> lease(r);
            case "compound-interest", "savings", "investment" -> compound(r);
            case "cd" -> cd(r);
            case "simple-interest" -> simple(r);
            case "bond", "bond-price", "bond-pricing" -> bond(r);
            case "annuity", "annuity-payout" -> annuity(r);
            case "retirement", "401k", "ira" -> retirement(r);
            case "roi" -> roi(r);
            case "irr" -> irr(r);
            case "payback-period" -> payback(r);
            case "present-value" -> presentValue(r);
            case "future-value" -> futureValueCalculator(r);
            case "debt-payoff", "credit-card", "credit-card-payoff" -> debt(r);
            case "inflation" -> inflation(r);
            case "sales-tax", "vat", "income-tax" -> tax(r);
            case "salary", "take-home-paycheck" -> salary(r);
            case "depreciation" -> depreciation(r);
            case "margin" -> margin(r);
            case "discount" -> discount(r);
            case "commission" -> commission(r);
            case "currency" -> currency(r);
            case "apr" -> apr(r);
            default -> throw new IllegalArgumentException("Unknown calculator: " + name);
        };
    }

    public Map<String, List<String>> catalog() {
        return Map.of(
            "Mortgage and Real Estate", List.of("mortgage", "loan", "payment", "apr"),
            "Auto", List.of("auto-loan", "auto-lease"),
            "Investment", List.of("simple-interest", "compound-interest", "savings", "investment", "cd", "bond", "roi", "irr", "payback-period", "present-value", "future-value"),
            "Retirement", List.of("retirement", "401k", "ira", "annuity", "annuity-payout"),
            "Tax and Salary", List.of("sales-tax", "vat", "income-tax", "salary", "take-home-paycheck"),
            "Real Estate", List.of("refinance", "house-affordability", "rent"),
            "Business", List.of("depreciation", "margin", "discount", "commission"),
            "Other", List.of("currency", "inflation", "debt-payoff", "credit-card-payoff", "student-loan")
        );
    }

    private Map<String, Object> refinance(FinancialCalculatorRequest r) {
        double balance = positive(first(r.currentBalance(), r.principal(), "currentBalance"), "currentBalance");
        double rate = nonNegative(first(r.newRate(), r.annualRate(), "newRate"), "newRate");
        double years = positive(r.termYears(), "termYears");
        double costs = nonNegative(r.closingCosts() == null ? 0 : r.closingCosts(), "closingCosts");
        double payment = periodicPayment(balance, rate / 12, years * 12);
        double total = payment * years * 12 + costs;
        return result("refinance", Map.of("newPayment", payment, "closingCosts", costs, "totalCost", total, "breakEvenMonths", costs == 0 ? 0 : Math.ceil(costs / Math.max(payment, 0.01))));
    }

    private Map<String, Object> affordability(FinancialCalculatorRequest r) {
        double income = positive(r.monthlyIncome(), "monthlyIncome");
        double expenses = nonNegative(r.monthlyExpenses() == null ? 0 : r.monthlyExpenses(), "monthlyExpenses");
        double rate = nonNegative(first(r.annualRate(), r.interestRate(), "annualRate"), "annualRate");
        double years = positive(r.termYears(), "termYears");
        double payment = Math.max(0, income * 0.28 - expenses);
        double loan = payment == 0 ? 0 : payment / (rate / 12 == 0 ? 1 / (years * 12) : rate / 12 / (1 - Math.pow(1 + rate / 12, -years * 12)));
        double downPayment = nonNegative(r.downPayment() == null ? 0 : r.downPayment(), "downPayment");
        return result("house-affordability", Map.of("maximumMonthlyPayment", payment, "maximumLoan", loan, "maximumHomePrice", loan + downPayment));
    }

    private Map<String, Object> rent(FinancialCalculatorRequest r) {
        double monthlyRent = positive(r.monthlyRent(), "monthlyRent");
        double property = positive(first(r.propertyValue(), r.amount(), "propertyValue"), "propertyValue");
        double annualYield = monthlyRent * 12 / property;
        return result("rent", Map.of("annualRent", monthlyRent * 12, "rentToValueRatio", annualYield, "monthlyRent", monthlyRent));
    }

    private Map<String, Object> lease(FinancialCalculatorRequest r) {
        double price = positive(first(r.principal(), r.amount(), "price"), "price");
        double residual = nonNegative(r.residualValue() == null ? price * 0.4 : r.residualValue(), "residualValue");
        double rate = nonNegative(first(r.annualRate(), r.interestRate(), "annualRate"), "annualRate");
        int months = (int) Math.ceil(positive(r.termYears(), "termYears") * 12);
        double depreciation = (price - residual) / months;
        double finance = (price + residual) * rate / 24;
        return result("auto-lease", Map.of("monthlyPayment", depreciation + finance, "depreciationCharge", depreciation, "financeCharge", finance, "months", months));
    }

    private Map<String, Object> cd(FinancialCalculatorRequest r) {
        Map<String, Object> result = compound(r);
        result.put("calculator", "cd");
        return result;
    }

    private Map<String, Object> payback(FinancialCalculatorRequest r) {
        double investment = positive(first(r.principal(), r.initialInvestment(), "initialInvestment"), "initialInvestment");
        double annualCashFlow = positive(first(r.annualContribution(), r.contribution(), "annualContribution"), "annualContribution");
        return result("payback-period", Map.of("years", investment / annualCashFlow, "initialInvestment", investment, "annualCashFlow", annualCashFlow));
    }

    private Map<String, Object> presentValue(FinancialCalculatorRequest r) {
        double future = positive(first(r.futureValue(), r.amount(), "futureValue"), "futureValue");
        double rate = nonNegative(first(r.annualRate(), r.interestRate(), "annualRate"), "annualRate");
        double years = positive(r.termYears(), "termYears");
        return result("present-value", Map.of("presentValue", future / Math.pow(1 + rate, years), "futureValue", future));
    }

    private Map<String, Object> futureValueCalculator(FinancialCalculatorRequest r) {
        double present = positive(first(r.presentValue(), r.principal(), "presentValue"), "presentValue");
        double rate = nonNegative(first(r.annualRate(), r.interestRate(), "annualRate"), "annualRate");
        double years = positive(r.termYears(), "termYears");
        return result("future-value", Map.of("presentValue", present, "futureValue", present * Math.pow(1 + rate, years)));
    }

    private Map<String, Object> loan(FinancialCalculatorRequest r) {
        double principal = positive(first(r.principal(), r.amount(), "principal"), "principal");
        double rate = nonNegative(first(r.annualRate(), r.interestRate(), "annualRate"), "annualRate");
        int frequency = positiveInt(r.paymentsPerYear(), 12, "paymentsPerYear");
        double periods = positive(r.termYears(), "termYears") * frequency;
        double periodicRate = rate / frequency;
        double payment = periodicPayment(principal, periodicRate, periods);
        double total = payment * periods;
        List<Map<String, Object>> schedule = new ArrayList<>();
        double balance = principal;
        for (int period = 1; period <= (int) periods; period++) {
            double interest = balance * periodicRate;
            double actualPayment = Math.min(payment, balance + interest);
            double principalPaid = actualPayment - interest;
            balance = Math.max(0, balance - principalPaid);
            schedule.add(Map.of(
                "period", period,
                "payment", actualPayment,
                "principal", principalPaid,
                "interest", interest,
                "balance", balance
            ));
        }
        return result("loan", Map.of("principal", principal, "payment", payment, "totalPaid", total, "totalInterest", total - principal, "numberOfPayments", (int) periods, "schedule", schedule));
    }

    private Map<String, Object> compound(FinancialCalculatorRequest r) {
        double principal = nonNegative(first(r.principal(), r.initialInvestment(), "principal"), "principal");
        double rate = nonNegative(r.returnRate() != null ? r.returnRate() : first(r.annualRate(), r.interestRate(), "annualRate"), "annualRate");
        double years = positive(r.termYears(), "termYears");
        int compounds = positiveInt(r.compoundsPerYear(), 12, "compoundsPerYear");
        double contribution = nonNegative(r.contribution() == null ? 0 : r.contribution(), "contribution");
        int contributionFrequency = positiveInt(r.contributionFrequency(), compounds, "contributionFrequency");
        double balance = principal * Math.pow(1 + rate / compounds, compounds * years);
        balance += futureValue(contribution, rate / contributionFrequency, years * contributionFrequency, Boolean.TRUE.equals(r.contributionAtBeginning()));
        double contributions = contribution * years * contributionFrequency;
        return result("compound-interest", Map.of("futureValue", balance, "principal", principal, "contributions", contributions, "interestEarned", balance - principal - contributions));
    }

    private Map<String, Object> simple(FinancialCalculatorRequest r) {
        double principal = positive(first(r.principal(), r.amount(), "principal"), "principal");
        double interest = principal * nonNegative(first(r.annualRate(), r.interestRate(), "annualRate"), "annualRate") * positive(r.termYears(), "termYears");
        return result("simple-interest", Map.of("principal", principal, "interest", interest, "futureValue", principal + interest));
    }

    private Map<String, Object> bond(FinancialCalculatorRequest r) {
        double faceValue = positive(r.faceValue(), "faceValue");
        double yield = nonNegative(first(r.annualRate(), r.interestRate(), "annualRate"), "annualRate");
        double couponRate = nonNegative(r.couponRate() == null ? 0 : r.couponRate(), "couponRate");
        int frequency = positiveInt(r.couponFrequency(), 1, "couponFrequency");
        LocalDate maturity = required(r.maturityDate(), "maturityDate");
        LocalDate settlement = required(r.settlementDate(), "settlementDate");
        if (!settlement.isBefore(maturity)) throw new IllegalArgumentException("settlementDate must be before maturityDate");

        DayCount convention = parseDayCount(r.dayCount());
        long couponMonths = 12L / frequency;
        LocalDate previousCoupon = maturity;
        while (!previousCoupon.isBefore(settlement)) previousCoupon = previousCoupon.minusMonths(couponMonths);
        LocalDate nextCoupon = previousCoupon.plusMonths(couponMonths);
        double accruedFraction = convention.yearFraction(previousCoupon, settlement)
                / convention.yearFraction(previousCoupon, nextCoupon);
        double coupon = faceValue * couponRate / frequency;
        double periodicYield = yield / frequency;
        double dirtyPrice = 0;
        LocalDate paymentDate = nextCoupon;
        int periods = 0;
        while (!paymentDate.isAfter(maturity)) {
            double cashFlow = coupon + (paymentDate.equals(maturity) ? faceValue : 0);
            dirtyPrice += cashFlow / Math.pow(1 + periodicYield, periods + 1 - accruedFraction);
            paymentDate = paymentDate.plusMonths(couponMonths);
            periods++;
        }
        double accruedInterest = coupon * accruedFraction;
        return result("bond", Map.of(
                "dirtyPrice", dirtyPrice,
                "cleanPrice", dirtyPrice - accruedInterest,
                "accruedInterest", accruedInterest,
                "accruedDays", ChronoUnit.DAYS.between(previousCoupon, settlement),
                "previousCouponDate", previousCoupon,
                "nextCouponDate", nextCoupon,
                "dayCount", convention.name()
        ));
    }

    private Map<String, Object> annuity(FinancialCalculatorRequest r) {
        double rate = nonNegative(first(r.annualRate(), r.interestRate(), "annualRate"), "annualRate");
        int frequency = positiveInt(r.paymentsPerYear(), 12, "paymentsPerYear");
        double periods = positive(r.termYears(), "termYears") * frequency;
        double payment = positive(r.payment(), "payment");
        double periodicRate = rate / frequency;
        double present = periodicRate == 0 ? payment * periods : payment * (1 - Math.pow(1 + periodicRate, -periods)) / periodicRate;
        return result("annuity", Map.of("payment", payment, "presentValue", present, "futureValue", futureValue(payment, periodicRate, periods, Boolean.TRUE.equals(r.contributionAtBeginning()))));
    }

    private Map<String, Object> retirement(FinancialCalculatorRequest r) {
        double savings = nonNegative(r.currentSavings() == null ? 0 : r.currentSavings(), "currentSavings");
        double contribution = nonNegative(first(r.annualContribution(), r.contribution(), "annualContribution"), "annualContribution");
        double rate = nonNegative(first(r.returnRate(), r.annualRate(), "returnRate"), "returnRate");
        double years = positive(r.termYears(), "termYears");
        double future = savings * Math.pow(1 + rate, years) + futureValue(contribution, rate, years, false);
        return result("retirement", Map.of("futureValue", future, "totalContributions", contribution * years, "investmentGrowth", future - savings - contribution * years));
    }

    private Map<String, Object> roi(FinancialCalculatorRequest r) {
        double invested = positive(first(r.principal(), r.initialInvestment(), "principal"), "principal");
        double returned = positive(first(r.futureValue(), r.amount(), "futureValue"), "futureValue");
        double gain = returned - invested;
        return result("roi", Map.of("gain", gain, "roi", gain / invested, "percentage", gain / invested * 100));
    }

    private Map<String, Object> irr(FinancialCalculatorRequest r) {
        List<Double> flows = r.cashFlows();
        if (flows == null || flows.size() < 2 || flows.stream().anyMatch(v -> v == null || !Double.isFinite(v))) throw new IllegalArgumentException("cashFlows must contain at least two finite values");
        double low = -0.9999, high = 10;
        for (int i = 0; i < 200; i++) { double mid = (low + high) / 2; if (npv(flows, mid) > 0) low = mid; else high = mid; }
        double irr = (low + high) / 2;
        return result("irr", Map.of("irr", irr, "percentage", irr * 100));
    }

    private Map<String, Object> debt(FinancialCalculatorRequest r) {
        double original = positive(first(r.principal(), r.amount(), "principal"), "principal");
        double balance = original;
        double rate = nonNegative(first(r.annualRate(), r.interestRate(), "annualRate"), "annualRate");
        double payment = positive(r.monthlyPayment() != null ? r.monthlyPayment() : r.payment(), "monthlyPayment");
        double monthlyRate = rate / 12;
        if (payment <= balance * monthlyRate) throw new IllegalArgumentException("monthlyPayment must exceed first month's interest");
        int months = 0; double interest = 0;
        while (balance > 1e-10 && months++ < 1200) { double monthInterest = balance * monthlyRate; interest += monthInterest; balance += monthInterest - Math.min(payment, balance + monthInterest); }
        if (months >= 1200) throw new IllegalArgumentException("Debt cannot be paid off with the supplied payment");
        return result("debt-payoff", Map.of("months", months, "years", months / 12.0, "totalInterest", interest, "totalPaid", original + interest));
    }

    private Map<String, Object> inflation(FinancialCalculatorRequest r) {
        double amount = positive(first(r.amount(), r.principal(), "amount"), "amount");
        double rate = nonNegative(first(r.inflationRate(), r.annualRate(), "inflationRate"), "inflationRate");
        double years = positive(r.termYears(), "termYears");
        double factor = Math.pow(1 + rate, years);
        return result("inflation", Map.of("futureCost", amount * factor, "purchasingPower", amount / factor));
    }

    private Map<String, Object> tax(FinancialCalculatorRequest r) {
        double amount = nonNegative(first(r.amount(), r.principal(), "amount"), "amount");
        double tax = amount * nonNegative(first(r.taxRate(), r.annualRate(), "taxRate"), "taxRate");
        return result("tax", Map.of("netAmount", amount + tax, "taxAmount", tax));
    }

    private Map<String, Object> salary(FinancialCalculatorRequest r) {
        double gross = positive(first(r.annualIncome(), r.amount(), "annualIncome"), "annualIncome");
        double taxRate = nonNegative(first(r.taxRate(), r.annualRate(), "taxRate"), "taxRate");
        double tax = gross * taxRate;
        return result("salary", Map.of("grossIncome", gross, "taxAmount", tax, "netIncome", gross - tax, "monthlyNetIncome", (gross - tax) / 12));
    }

    private Map<String, Object> depreciation(FinancialCalculatorRequest r) {
        double cost = positive(first(r.principal(), r.amount(), "cost"), "cost");
        double salvage = nonNegative(r.salvageValue() == null ? 0 : r.salvageValue(), "salvageValue");
        double life = positive(r.usefulLifeYears(), "usefulLifeYears");
        double annual = (cost - salvage) / life;
        return result("depreciation", Map.of("annualDepreciation", annual, "monthlyDepreciation", annual / 12, "depreciableBasis", cost - salvage));
    }

    private Map<String, Object> margin(FinancialCalculatorRequest r) {
        double sales = positive(first(r.amount(), r.salePrice(), "sales"), "sales");
        double marginRate = nonNegative(required(r.marginRate(), "marginRate"), "marginRate");
        double profit = sales * marginRate;
        return result("margin", Map.of("profit", profit, "cost", sales - profit, "marginPercentage", marginRate * 100));
    }

    private Map<String, Object> discount(FinancialCalculatorRequest r) {
        double price = positive(first(r.amount(), r.salePrice(), "price"), "price");
        double rate = nonNegative(first(r.discountRate(), r.taxRate(), "discountRate"), "discountRate");
        double discount = price * rate;
        return result("discount", Map.of("discountAmount", discount, "salePrice", price - discount, "originalPrice", price));
    }

    private Map<String, Object> commission(FinancialCalculatorRequest r) {
        double sale = positive(first(r.amount(), r.salePrice(), "saleAmount"), "saleAmount");
        double rate = nonNegative(required(r.commissionRate(), "commissionRate"), "commissionRate");
        double commission = sale * rate;
        return result("commission", Map.of("commission", commission, "netAmount", sale - commission, "commissionPercentage", rate * 100));
    }

    private Map<String, Object> currency(FinancialCalculatorRequest r) {
        double amount = first(r.amount(), r.principal(), "amount");
        double rate = positive(r.exchangeRate(), "exchangeRate");
        return result("currency", Map.of("convertedAmount", amount * rate, "exchangeRate", rate));
    }

    private Map<String, Object> apr(FinancialCalculatorRequest r) {
        double principal = positive(first(r.principal(), r.amount(), "principal"), "principal");
        double rate = nonNegative(first(r.annualRate(), r.interestRate(), "annualRate"), "annualRate");
        double fees = nonNegative(r.fees() == null ? 0 : r.fees(), "fees");
        double apr = rate + fees / (principal * positive(r.termYears(), "termYears"));
        return result("apr", Map.of("apr", apr, "percentage", apr * 100));
    }

    private static Map<String, Object> result(String calculator, Map<String, Object> values) { Map<String, Object> response = new LinkedHashMap<>(); response.put("calculator", calculator); response.putAll(values); return response; }
    private static double periodicPayment(double principal, double rate, double periods) { return rate == 0 ? principal / periods : principal * rate / (1 - Math.pow(1 + rate, -periods)); }
    private static double futureValue(double payment, double rate, double periods, boolean beginning) { if (rate == 0) return payment * periods; double value = payment * (Math.pow(1 + rate, periods) - 1) / rate; return beginning ? value * (1 + rate) : value; }
    private static double npv(List<Double> flows, double rate) { double value = 0; for (int i = 0; i < flows.size(); i++) value += flows.get(i) / Math.pow(1 + rate, i); return value; }
    private static double first(Double a, Double b, String name) { if (a != null) return a; if (b != null) return b; throw new IllegalArgumentException(name + " is required"); }
    private static <T> T required(T value, String name) { if (value == null) throw new IllegalArgumentException(name + " is required"); return value; }
    private static DayCount parseDayCount(String value) {
        if (value == null || value.isBlank()) return DayCount.THIRTY_360;
        return switch (value.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace('/', '_')) {
            case "ACT_360", "ACTUAL_360" -> DayCount.ACT_360;
            case "ACT_365F", "ACTUAL_365", "ACTUAL_365F" -> DayCount.ACT_365F;
            case "30_360", "THIRTY_360" -> DayCount.THIRTY_360;
            default -> throw new IllegalArgumentException("Unsupported dayCount: " + value);
        };
    }
    private static double positive(Double value, String name) { if (value == null || !Double.isFinite(value) || value <= 0) throw new IllegalArgumentException(name + " must be greater than zero"); return value; }
    private static double nonNegative(double value, String name) { if (!Double.isFinite(value) || value < 0) throw new IllegalArgumentException(name + " must be non-negative"); return value; }
    private static int positiveInt(Integer value, int fallback, String name) { int actual = value == null ? fallback : value; if (actual <= 0) throw new IllegalArgumentException(name + " must be greater than zero"); return actual; }
}
