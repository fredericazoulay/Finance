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
        Boolean contributionAtBeginning
) {}
