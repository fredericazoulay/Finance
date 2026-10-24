package com.finance.pricer.api.dto;

import java.time.LocalDate;

public record BondDirectPricingRequest(
        String solveFor,
        Double faceValue,
        Double couponRate,
        Integer couponFrequency,
        Double price,
        Double ytm,
        Double termYears,
        LocalDate issueDate,
        LocalDate maturityDate,
        LocalDate settlementDate,
        String dayCount
) {}