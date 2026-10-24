package com.finance.pricer.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record BondTargetExtractionRequest(
        @NotBlank @Size(max = 5000) String description
) {}