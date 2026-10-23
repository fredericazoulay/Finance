package com.finance.pricer.api.service;

import com.finance.pricer.api.dto.BondComparablesPricingRequest;
import com.finance.pricer.api.dto.BondComparablesPricingResponse;
import com.finance.pricer.api.dto.FinancialCalculatorRequest;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class BondComparablesPricingService {
    private static final int DEFAULT_MATURITY_TOLERANCE_MONTHS = 24;
    private final FinancialCalculatorService calculatorService;

    public BondComparablesPricingService(FinancialCalculatorService calculatorService) {
        this.calculatorService = calculatorService;
    }

    public BondComparablesPricingResponse price(BondComparablesPricingRequest request) {
        if (request == null || request.target() == null) {
            throw new IllegalArgumentException("target is required");
        }

        BondComparablesPricingRequest.TargetBond target = request.target();
        validateTarget(target);
        int tolerance = request.maturityToleranceMonths() == null
                ? DEFAULT_MATURITY_TOLERANCE_MONTHS
                : request.maturityToleranceMonths();
        if (tolerance < 0 || tolerance > 240) {
            throw new IllegalArgumentException("maturityToleranceMonths must be between 0 and 240");
        }

        List<BondComparablesPricingRequest.ComparableBond> bonds = request.panel() == null
                ? List.of()
                : request.panel();
        List<BondComparablesPricingResponse.PanelItem> items = new ArrayList<>();
        List<BondComparablesPricingRequest.ComparableBond> eligible = new ArrayList<>();

        for (BondComparablesPricingRequest.ComparableBond bond : bonds) {
            String exclusionReason = exclusionReason(target, bond, tolerance);
            boolean isEligible = exclusionReason == null;
            if (isEligible) eligible.add(bond);
            items.add(new BondComparablesPricingResponse.PanelItem(bond, isEligible, false, exclusionReason));
        }

        BondComparablesPricingRequest.ComparableBond best = eligible.stream()
                .sorted(Comparator.comparingDouble(BondComparablesPricingRequest.ComparableBond::yieldToMaturity)
                        .reversed()
                        .thenComparing(BondComparablesPricingRequest.ComparableBond::securityId,
                                Comparator.nullsLast(String::compareToIgnoreCase)))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("No eligible comparable bonds in the panel"));

        List<BondComparablesPricingResponse.PanelItem> rankedItems = items.stream()
                .map(item -> new BondComparablesPricingResponse.PanelItem(
                        item.bond(), item.eligible(), item.bond() == best, item.exclusionReason()))
                .toList();

        Map<String, Object> price = calculatorService.calculate("bond", new FinancialCalculatorRequest(
                null, null, best.yieldToMaturity(), null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, target.faceValue(), target.couponRate(), target.couponFrequency(),
                target.maturityDate(), target.settlementDate(), target.dayCount(), null, null));

        BondComparablesPricingResponse.BondValuation valuation = new BondComparablesPricingResponse.BondValuation(
                number(price, "cleanPrice"),
                number(price, "dirtyPrice"),
                number(price, "accruedInterest"),
                ((Number) price.get("accruedDays")).longValue(),
                String.valueOf(price.get("dayCount")));

        return new BondComparablesPricingResponse(
                target.securityId(), target.currency().trim().toUpperCase(), tolerance,
                rankedItems, best.securityId(), best.yieldToMaturity(), valuation);
    }

    private static void validateTarget(BondComparablesPricingRequest.TargetBond target) {
        if (target.securityId() == null || target.securityId().isBlank()) throw new IllegalArgumentException("target.securityId is required");
        if (target.currency() == null || target.currency().isBlank()) throw new IllegalArgumentException("target.currency is required");
        if (target.faceValue() == null || !Double.isFinite(target.faceValue()) || target.faceValue() <= 0) throw new IllegalArgumentException("target.faceValue must be greater than zero");
        if (target.couponRate() == null || !Double.isFinite(target.couponRate()) || target.couponRate() < 0) throw new IllegalArgumentException("target.couponRate must be non-negative");
        if (target.couponFrequency() == null || target.couponFrequency() <= 0 || 12 % target.couponFrequency() != 0) throw new IllegalArgumentException("target.couponFrequency must divide 12");
        LocalDate maturity = Objects.requireNonNull(target.maturityDate(), "target.maturityDate is required");
        LocalDate settlement = Objects.requireNonNull(target.settlementDate(), "target.settlementDate is required");
        if (!settlement.isBefore(maturity)) throw new IllegalArgumentException("target settlementDate must be before maturityDate");
    }

    private static String exclusionReason(
            BondComparablesPricingRequest.TargetBond target,
            BondComparablesPricingRequest.ComparableBond bond,
            int toleranceMonths) {
        if (bond == null) return "Missing bond data";
        if (bond.securityId() == null || bond.securityId().isBlank()) return "Missing security identifier";
        if (target.securityId().equalsIgnoreCase(bond.securityId().trim())) return "Target bond cannot be its own comparable";
        if (bond.currency() == null || !target.currency().equalsIgnoreCase(bond.currency().trim())) return "Currency differs from target";
        if (bond.maturityDate() == null || !bond.maturityDate().isAfter(target.settlementDate())) return "Invalid maturity date";
        if (bond.yieldToMaturity() == null || !Double.isFinite(bond.yieldToMaturity()) || bond.yieldToMaturity() <= -target.couponFrequency()) return "Invalid yield to maturity";

        long targetMonths = ChronoUnit.MONTHS.between(target.settlementDate(), target.maturityDate());
        long bondMonths = ChronoUnit.MONTHS.between(target.settlementDate(), bond.maturityDate());
        if (Math.abs(targetMonths - bondMonths) > toleranceMonths) return "Maturity outside configured tolerance";
        return null;
    }

    private static double number(Map<String, Object> values, String key) {
        return ((Number) values.get(key)).doubleValue();
    }
}