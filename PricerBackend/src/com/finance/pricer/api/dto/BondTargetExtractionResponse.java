package com.finance.pricer.api.dto;

import java.time.LocalDate;
import java.util.List;

public record BondTargetExtractionResponse(
        String securityId,
        String name,
        String currency,
        Double faceValue,
        Double couponRate,
        Integer couponFrequency,
        LocalDate issueDate,
        LocalDate maturityDate,
        LocalDate settlementDate,
        String dayCount,
        List<String> missingFields,
        List<String> ambiguities
) {}