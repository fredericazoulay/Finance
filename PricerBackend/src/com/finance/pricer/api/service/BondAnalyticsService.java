package com.finance.pricer.api.service;

import com.finance.pricer.api.dto.BondAnalyticsRequest;
import com.finance.pricer.api.dto.BondAnalyticsResponse;
import com.finance.pricer.core.calendar.BusinessDayConvention;
import com.finance.pricer.core.calendar.DayCountConvention;
import com.finance.pricer.core.calendar.FinancialCalendar;
import com.finance.pricer.core.curves.YieldCurve;
import com.finance.pricer.core.curves.ZeroRateCurve;
import com.finance.pricer.fixedincome.bonds.BondAnalytics;
import com.finance.pricer.fixedincome.bonds.FixedCouponBond;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
public class BondAnalyticsService {
    public BondAnalyticsResponse analyze(BondAnalyticsRequest request) {
        if (request == null) throw new IllegalArgumentException("Request is required");

        String securityId = requiredText(request.securityId(), "securityId");
        String currency = requiredText(request.currency(), "currency").toUpperCase(Locale.ROOT);
        double faceValue = positive(request.faceValue(), "faceValue");
        double couponRate = nonNegative(request.couponRate(), "couponRate");
        int frequency = positiveFrequency(request.couponFrequency());
        LocalDate issueDate = required(request.issueDate(), "issueDate");
        LocalDate maturityDate = required(request.maturityDate(), "maturityDate");
        LocalDate settlementDate = required(request.settlementDate(), "settlementDate");
        if (issueDate.isAfter(settlementDate)) throw new IllegalArgumentException("issueDate must be on or before settlementDate");
        if (!maturityDate.isAfter(settlementDate)) throw new IllegalArgumentException("maturityDate must be after settlementDate");
        DayCountConvention bondDayCount = parseDayCount(request.dayCount(), "dayCount");
        double cleanPrice = positive(request.cleanPrice(), "cleanPrice");

        BondAnalyticsRequest.DiscountCurve curveRequest = request.discountCurve();
        if (curveRequest == null) throw new IllegalArgumentException("discountCurve is required");
        LocalDate curveReferenceDate = required(curveRequest.referenceDate(), "discountCurve.referenceDate");
        if (!curveReferenceDate.equals(settlementDate)) {
            throw new IllegalArgumentException("discountCurve.referenceDate must equal settlementDate");
        }
        DayCountConvention curveDayCount = parseDayCount(curveRequest.dayCount(), "discountCurve.dayCount");
        double[][] curvePoints = curvePoints(curveRequest);
        YieldCurve curve = new ZeroRateCurve(curveReferenceDate, curveDayCount, curvePoints[0], curvePoints[1]);
        double[] keyTenors = keyRateTenors(request.keyRateTenorsYears());

        FixedCouponBond bond = new FixedCouponBond(
                securityId, faceValue, couponRate, frequency, issueDate, maturityDate,
                bondDayCount, FinancialCalendar.weekendsOnly(), BusinessDayConvention.MODIFIED_FOLLOWING);
        double accruedInterest = bond.calculateAccruedInterest(settlementDate);
        double dirtyPrice = cleanPrice + accruedInterest;
        BondAnalytics.BondMetrics metrics = BondAnalytics.computeAllMetrics(bond, settlementDate, cleanPrice);
        double zSpread = BondAnalytics.calculateZSpread(bond, settlementDate, dirtyPrice, curve);
        double curveDirtyPrice = curveDirtyPrice(bond, settlementDate, curve);
        if (!Double.isFinite(curveDirtyPrice) || curveDirtyPrice <= 0.0) {
            throw new IllegalArgumentException("discountCurve produces an invalid bond price");
        }

        double[] krdValues = BondAnalytics.calculateKeyRateDurations(bond, settlementDate, keyTenors, curve);
        List<BondAnalyticsResponse.KeyRateDuration> keyRateDurations = new ArrayList<>(krdValues.length);
        for (int index = 0; index < krdValues.length; index++) {
            keyRateDurations.add(new BondAnalyticsResponse.KeyRateDuration(keyTenors[index], krdValues[index]));
        }

        return new BondAnalyticsResponse(
                securityId, currency, settlementDate, curveReferenceDate,
                bondDayCount.name(), curveDayCount.name(), metrics.cleanPrice(), metrics.dirtyPrice(),
                metrics.accruedInterest(), metrics.ytm(), metrics.macaulayDuration(),
                metrics.modifiedDuration(), metrics.convexity(), metrics.dv01(), zSpread,
                curveDirtyPrice, List.copyOf(keyRateDurations));
    }

    private static double[][] curvePoints(BondAnalyticsRequest.DiscountCurve request) {
        List<Double> times = request.timesYears();
        List<Double> rates = request.zeroRates();
        if (times == null || rates == null || times.size() < 2 || times.size() != rates.size()) {
            throw new IllegalArgumentException("discountCurve timesYears and zeroRates must have equal lengths of at least 2");
        }
        double[] primitiveTimes = new double[times.size()];
        double[] primitiveRates = new double[rates.size()];
        for (int index = 0; index < times.size(); index++) {
            Double time = times.get(index);
            Double rate = rates.get(index);
            if (time == null || !Double.isFinite(time) || time <= 0.0
                    || (index > 0 && time <= primitiveTimes[index - 1])) {
                throw new IllegalArgumentException("discountCurve timesYears must be finite, positive and strictly increasing");
            }
            if (rate == null || !Double.isFinite(rate)) {
                throw new IllegalArgumentException("discountCurve zeroRates must be finite");
            }
            primitiveTimes[index] = time;
            primitiveRates[index] = rate;
        }
        return new double[][] {primitiveTimes, primitiveRates};
    }

    private static double[] keyRateTenors(List<Double> values) {
        if (values == null || values.isEmpty()) throw new IllegalArgumentException("keyRateTenorsYears is required");
        double[] tenors = new double[values.size()];
        for (int index = 0; index < values.size(); index++) {
            Double tenor = values.get(index);
            if (tenor == null || !Double.isFinite(tenor) || tenor <= 0.0
                    || (index > 0 && tenor <= tenors[index - 1])) {
                throw new IllegalArgumentException("keyRateTenorsYears must be finite, positive and strictly increasing");
            }
            tenors[index] = tenor;
        }
        return tenors;
    }

    private static double curveDirtyPrice(FixedCouponBond bond, LocalDate settlementDate, YieldCurve curve) {
        double price = 0.0;
        for (FixedCouponBond.CouponPayment payment : bond.getCashFlows()) {
            if (payment.paymentDate().isAfter(settlementDate)) {
                price += payment.totalCashFlow() * curve.discountFactor(payment.paymentDate());
            }
        }
        return price;
    }

    private static DayCountConvention parseDayCount(String value, String field) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(field + " is required");
        return switch (value.trim().toUpperCase(Locale.ROOT).replace('/', '_').replace(' ', '_')) {
            case "30_360", "THIRTY_360", "THIRTY_E_360" -> DayCountConvention.THIRTY_E_360;
            case "THIRTY_360_US" -> DayCountConvention.THIRTY_360_US;
            case "ACT_360", "ACTUAL_360" -> DayCountConvention.ACT_360;
            case "ACT_365F", "ACT_365", "ACTUAL_365", "ACTUAL_365F" -> DayCountConvention.ACT_365F;
            case "ACT_ACT", "ACTUAL_ACTUAL", "ACT_ACT_ICMA", "ACTUAL_ACTUAL_ICMA" -> DayCountConvention.ACT_ACT_ICMA;
            case "ACT_ACT_ISDA", "ACTUAL_ACTUAL_ISDA" -> DayCountConvention.ACT_ACT_ISDA;
            default -> throw new IllegalArgumentException("Unsupported " + field + ": " + value);
        };
    }

    private static String requiredText(String value, String field) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(field + " is required");
        return value.trim();
    }

    private static LocalDate required(LocalDate value, String field) {
        if (value == null) throw new IllegalArgumentException(field + " is required");
        return value;
    }

    private static double positive(Double value, String field) {
        if (value == null || !Double.isFinite(value) || value <= 0.0) {
            throw new IllegalArgumentException(field + " must be finite and greater than zero");
        }
        return value;
    }

    private static double nonNegative(Double value, String field) {
        if (value == null || !Double.isFinite(value) || value < 0.0) {
            throw new IllegalArgumentException(field + " must be finite and non-negative");
        }
        return value;
    }

    private static int positiveFrequency(Integer value) {
        if (value == null || value <= 0 || 12 % value != 0) {
            throw new IllegalArgumentException("couponFrequency must be one of 1, 2, 3, 4, 6 or 12");
        }
        return value;
    }
}