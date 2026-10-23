package com.finance.pricer.api.service;

import com.finance.pricer.api.dto.BondComparablesPricingRequest;
import com.finance.pricer.api.dto.BondComparablesPricingResponse;
import com.finance.pricer.core.calendar.BusinessDayConvention;
import com.finance.pricer.core.calendar.DayCountConvention;
import com.finance.pricer.core.calendar.FinancialCalendar;
import com.finance.pricer.fixedincome.bonds.BondAnalytics;
import com.finance.pricer.fixedincome.bonds.FixedCouponBond;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

@Service
public class BondComparablesPricingService {
    private static final int DEFAULT_MATURITY_TOLERANCE_MONTHS = 24;

    public BondComparablesPricingResponse price(BondComparablesPricingRequest request) {
        if (request == null || request.target() == null) {
            throw new IllegalArgumentException("target is required");
        }

        BondComparablesPricingRequest.TargetBond target = request.target();
        validateTarget(target);
        int tolerance = maturityTolerance(request);
        List<BondComparablesPricingResponse.PanelItem> items = new ArrayList<>();
        List<BondComparablesPricingRequest.ComparableBond> eligible = collectEligibleBonds(
            target, request.panel() == null ? List.of() : request.panel(), tolerance, items);
        BondComparablesPricingRequest.ComparableBond best = selectBestComparable(eligible);
        List<BondComparablesPricingResponse.PanelItem> rankedItems = markSelectedBond(items, best);
        BondComparablesPricingResponse.BondValuation valuation = calculateValuation(target, best);

        return new BondComparablesPricingResponse(
            target.securityId(), target.currency().trim().toUpperCase(), tolerance,
            rankedItems, best.securityId(), best.yieldToMaturity(), valuation);
        }

        private static int maturityTolerance(BondComparablesPricingRequest request) {
        int tolerance = request.maturityToleranceMonths() == null
            ? DEFAULT_MATURITY_TOLERANCE_MONTHS
            : request.maturityToleranceMonths();
        if (tolerance < 0 || tolerance > 240) {
            throw new IllegalArgumentException("maturityToleranceMonths must be between 0 and 240");
        }
        return tolerance;
        }

        private static List<BondComparablesPricingRequest.ComparableBond> collectEligibleBonds(
            BondComparablesPricingRequest.TargetBond target,
            List<BondComparablesPricingRequest.ComparableBond> bonds,
            int tolerance,
            List<BondComparablesPricingResponse.PanelItem> items) {
        List<BondComparablesPricingRequest.ComparableBond> eligible = new ArrayList<>();
        for (BondComparablesPricingRequest.ComparableBond bond : bonds) {
            String exclusionReason = exclusionReason(target, bond, tolerance);
            boolean isEligible = exclusionReason == null;
            if (isEligible) eligible.add(bond);
            items.add(new BondComparablesPricingResponse.PanelItem(bond, isEligible, false, exclusionReason));
        }
        return eligible;
        }

        private static BondComparablesPricingRequest.ComparableBond selectBestComparable(
            List<BondComparablesPricingRequest.ComparableBond> eligible) {
        eligible.sort((left, right) -> {
            int yieldComparison = Double.compare(right.yieldToMaturity(), left.yieldToMaturity());
            if (yieldComparison != 0) return yieldComparison;
            String leftId = left.securityId();
            String rightId = right.securityId();
            if (leftId == null) return rightId == null ? 0 : 1;
            if (rightId == null) return -1;
            return leftId.compareToIgnoreCase(rightId);
        });
            if (eligible.isEmpty()) {
                throw new IllegalArgumentException("No eligible comparable bonds in the panel");
            }
            return eligible.get(0);
            }

            private static List<BondComparablesPricingResponse.PanelItem> markSelectedBond(
                List<BondComparablesPricingResponse.PanelItem> items,
                BondComparablesPricingRequest.ComparableBond best) {
            return items.stream()
                .map(item -> new BondComparablesPricingResponse.PanelItem(
                        item.bond(), item.eligible(), item.bond() == best, item.exclusionReason()))
                .toList();
            }

            private BondComparablesPricingResponse.BondValuation calculateValuation(
                BondComparablesPricingRequest.TargetBond target,
                BondComparablesPricingRequest.ComparableBond best) {
                FixedCouponBond bond = new FixedCouponBond(
                    target.securityId(),
                    target.faceValue(),
                    target.couponRate(),
                    target.couponFrequency(),
                    effectiveIssueDate(target),
                    target.maturityDate(),
                    parseDayCount(target.dayCount()),
                    FinancialCalendar.weekendsOnly(),
                    BusinessDayConvention.MODIFIED_FOLLOWING);
                double ytm = best.yieldToMaturity();
                double dirtyPrice = BondAnalytics.dirtyPriceFromYtm(bond, target.settlementDate(), ytm);
                double accruedInterest = bond.calculateAccruedInterest(target.settlementDate());
                double cleanPrice = dirtyPrice - accruedInterest;

        return new BondComparablesPricingResponse.BondValuation(
                    cleanPrice,
                    dirtyPrice,
                    accruedInterest,
                    ChronoUnit.DAYS.between(previousCouponDate(bond, target.settlementDate()), target.settlementDate()),
                    bond.getDayCountConvention().name(),
                    ytm,
                    BondAnalytics.macaulayDuration(bond, target.settlementDate(), ytm),
                    BondAnalytics.modifiedDuration(bond, target.settlementDate(), ytm),
                    BondAnalytics.convexity(bond, target.settlementDate(), ytm),
                    BondAnalytics.dv01(bond, target.settlementDate(), ytm));
    }

                private static LocalDate previousCouponDate(FixedCouponBond bond, LocalDate settlementDate) {
                return bond.getCashFlows().stream()
                    .filter(payment -> !payment.periodStart().isAfter(settlementDate)
                        && settlementDate.isBefore(payment.periodEnd()))
                    .map(FixedCouponBond.CouponPayment::periodStart)
                    .findFirst()
                    .orElse(settlementDate);
                }

        private static LocalDate effectiveIssueDate(BondComparablesPricingRequest.TargetBond target) {
            if (target.issueDate() != null) return target.issueDate();

            long couponMonths = 12L / target.couponFrequency();
            LocalDate previousCoupon = target.maturityDate();
            while (previousCoupon.isAfter(target.settlementDate())) {
                previousCoupon = previousCoupon.minusMonths(couponMonths);
            }
            return previousCoupon;
        }

                private static DayCountConvention parseDayCount(String dayCount) {
                return switch (dayCount.trim().toUpperCase(Locale.ROOT).replace('/', '_')) {
                    case "30_360", "THIRTY_360", "THIRTY_E_360" -> DayCountConvention.THIRTY_E_360;
                    case "THIRTY_360_US" -> DayCountConvention.THIRTY_360_US;
                    case "ACT_360", "ACTUAL_360" -> DayCountConvention.ACT_360;
                    case "ACT_365F", "ACT_365", "ACTUAL_365", "ACTUAL_365F" -> DayCountConvention.ACT_365F;
                    default -> throw new IllegalArgumentException("Unsupported dayCount: " + dayCount);
                };
                }

    private static void validateTarget(BondComparablesPricingRequest.TargetBond target) {
        if (target.securityId() == null || target.securityId().isBlank()) throw new IllegalArgumentException("target.securityId is required");
        if (target.currency() == null || target.currency().isBlank()) throw new IllegalArgumentException("target.currency is required");
        if (target.faceValue() == null || !Double.isFinite(target.faceValue()) || target.faceValue() <= 0) throw new IllegalArgumentException("target.faceValue must be greater than zero");
        if (target.couponRate() == null || !Double.isFinite(target.couponRate()) || target.couponRate() < 0) throw new IllegalArgumentException("target.couponRate must be non-negative");
        if (target.couponFrequency() == null || target.couponFrequency() <= 0 || 12 % target.couponFrequency() != 0) throw new IllegalArgumentException("target.couponFrequency must divide 12");
        LocalDate maturity = Objects.requireNonNull(target.maturityDate(), "target.maturityDate is required");
        LocalDate settlement = Objects.requireNonNull(target.settlementDate(), "target.settlementDate is required");
        if (target.issueDate() != null && target.issueDate().isAfter(settlement)) throw new IllegalArgumentException("target.issueDate must be on or before settlementDate");
        if (!settlement.isBefore(maturity)) throw new IllegalArgumentException("target settlementDate must be before maturityDate");
        if (target.dayCount() == null || target.dayCount().isBlank()) throw new IllegalArgumentException("target.dayCount is required");
        parseDayCount(target.dayCount());
    }

    private static String exclusionReason(
            BondComparablesPricingRequest.TargetBond target,
            BondComparablesPricingRequest.ComparableBond bond,
            int toleranceMonths) {
        if (bond == null) return "Missing bond data";
        if (bond.securityId() == null || bond.securityId().isBlank()) return "Missing security identifier";
        if (isSameSecurity(target, bond)) return "Target bond cannot be its own comparable";
        if (bond.currency() == null || !target.currency().equalsIgnoreCase(bond.currency().trim())) return "Currency differs from target";
        if (bond.maturityDate() == null || !bond.maturityDate().isAfter(target.settlementDate())) return "Invalid maturity date";
        if (bond.yieldToMaturity() == null || !Double.isFinite(bond.yieldToMaturity()) || bond.yieldToMaturity() <= -target.couponFrequency()) return "Invalid yield to maturity";

        long targetMonths = ChronoUnit.MONTHS.between(target.settlementDate(), target.maturityDate());
        long bondMonths = ChronoUnit.MONTHS.between(target.settlementDate(), bond.maturityDate());
        if (Math.abs(targetMonths - bondMonths) > toleranceMonths) return "Maturity outside configured tolerance";
        return null;
    }

        private static boolean isSameSecurity(
            BondComparablesPricingRequest.TargetBond target,
            BondComparablesPricingRequest.ComparableBond bond) {
        String targetId = normalizeIdentifier(target.securityId());
        String comparableId = normalizeIdentifier(bond.securityId());
        if (!targetId.isEmpty() && targetId.equals(comparableId)) return true;

        String targetName = normalizeIdentifier(target.name());
        return !targetName.isEmpty()
            && targetName.equals(normalizeIdentifier(bond.name()))
            && target.currency().trim().equalsIgnoreCase(bond.currency() == null ? "" : bond.currency().trim())
            && target.maturityDate().equals(bond.maturityDate())
            && (bond.couponRate() == null || Math.abs(target.couponRate() - bond.couponRate()) < 1e-8);
        }

        private static String normalizeIdentifier(String value) {
                return value == null ? "" : value.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        }
    }
