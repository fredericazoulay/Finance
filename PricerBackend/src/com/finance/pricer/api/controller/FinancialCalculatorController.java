package com.finance.pricer.api.controller;

import com.finance.pricer.api.dto.FinancialCalculatorRequest;
import com.finance.pricer.api.dto.BondDirectPricingRequest;
import com.finance.pricer.api.dto.BondDirectPricingResponse;
import com.finance.pricer.api.dto.BondComparablesPricingRequest;
import com.finance.pricer.api.dto.BondComparablesPricingResponse;
import com.finance.pricer.api.dto.BondAnalyticsRequest;
import com.finance.pricer.api.dto.BondAnalyticsResponse;
import com.finance.pricer.api.service.BondDirectPricingService;
import com.finance.pricer.api.service.BondComparablesPricingService;
import com.finance.pricer.api.service.BondAnalyticsService;
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
@CrossOrigin(origins = {"http://localhost:4200"})
public class FinancialCalculatorController {
    private final FinancialCalculatorService service;
    private final BondComparablesPricingService bondComparablesPricingService;
    private final BondDirectPricingService bondDirectPricingService;
    private final BondAnalyticsService bondAnalyticsService;

    public FinancialCalculatorController(
            FinancialCalculatorService service,
            BondComparablesPricingService bondComparablesPricingService,
            BondDirectPricingService bondDirectPricingService,
            BondAnalyticsService bondAnalyticsService) {
        this.service = service;
        this.bondComparablesPricingService = bondComparablesPricingService;
        this.bondDirectPricingService = bondDirectPricingService;
        this.bondAnalyticsService = bondAnalyticsService;
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

    @PostMapping("/bonds/comparables/pricing")
    public ResponseEntity<BondComparablesPricingResponse> priceUsingComparables(
            @RequestBody BondComparablesPricingRequest request) {
        return ResponseEntity.ok(bondComparablesPricingService.price(request));
    }

    @PostMapping("/bonds/pricing/direct")
    public ResponseEntity<BondDirectPricingResponse> priceDirectly(
            @RequestBody BondDirectPricingRequest request) {
        return ResponseEntity.ok(bondDirectPricingService.calculate(request));
    }

    @PostMapping("/bonds/analytics")
    public ResponseEntity<BondAnalyticsResponse> analyzeBond(
            @RequestBody BondAnalyticsRequest request) {
        return ResponseEntity.ok(bondAnalyticsService.analyze(request));
    }
}
