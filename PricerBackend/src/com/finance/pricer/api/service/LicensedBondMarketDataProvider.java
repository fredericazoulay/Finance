package com.finance.pricer.api.service;

import com.finance.pricer.api.dto.BondComparableSearchRequest;
import com.finance.pricer.api.dto.BondComparablesPricingRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.time.Duration;
import java.util.List;

@Service
public class LicensedBondMarketDataProvider implements BondMarketDataProvider {
    private final RestTemplate restTemplate;
    private final String baseUrl;
    private final String searchPath;
    private final String providerSource;
    private final String bearerToken;

    @Autowired
    public LicensedBondMarketDataProvider(
            RestTemplateBuilder restTemplateBuilder,
            @Value("${pricer.bonds.market-data.base-url:}") String baseUrl,
            @Value("${pricer.bonds.market-data.search-path:/bonds/comparables/search}") String searchPath,
            @Value("${pricer.bonds.market-data.source:Licensed market-data provider}") String providerSource,
            @Value("${pricer.bonds.market-data.bearer-token:}") String bearerToken,
            @Value("${pricer.bonds.market-data.connect-timeout-ms:3000}") long connectTimeoutMs,
            @Value("${pricer.bonds.market-data.read-timeout-ms:10000}") long readTimeoutMs) {
        this(restTemplateBuilder
                        .setConnectTimeout(Duration.ofMillis(connectTimeoutMs))
                        .setReadTimeout(Duration.ofMillis(readTimeoutMs))
                        .build(),
                baseUrl, searchPath, providerSource, bearerToken);
    }

    LicensedBondMarketDataProvider(
            RestTemplate restTemplate,
            String baseUrl,
            String searchPath,
            String providerSource,
            String bearerToken) {
        this.restTemplate = restTemplate;
        this.baseUrl = baseUrl == null ? "" : baseUrl.trim();
        this.searchPath = searchPath == null ? "" : searchPath.trim();
        this.providerSource = providerSource == null || providerSource.isBlank()
                ? "Licensed market-data provider"
                : providerSource.trim();
        this.bearerToken = bearerToken == null ? "" : bearerToken.trim();
    }

    @Override
    public boolean isConfigured() {
        return !baseUrl.isBlank() && !searchPath.isBlank();
    }

    @Override
    public List<BondComparablesPricingRequest.ComparableBond> search(BondComparableSearchRequest request) {
        if (!isConfigured()) {
            throw new IllegalStateException("Licensed bond market-data provider is not configured");
        }
        if (request == null || request.target() == null) {
            throw new IllegalArgumentException("target is required");
        }

        HttpHeaders headers = new HttpHeaders();
        if (!bearerToken.isBlank()) headers.setBearerAuth(bearerToken);
        ResponseEntity<List<BondComparablesPricingRequest.ComparableBond>> response = restTemplate.exchange(
                endpointUri(),
                HttpMethod.POST,
                new HttpEntity<>(request, headers),
                new ParameterizedTypeReference<>() {});
        List<BondComparablesPricingRequest.ComparableBond> bonds = response.getBody();
        if (bonds == null) {
            throw new IllegalStateException("Licensed provider returned an empty response body");
        }
        return bonds.stream().map(this::withConfiguredSource).toList();
    }

    private URI endpointUri() {
        String normalizedBase = baseUrl.replaceAll("/+$", "");
        String normalizedPath = searchPath.replaceAll("^/+", "");
        return URI.create(normalizedBase + "/" + normalizedPath);
    }

    private BondComparablesPricingRequest.ComparableBond withConfiguredSource(
            BondComparablesPricingRequest.ComparableBond bond) {
        if (bond == null) {
            throw new IllegalStateException("Licensed provider returned a null bond record");
        }
        String source = bond.source() == null || bond.source().isBlank() ? providerSource : bond.source();
        return new BondComparablesPricingRequest.ComparableBond(
                bond.securityId(), bond.name(), bond.issuer(), bond.currency(), bond.maturityDate(),
                bond.yieldToMaturity(), bond.couponRate(), bond.marketPrice(), bond.rating(), source,
                bond.asOf(), bond.issueDate(), bond.sector(), bond.seniority());
    }
}