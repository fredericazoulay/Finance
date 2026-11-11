package com.finance.pricer.api.controller;

import com.finance.pricer.api.dto.BondComparableSearchRequest;
import com.finance.pricer.api.dto.BondComparablesPricingRequest;
import com.finance.pricer.api.service.BondMarketDataProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/calculators/bonds/comparables")
@CrossOrigin(origins = "http://localhost:4200")
public class BondMarketDataController {
    private final BondMarketDataProvider provider;

    public BondMarketDataController(BondMarketDataProvider provider) {
        this.provider = provider;
    }

    @PostMapping("/search")
    public ResponseEntity<?> search(@RequestBody BondComparableSearchRequest request) {
        if (request == null || request.target() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "target is required"));
        }
        if (request.target().currency() == null || request.target().currency().isBlank()
                || request.target().maturityDate() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "target currency and maturityDate are required"));
        }
        Integer tolerance = request.maturityToleranceMonths();
        if (tolerance != null && (tolerance < 0 || tolerance > 240)) {
            return ResponseEntity.badRequest().body(Map.of("message", "maturityToleranceMonths must be between 0 and 240"));
        }
        if (!provider.isConfigured()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("message", "Licensed bond market-data provider is not configured"));
        }

        try {
            List<BondComparablesPricingRequest.ComparableBond> bonds = provider.search(request);
            return ResponseEntity.ok(bonds);
        } catch (RestClientException | IllegalStateException exception) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("message", "Licensed bond market-data provider request failed"));
        }
    }
}