package com.finance.pricer.api.service;

import com.finance.pricer.api.dto.BondComparablesPricingRequest;
import com.finance.pricer.api.dto.BondComparablesPricingResponse;
import com.finance.pricer.core.calendar.BusinessDayConvention;
import com.finance.pricer.core.calendar.DayCountConvention;
import com.finance.pricer.core.calendar.FinancialCalendar;
import com.finance.pricer.fixedincome.bonds.BondAnalytics;
import com.finance.pricer.fixedincome.bonds.FixedCouponBond;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Service
public class BondComparablesPricingService {
    private static final int DEFAULT_MATURITY_TOLERANCE_MONTHS = 24;
    private static final int UNKNOWN_RATING_DISTANCE = 100;

    @Value("${pricer.bonds.comparables.max-price-age-days:7}")
    private long maxPriceAgeDays = 7;

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
        eligible.sort(rankingComparator(target));
        BondComparablesPricingRequest.ComparableBond best = selectBestComparable(eligible);
        List<BondComparablesPricingResponse.PanelItem> rankedItems = markSelectedBond(items, eligible, best, target);
        BondComparablesPricingResponse.BondValuation valuation = calculateValuation(target, best);

        return new BondComparablesPricingResponse(
            target.securityId(), target.currency().trim().toUpperCase(), tolerance,
            rankedItems, best.securityId(), best.yieldToMaturity(), valuation, rankingCriteria());
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

        private List<BondComparablesPricingRequest.ComparableBond> collectEligibleBonds(
            BondComparablesPricingRequest.TargetBond target,
            List<BondComparablesPricingRequest.ComparableBond> bonds,
            int tolerance,
            List<BondComparablesPricingResponse.PanelItem> items) {
        List<BondComparablesPricingRequest.ComparableBond> eligible = new ArrayList<>();
        for (BondComparablesPricingRequest.ComparableBond bond : bonds) {
            String exclusionReason = exclusionReason(target, bond, tolerance);
            boolean isEligible = exclusionReason == null;
            if (isEligible) eligible.add(bond);
                items.add(new BondComparablesPricingResponse.PanelItem(
                    bond, isEligible, false, exclusionReason, null, List.of()));
        }
        return eligible;
        }

        private static BondComparablesPricingRequest.ComparableBond selectBestComparable(
            List<BondComparablesPricingRequest.ComparableBond> eligible) {
            if (eligible.isEmpty()) {
                throw new IllegalArgumentException("No eligible comparable bonds in the panel");
            }
            return eligible.get(0);
            }

            private static List<BondComparablesPricingResponse.PanelItem> markSelectedBond(
                List<BondComparablesPricingResponse.PanelItem> items,
                List<BondComparablesPricingRequest.ComparableBond> ranked,
                BondComparablesPricingRequest.ComparableBond best,
                BondComparablesPricingRequest.TargetBond target) {
            Map<BondComparablesPricingRequest.ComparableBond, Integer> ranks = new IdentityHashMap<>();
            for (int index = 0; index < ranked.size(); index++) ranks.put(ranked.get(index), index + 1);
            return items.stream()
                .map(item -> new BondComparablesPricingResponse.PanelItem(
                        item.bond(), item.eligible(), item.bond() == best, item.exclusionReason(),
                        ranks.get(item.bond()), item.eligible() ? rankingReasons(target, item.bond()) : List.of()))
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
                    for (FixedCouponBond.CouponPayment payment : bond.getCashFlows()) {
                        if (!payment.periodStart().isAfter(settlementDate) && settlementDate.isBefore(payment.periodEnd())) {
                            return payment.periodStart();
                        }
                    }
                    return settlementDate;
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
                return switch (dayCount.trim().toUpperCase(Locale.ROOT).replace('/', '_').replace(' ', '_')) {
                    case "30_360", "THIRTY_360", "THIRTY_E_360" -> DayCountConvention.THIRTY_E_360;
                    case "THIRTY_360_US" -> DayCountConvention.THIRTY_360_US;
                    case "ACT_360", "ACTUAL_360" -> DayCountConvention.ACT_360;
                    case "ACT_365F", "ACT_365", "ACTUAL_365", "ACTUAL_365F" -> DayCountConvention.ACT_365F;
                    case "ACT_ACT", "ACTUAL_ACTUAL", "ACT_ACT_ICMA", "ACTUAL_ACTUAL_ICMA" -> DayCountConvention.ACT_ACT_ICMA;
                    case "ACT_ACT_ISDA", "ACTUAL_ACTUAL_ISDA" -> DayCountConvention.ACT_ACT_ISDA;
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

    private String exclusionReason(
            BondComparablesPricingRequest.TargetBond target,
            BondComparablesPricingRequest.ComparableBond bond,
            int toleranceMonths) {
        if (bond == null) return "Missing bond data";
        if (bond.securityId() == null || bond.securityId().isBlank()) return "Missing security identifier";
        if (isSameSecurity(target, bond)) return "Target bond cannot be its own comparable";
        if (bond.currency() == null || !target.currency().equalsIgnoreCase(bond.currency().trim())) return "Currency differs from target";
        if (bond.maturityDate() == null || !bond.maturityDate().isAfter(target.settlementDate())) return "Invalid maturity date";
        if (bond.yieldToMaturity() == null || !Double.isFinite(bond.yieldToMaturity()) || bond.yieldToMaturity() <= -target.couponFrequency()) return "Invalid yield to maturity";
        if (bond.source() == null || bond.source().isBlank()) return "Missing market data source";
        if (bond.asOf() == null || bond.asOf().isBlank()) return "Missing market data as-of date";

        LocalDate asOf;
        try {
            asOf = LocalDate.parse(bond.asOf().trim());
        } catch (DateTimeParseException exception) {
            return "Invalid market data as-of date";
        }
        if (asOf.isAfter(target.settlementDate())) return "Market data as-of date is after settlement";
        if (ChronoUnit.DAYS.between(asOf, target.settlementDate()) > maxPriceAgeDays) {
            return "Market data is stale";
        }

        long targetMonths = ChronoUnit.MONTHS.between(target.settlementDate(), target.maturityDate());
        long bondMonths = ChronoUnit.MONTHS.between(target.settlementDate(), bond.maturityDate());
        if (Math.abs(targetMonths - bondMonths) > toleranceMonths) return "Maturity outside configured tolerance";
        return null;
    }

    private static Comparator<BondComparablesPricingRequest.ComparableBond> rankingComparator(
            BondComparablesPricingRequest.TargetBond target) {
        return Comparator
                .comparingInt((BondComparablesPricingRequest.ComparableBond bond) ->
                        exactMatchRank(target.issuer(), bond.issuer()))
                .thenComparingInt(bond -> ratingDistance(target.rating(), bond.rating()))
                .thenComparingInt(bond -> exactMatchRank(target.sector(), bond.sector()))
                .thenComparingInt(bond -> exactMatchRank(target.seniority(), bond.seniority()))
                .thenComparingLong(bond -> Math.abs(ChronoUnit.DAYS.between(target.maturityDate(), bond.maturityDate())))
                .thenComparing(Comparator.comparingDouble(
                        BondComparablesPricingRequest.ComparableBond::yieldToMaturity).reversed())
                .thenComparing(BondComparablesPricingRequest.ComparableBond::securityId, String.CASE_INSENSITIVE_ORDER);
    }

    private static int exactMatchRank(String targetValue, String comparableValue) {
        if (targetValue == null || targetValue.isBlank()) return 0;
        if (comparableValue == null || comparableValue.isBlank()) return 1;
        return normalizeIdentifier(targetValue).equals(normalizeIdentifier(comparableValue)) ? 0 : 1;
    }

    private static int ratingDistance(String targetRating, String comparableRating) {
        if (targetRating == null || targetRating.isBlank()) return 0;
        int targetRank = ratingRank(targetRating);
        int comparableRank = ratingRank(comparableRating);
        if (targetRank < 0 || comparableRank < 0) {
            return targetRating.equalsIgnoreCase(comparableRating == null ? "" : comparableRating.trim())
                    ? 0 : UNKNOWN_RATING_DISTANCE;
        }
        return Math.abs(targetRank - comparableRank);
    }

    private static int ratingRank(String value) {
        if (value == null || value.isBlank()) return -1;
        String normalized = value.toUpperCase(Locale.ROOT)
                .replace("STANDARD & POOR'S", "")
                .replace("STANDARD AND POOR'S", "")
                .replace("STANDARDPOORS", "")
                .replace("MOODY'S", "")
                .replace("MOODYS", "")
                .replace("S&P", "")
                .replace("FITCH", "")
                .replaceAll("[^A-Z0-9+\\-]", "");
        return switch (normalized) {
            case "AAA" -> 0;
            case "AA+", "AA1" -> 1;
            case "AA", "AA2" -> 2;
            case "AA-", "AA3" -> 3;
            case "A+", "A1" -> 4;
            case "A", "A2" -> 5;
            case "A-", "A3" -> 6;
            case "BBB+", "BAA1" -> 7;
            case "BBB", "BAA2" -> 8;
            case "BBB-", "BAA3" -> 9;
            case "BB+", "BA1" -> 10;
            case "BB", "BA2" -> 11;
            case "BB-", "BA3" -> 12;
            case "B+", "B1" -> 13;
            case "B", "B2" -> 14;
            case "B-", "B3" -> 15;
            case "CCC+", "CAA1" -> 16;
            case "CCC", "CAA2" -> 17;
            case "CCC-", "CAA3" -> 18;
            case "CC", "CA" -> 19;
            case "C" -> 20;
            case "D" -> 21;
            default -> -1;
        };
    }

    private static List<String> rankingReasons(
            BondComparablesPricingRequest.TargetBond target,
            BondComparablesPricingRequest.ComparableBond bond) {
        List<String> reasons = new ArrayList<>();
        if (target.issuer() != null && !target.issuer().isBlank()) {
            reasons.add(exactMatchRank(target.issuer(), bond.issuer()) == 0 ? "Issuer match" : "Issuer differs or is missing");
        }
        if (target.rating() != null && !target.rating().isBlank()) {
            int distance = ratingDistance(target.rating(), bond.rating());
            reasons.add(distance == UNKNOWN_RATING_DISTANCE
                    ? "Comparable rating unavailable or unrecognized"
                    : "Rating distance: " + distance + " notch(es)");
        }
        if (target.sector() != null && !target.sector().isBlank()) {
            reasons.add(exactMatchRank(target.sector(), bond.sector()) == 0 ? "Sector match" : "Sector differs or is missing");
        }
        if (target.seniority() != null && !target.seniority().isBlank()) {
            reasons.add(exactMatchRank(target.seniority(), bond.seniority()) == 0 ? "Seniority match" : "Seniority differs or is missing");
        }
        long maturityGapMonths = Math.abs(ChronoUnit.MONTHS.between(target.maturityDate(), bond.maturityDate()));
        reasons.add("Maturity gap: " + maturityGapMonths + " month(s)");
        reasons.add("YTM considered after similarity criteria");
        return List.copyOf(reasons);
    }

    private static List<String> rankingCriteria() {
        return List.of("Issuer exact match", "Rating notch distance", "Sector exact match",
                "Seniority exact match", "Maturity distance", "YTM descending", "Security ID ascending");
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
