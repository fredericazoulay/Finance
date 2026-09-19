package com.finance.pricer.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.LocalDate;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record FinancialCalculatorRequest(
        Double principal,
        Double amount,
        Double annualRate,
        Double interestRate,
        Double inflationRate,
        Double taxRate,
        Double exchangeRate,
        Double termYears,
        Integer paymentsPerYear,
        Integer compoundsPerYear,
        Double contribution,
        Integer contributionFrequency,
        Double downPayment,
        Double fees,
        Double payment,
        Double monthlyPayment,
        Double initialInvestment,
        Double annualContribution,
        Double returnRate,
        Double currentSavings,
        Double presentValue,
        Double futureValue,
        Double faceValue,
        Double couponRate,
        Integer couponFrequency,
        LocalDate maturityDate,
        LocalDate settlementDate,
        String dayCount,
        List<Double> cashFlows,
        Boolean contributionAtBeginning,
        Double currentBalance,
        Double newRate,
        Double closingCosts,
        Double propertyValue,
        Double monthlyIncome,
        Double monthlyExpenses,
        Double monthlyRent,
        Double homePrice,
        Double residualValue,
        Double salvageValue,
        Double usefulLifeYears,
        Double salePrice,
        Double costBasis,
        Double discountRate,
        Double marginRate,
        Double commissionRate,
        Double annualIncome
) {
    public FinancialCalculatorRequest(
            Double principal, Double amount, Double annualRate, Double interestRate,
            Double inflationRate, Double taxRate, Double exchangeRate, Double termYears,
            Integer paymentsPerYear, Integer compoundsPerYear, Double contribution,
            Integer contributionFrequency, Double downPayment, Double fees, Double payment,
            Double monthlyPayment, Double initialInvestment, Double annualContribution,
            Double returnRate, Double currentSavings, Double presentValue, Double futureValue,
            Double faceValue, Double couponRate, Integer couponFrequency, LocalDate maturityDate,
            LocalDate settlementDate, String dayCount, List<Double> cashFlows,
            Boolean contributionAtBeginning) {
        this(principal, amount, annualRate, interestRate, inflationRate, taxRate, exchangeRate,
                termYears, paymentsPerYear, compoundsPerYear, contribution, contributionFrequency,
                downPayment, fees, payment, monthlyPayment, initialInvestment, annualContribution,
                returnRate, currentSavings, presentValue, futureValue, faceValue, couponRate,
                couponFrequency, maturityDate, settlementDate, dayCount, cashFlows,
                contributionAtBeginning, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null);
    }
}
