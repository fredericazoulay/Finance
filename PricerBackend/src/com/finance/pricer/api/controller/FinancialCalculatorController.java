package com.finance.pricer.api.controller;

import com.finance.pricer.api.dto.FinancialCalculatorRequest;
import com.finance.pricer.api.service.FinancialCalculatorService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/calculators")
@CrossOrigin(origins = "http://localhost:4200")
public class FinancialCalculatorController {
    private final FinancialCalculatorService service;

    public FinancialCalculatorController(FinancialCalculatorService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, List<String>> catalog() {
        return service.catalog();
    }

    @PostMapping("/{calculator}")
    public ResponseEntity<Map<String, Object>> calculate(
            @PathVariable String calculator,
            @Valid @RequestBody FinancialCalculatorRequest request) {
        return ResponseEntity.ok(service.calculate(calculator, request));
    }
}
