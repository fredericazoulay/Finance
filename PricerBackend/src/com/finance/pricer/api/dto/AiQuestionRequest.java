package com.finance.pricer.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AiQuestionRequest(
        @NotBlank @Size(max = 5000) String question,
        @Size(max = 12000) String context
) {}