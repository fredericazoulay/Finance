package com.finance.pricer.api.controller;

import com.finance.pricer.api.dto.AiAnswerResponse;
import com.finance.pricer.api.dto.AiQuestionRequest;
import com.finance.pricer.api.dto.BondTargetExtractionRequest;
import com.finance.pricer.api.dto.BondTargetExtractionResponse;
import com.finance.pricer.api.service.AiAssistantService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/ai")
@CrossOrigin(origins = {"http://localhost:4200", "http://localhost:4201"})
public class AiAssistantController {
    private final AiAssistantService service;

    public AiAssistantController(AiAssistantService service) {
        this.service = service;
    }

    @PostMapping("/ask")
    public ResponseEntity<AiAnswerResponse> ask(@Valid @RequestBody AiQuestionRequest request) {
        return ResponseEntity.ok(new AiAnswerResponse(service.answer(request.question(), request.context())));
    }

    @PostMapping("/extract-bond-target")
    public ResponseEntity<BondTargetExtractionResponse> extractBondTarget(
            @Valid @RequestBody BondTargetExtractionRequest request) {
        return ResponseEntity.ok(service.extractBondTarget(request.description()));
    }
}