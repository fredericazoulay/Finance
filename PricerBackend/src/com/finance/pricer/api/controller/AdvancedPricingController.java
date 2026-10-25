package com.finance.pricer.api.controller;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.finance.pricer.api.service.ComprehensivePricerService;
import com.finance.pricer.core.calendar.DayCountConvention;
import com.finance.pricer.core.curves.YieldCurve;
import com.finance.pricer.core.curves.ZeroRateCurve;
import com.finance.pricer.options.exotics.AsianOptionPricer;
import com.finance.pricer.options.exotics.BarrierOptionPricer;
import com.finance.pricer.options.exotics.BinaryOptionPricer;
import com.finance.pricer.options.exotics.CompoundChooserOptionPricer;
import com.finance.pricer.options.exotics.LookbackOptionPricer;
import com.finance.pricer.options.vanilla.GeneralizedBlackScholes;
import com.finance.pricer.rates.derivatives.SwaptionPricer;
import com.finance.pricer.linear.forwards.BondFutures;
import com.finance.pricer.linear.forwards.ForwardContract;
import com.finance.pricer.linear.forwards.FraContract;
import com.finance.pricer.linear.forwards.InterestRateFutures;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/advanced-pricing")
public class AdvancedPricingController {
    private final ComprehensivePricerService pricer;

    public AdvancedPricingController(ComprehensivePricerService pricer) {
        this.pricer = pricer;
    }

    @PostMapping("/rates/cap-floor")
    public InterestRateCapFloorResponse priceCapFloor(@RequestBody CapFloorRequest request) {
        positive(request.notional(), "notional");
        nonNegative(request.volatility(), "volatility");
        finite(request.strikeRate(), "strikeRate");
        double[] paymentTimes = increasingTimes(request.paymentTimes(), "paymentTimes", 2, true);
        var result = pricer.priceCapOrFloor(
                request.notional(), request.strikeRate(), paymentTimes,
                curve(request.discountCurve()), curve(request.forwardCurve()),
                request.volatility(), request.isCap());
        return new InterestRateCapFloorResponse(
                request.isCap() ? "CAP" : "FLOOR", result.totalValue(),
                result.capValue(), result.floorValue(), result.capletValues(), result.floorletValues());
    }

    @PostMapping("/rates/swaption/european")
    public SwaptionPricer.EuropeanSwaptionResult priceEuropeanSwaption(@RequestBody SwaptionRequest request) {
        positive(request.notional(), "notional");
        positive(request.strikeRate(), "strikeRate");
        positive(request.optionMaturity(), "optionMaturity");
        positive(request.swapTenor(), "swapTenor");
        positive(request.paymentFrequency(), "paymentFrequency");
        nonNegative(request.volatility(), "volatility");
        if (request.type() == null) throw new IllegalArgumentException("type is required");
        return pricer.priceSwaption(
                request.type(), request.notional(), request.strikeRate(), request.optionMaturity(),
                request.swapTenor(), request.paymentFrequency(), curve(request.yieldCurve()), request.volatility());
    }

    @PostMapping("/options/barrier")
    public BarrierOptionPricer.BarrierResult priceBarrier(@RequestBody BarrierRequest request) {
        positive(request.spot(), "spot");
        positive(request.strike(), "strike");
        positive(request.barrier(), "barrier");
        nonNegative(request.rebate(), "rebate");
        nonNegative(request.timeToMaturity(), "timeToMaturity");
        finite(request.riskFreeRate(), "riskFreeRate");
        finite(request.costOfCarry(), "costOfCarry");
        positive(request.volatility(), "volatility");
        if (request.optionType() == null || request.barrierType() == null) {
            throw new IllegalArgumentException("optionType and barrierType are required");
        }
        return pricer.priceBarrier(
                request.optionType(), request.barrierType(), request.spot(), request.strike(), request.barrier(),
                request.rebate(), request.timeToMaturity(), request.riskFreeRate(),
                request.costOfCarry(), request.volatility());
    }

    @PostMapping("/options/asian")
    public Map<String, Object> priceAsian(@RequestBody AsianRequest request) {
        positive(request.spot(), "spot");
        positive(request.strike(), "strike");
        positive(request.timeToMaturity(), "timeToMaturity");
        finite(request.riskFreeRate(), "riskFreeRate");
        finite(request.costOfCarry(), "costOfCarry");
        positive(request.volatility(), "volatility");
        if (request.averageType() == null || request.optionType() == null) {
            throw new IllegalArgumentException("averageType and optionType are required");
        }
        double price = pricer.priceAsianOption(
                request.averageType(), request.optionType(), request.spot(), request.strike(),
                request.timeToMaturity(), request.riskFreeRate(), request.costOfCarry(), request.volatility());
        return Map.of("product", "ASIAN_OPTION", "price", price, "currency", currency(request.currency()));
    }

    @PostMapping("/options/spread")
    public Map<String, Object> priceSpread(@RequestBody SpreadRequest request) {
        positive(request.spot1(), "spot1");
        positive(request.spot2(), "spot2");
        nonNegative(request.strike(), "strike");
        finite(request.riskFreeRate(), "riskFreeRate");
        finite(request.dividendYield1(), "dividendYield1");
        finite(request.dividendYield2(), "dividendYield2");
        positive(request.volatility1(), "volatility1");
        positive(request.volatility2(), "volatility2");
        if (!Double.isFinite(request.correlation()) || request.correlation() < -1 || request.correlation() > 1) {
            throw new IllegalArgumentException("correlation must be between -1 and 1");
        }
        positive(request.timeToMaturity(), "timeToMaturity");
        double price = pricer.priceSpreadOption(
                request.spot1(), request.spot2(), request.strike(), request.riskFreeRate(),
                request.dividendYield1(), request.dividendYield2(), request.volatility1(),
                request.volatility2(), request.correlation(), request.timeToMaturity());
        return Map.of("product", "SPREAD_OPTION", "price", price, "currency", currency(request.currency()));
    }

    @PostMapping("/volatility/sabr")
    public Map<String, Object> sabrImpliedVolatility(@RequestBody SabrRequest request) {
        positive(request.alpha(), "alpha");
        if (!Double.isFinite(request.beta()) || request.beta() < 0 || request.beta() > 1) {
            throw new IllegalArgumentException("beta must be between 0 and 1");
        }
        if (!Double.isFinite(request.rho()) || request.rho() <= -1 || request.rho() >= 1) {
            throw new IllegalArgumentException("rho must be between -1 and 1");
        }
        nonNegative(request.nu(), "nu");
        positive(request.forward(), "forward");
        positive(request.strike(), "strike");
        positive(request.timeToMaturity(), "timeToMaturity");
        double volatility = pricer.getSabrImpliedVol(
                request.alpha(), request.beta(), request.rho(), request.nu(),
                request.forward(), request.strike(), request.timeToMaturity());
        return Map.of("product", "SABR_IMPLIED_VOLATILITY", "impliedVolatility", volatility);
    }

    @PostMapping("/forwards")
    public Map<String, Object> priceForward(@RequestBody ForwardRequest request) {
        positive(request.spot(), "spot");
        finite(request.deliveryPrice(), "deliveryPrice");
        positive(request.timeToMaturity(), "timeToMaturity");
        if (request.type() == null) throw new IllegalArgumentException("type is required");
        finite(request.continuousYield(), "continuousYield");
        finite(request.storageCostRate(), "storageCostRate");
        finite(request.convenienceYield(), "convenienceYield");
        ForwardContract.Builder builder = new ForwardContract.Builder(request.type(), request.spot(), request.timeToMaturity())
                .deliveryPrice(request.deliveryPrice())
                .continuousYield(request.continuousYield())
                .storageCostRate(request.storageCostRate())
                .convenienceYield(request.convenienceYield());
        if (request.settlementDate() != null && request.maturityDate() != null) {
            builder.dates(request.settlementDate(), request.maturityDate());
        }
        if (request.cashDividends() != null) {
            builder.cashDividends(request.cashDividends().stream().map(dividend -> {
                if (dividend == null || dividend.date() == null || !Double.isFinite(dividend.amount()) || dividend.amount() < 0) {
                    throw new IllegalArgumentException("cashDividends must contain a date and non-negative amount");
                }
                return new ForwardContract.CashDividend(dividend.date(), dividend.amount());
            }).toList());
        }
        ForwardContract contract = builder.build();
        YieldCurve curve = curve(request.discountCurve());
        return Map.of(
                "product", "FORWARD",
                "underlyingType", contract.getType().name(),
                "theoreticalForwardPrice", pricer.forwardTheoreticalPrice(contract, curve),
                "presentValue", pricer.priceForward(contract, curve),
                "currency", currency(request.currency()));
    }

    @PostMapping("/rates/fra")
    public Map<String, Object> priceFra(@RequestBody FraRequest request) {
        positive(request.notional(), "notional");
        finite(request.agreedRate(), "agreedRate");
        if (request.side() == null || request.startDate() == null || request.maturityDate() == null) {
            throw new IllegalArgumentException("side, startDate and maturityDate are required");
        }
        if (!request.maturityDate().isAfter(request.startDate())) {
            throw new IllegalArgumentException("maturityDate must be after startDate");
        }
        DayCountConvention dayCount = request.dayCount() == null ? DayCountConvention.ACT_360 : request.dayCount();
        FraContract contract = new FraContract(
                request.side(), request.notional(), request.agreedRate(), request.startDate(), request.maturityDate(), dayCount);
        YieldCurve discount = curve(request.discountCurve());
        YieldCurve forward = request.forwardCurve() == null ? discount : curve(request.forwardCurve());
        return Map.of(
                "product", "FRA",
                "parRate", contract.parFraRate(forward),
                "presentValue", contract.presentValue(discount, forward),
                "accrualFraction", contract.accrualFraction(),
                "currency", currency(request.currency()));
    }

    @PostMapping("/futures/interest-rate")
    public Map<String, Object> priceInterestRateFuture(@RequestBody InterestRateFutureRequest request) {
        if (!Double.isFinite(request.futuresPrice()) || request.futuresPrice() < 0 || request.futuresPrice() > 100) {
            throw new IllegalArgumentException("futuresPrice must be between 0 and 100");
        }
        nonNegative(request.volatility(), "volatility");
        positive(request.t1(), "t1");
        if (!Double.isFinite(request.t2()) || request.t2() <= request.t1()) {
            throw new IllegalArgumentException("t2 must be greater than t1");
        }
        double futuresRate = InterestRateFutures.futuresPriceToRate(request.futuresPrice());
        return Map.of(
                "product", "INTEREST_RATE_FUTURE",
                "futuresRate", futuresRate,
                "convexityAdjustment", InterestRateFutures.convexityAdjustment(request.volatility(), request.t1(), request.t2()),
                "impliedForwardRate", InterestRateFutures.forwardRateFromFutures(
                        request.futuresPrice(), request.volatility(), request.t1(), request.t2()));
    }

    @PostMapping("/futures/bond")
    public BondFutureResponse priceBondFuture(@RequestBody BondFutureRequest request) {
        positive(request.futuresPrice(), "futuresPrice");
        if (request.deliverableBonds() == null || request.deliverableBonds().isEmpty()) {
            throw new IllegalArgumentException("deliverableBonds must not be empty");
        }
        List<BondFutures.DeliverableBond> deliverables = request.deliverableBonds().stream().map(bond -> {
            if (bond == null || bond.id() == null || bond.id().isBlank()) throw new IllegalArgumentException("deliverable bond id is required");
            positive(bond.cleanPrice(), "cleanPrice");
            nonNegative(bond.couponRate(), "couponRate");
            positive(bond.timeToMaturityYears(), "timeToMaturityYears");
            positive(bond.couponFrequencyPerYear(), "couponFrequencyPerYear");
            nonNegative(bond.accruedInterest(), "accruedInterest");
            return new BondFutures.DeliverableBond(
                    bond.id(), bond.cleanPrice(), bond.couponRate(), bond.timeToMaturityYears(),
                    bond.couponFrequencyPerYear(), bond.accruedInterest());
        }).toList();
        BondFutures.CtdResult result = BondFutures.findCheapestToDeliver(deliverables, request.futuresPrice());
        return new BondFutureResponse(
                result.bond().isinOrId(), result.conversionFactor(), result.basisCost(),
                BondFutures.computeInvoicePrice(request.futuresPrice(), result.conversionFactor(), result.bond().accruedInterest()));
    }

    @PostMapping("/options/digital")
    public Map<String, Object> priceDigital(@RequestBody DigitalOptionRequest request) {
        if (request.payoffType() == null || request.optionType() == null) {
            throw new IllegalArgumentException("payoffType and optionType are required");
        }
        positive(request.spot(), "spot");
        positive(request.strike(), "strike");
        nonNegative(request.timeToMaturity(), "timeToMaturity");
        finite(request.riskFreeRate(), "riskFreeRate");
        finite(request.costOfCarry(), "costOfCarry");
        nonNegative(request.volatility(), "volatility");
        double price = switch (request.payoffType()) {
            case CASH_OR_NOTHING -> {
                nonNegative(request.cashPayout(), "cashPayout");
                yield BinaryOptionPricer.priceCashOrNothing(
                        request.optionType(), request.spot(), request.strike(), request.cashPayout(),
                        request.timeToMaturity(), request.riskFreeRate(), request.costOfCarry(), request.volatility());
            }
            case ASSET_OR_NOTHING -> BinaryOptionPricer.priceAssetOrNothing(
                    request.optionType(), request.spot(), request.strike(), request.timeToMaturity(),
                    request.riskFreeRate(), request.costOfCarry(), request.volatility());
            case GAP -> {
                positive(request.strikePayoff(), "strikePayoff");
                positive(request.strikeTrigger(), "strikeTrigger");
                yield BinaryOptionPricer.priceGapOption(
                        request.optionType(), request.spot(), request.strikePayoff(), request.strikeTrigger(),
                        request.timeToMaturity(), request.riskFreeRate(), request.costOfCarry(), request.volatility());
            }
        };
        return Map.of("product", "DIGITAL_OPTION", "payoffType", request.payoffType().name(), "price", price);
    }

    @PostMapping("/options/lookback/floating-strike")
    public Map<String, Object> priceFloatingLookback(@RequestBody LookbackRequest request) {
        if (request.type() == null) throw new IllegalArgumentException("type is required");
        positive(request.spot(), "spot");
        positive(request.extremeSpot(), "extremeSpot");
        nonNegative(request.timeToMaturity(), "timeToMaturity");
        finite(request.riskFreeRate(), "riskFreeRate");
        finite(request.costOfCarry(), "costOfCarry");
        positive(request.volatility(), "volatility");
        double price = request.type() == LookbackOptionPricer.LookbackType.FLOATING_STRIKE
                ? request.isCall()
                    ? LookbackOptionPricer.priceFloatingCall(request.spot(), request.extremeSpot(), request.timeToMaturity(), request.riskFreeRate(), request.costOfCarry(), request.volatility())
                    : LookbackOptionPricer.priceFloatingPut(request.spot(), request.extremeSpot(), request.timeToMaturity(), request.riskFreeRate(), request.costOfCarry(), request.volatility())
                : throwUnsupportedFixedLookback();
        return Map.of("product", "LOOKBACK_OPTION", "type", request.type().name(), "price", price);
    }

    @PostMapping("/options/chooser")
    public Map<String, Object> priceChooser(@RequestBody ChooserRequest request) {
        positive(request.spot(), "spot");
        positive(request.strike(), "strike");
        positive(request.choiceTime(), "choiceTime");
        if (!Double.isFinite(request.expiryTime()) || request.expiryTime() <= request.choiceTime()) {
            throw new IllegalArgumentException("expiryTime must be greater than choiceTime");
        }
        finite(request.riskFreeRate(), "riskFreeRate");
        finite(request.dividendYield(), "dividendYield");
        positive(request.volatility(), "volatility");
        double price = CompoundChooserOptionPricer.priceSimpleChooser(
                request.spot(), request.strike(), request.choiceTime(), request.expiryTime(),
                request.riskFreeRate(), request.dividendYield(), request.volatility());
        return Map.of("product", "CHOOSER_OPTION", "price", price);
    }

    private static double throwUnsupportedFixedLookback() {
        throw new IllegalArgumentException("Only floating-strike lookback options are implemented");
    }

    private static YieldCurve curve(CurveRequest request) {
        if (request == null) throw new IllegalArgumentException("curve is required");
        double[] times = increasingTimes(request.timesYears(), "curve.timesYears", 2, false);
        if (request.zeroRates() == null || request.zeroRates().size() != times.length) {
            throw new IllegalArgumentException("curve.zeroRates must match curve.timesYears");
        }
        double[] rates = request.zeroRates().stream().mapToDouble(value -> {
            if (value == null || !Double.isFinite(value)) throw new IllegalArgumentException("curve.zeroRates must be finite");
            return value;
        }).toArray();
        DayCountConvention dayCount = request.dayCountConvention() == null
                ? DayCountConvention.ACT_365F : request.dayCountConvention();
        LocalDate referenceDate = request.referenceDate() == null ? LocalDate.now() : request.referenceDate();
        return new ZeroRateCurve(referenceDate, dayCount, times, rates);
    }

    private static double[] increasingTimes(List<Double> values, String field, int minimumSize, boolean allowZero) {
        if (values == null || values.size() < minimumSize) {
            throw new IllegalArgumentException(field + " must contain at least " + minimumSize + " points");
        }
        double[] times = new double[values.size()];
        for (int index = 0; index < values.size(); index++) {
            Double value = values.get(index);
            if (value == null || !Double.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
                throw new IllegalArgumentException(field + " must contain finite " + (allowZero ? "non-negative" : "positive") + " values");
            }
            if (index > 0 && value <= times[index - 1]) {
                throw new IllegalArgumentException(field + " must be strictly increasing");
            }
            times[index] = value;
        }
        return times;
    }

    private static void positive(double value, String field) {
        if (!Double.isFinite(value) || value <= 0) throw new IllegalArgumentException(field + " must be positive");
    }

    private static void nonNegative(double value, String field) {
        if (!Double.isFinite(value) || value < 0) throw new IllegalArgumentException(field + " must be non-negative");
    }

    private static void finite(double value, String field) {
        if (!Double.isFinite(value)) throw new IllegalArgumentException(field + " must be finite");
    }

    private static String currency(String value) {
        return value == null || value.isBlank() ? "UNSPECIFIED" : value.trim().toUpperCase(Locale.ROOT);
    }

    public record CurveRequest(
            @JsonProperty("times_years") List<Double> timesYears,
            @JsonProperty("zero_rates") List<Double> zeroRates,
            @JsonProperty("reference_date") LocalDate referenceDate,
            @JsonProperty("day_count") DayCountConvention dayCountConvention) {}

    public record CapFloorRequest(
            double notional,
            @JsonProperty("strike_rate") double strikeRate,
            @JsonProperty("payment_times") List<Double> paymentTimes,
            @JsonProperty("discount_curve") CurveRequest discountCurve,
            @JsonProperty("forward_curve") CurveRequest forwardCurve,
            double volatility,
            @JsonProperty("is_cap") boolean isCap) {}

    public record InterestRateCapFloorResponse(
            String type, double value, double capValue, double floorValue,
            double[] capletValues, double[] floorletValues) {}

    public record SwaptionRequest(
            SwaptionPricer.SwaptionType type,
            double notional,
            @JsonProperty("strike_rate") double strikeRate,
            @JsonProperty("option_maturity") double optionMaturity,
            @JsonProperty("swap_tenor") double swapTenor,
            @JsonProperty("payment_frequency") int paymentFrequency,
            @JsonProperty("yield_curve") CurveRequest yieldCurve,
            double volatility) {}

    public record BarrierRequest(
            GeneralizedBlackScholes.OptionType optionType,
            BarrierOptionPricer.BarrierType barrierType,
            double spot,
            double strike,
            double barrier,
            double rebate,
            @JsonProperty("time_to_maturity") double timeToMaturity,
            @JsonProperty("risk_free_rate") double riskFreeRate,
            @JsonProperty("cost_of_carry") double costOfCarry,
            double volatility) {}

    public record AsianRequest(
            @JsonProperty("average_type") AsianOptionPricer.AverageType averageType,
            GeneralizedBlackScholes.OptionType optionType,
            double spot,
            double strike,
            @JsonProperty("time_to_maturity") double timeToMaturity,
            @JsonProperty("risk_free_rate") double riskFreeRate,
            @JsonProperty("cost_of_carry") double costOfCarry,
            double volatility,
            String currency) {}

    public record SpreadRequest(
            @JsonProperty("spot_1") double spot1,
            @JsonProperty("spot_2") double spot2,
            double strike,
            @JsonProperty("risk_free_rate") double riskFreeRate,
            @JsonProperty("dividend_yield_1") double dividendYield1,
            @JsonProperty("dividend_yield_2") double dividendYield2,
            @JsonProperty("volatility_1") double volatility1,
            @JsonProperty("volatility_2") double volatility2,
            double correlation,
            @JsonProperty("time_to_maturity") double timeToMaturity,
            String currency) {}

    public record SabrRequest(
            double alpha,
            double beta,
            double rho,
            double nu,
            double forward,
            double strike,
            @JsonProperty("time_to_maturity") double timeToMaturity) {}

            public record CashDividendRequest(LocalDate date, double amount) {}

            public record ForwardRequest(
                ForwardContract.UnderlyingType type,
                double spot,
                @JsonProperty("delivery_price") double deliveryPrice,
                @JsonProperty("time_to_maturity") double timeToMaturity,
                @JsonProperty("continuous_yield") double continuousYield,
                @JsonProperty("storage_cost_rate") double storageCostRate,
                @JsonProperty("convenience_yield") double convenienceYield,
                @JsonProperty("cash_dividends") List<CashDividendRequest> cashDividends,
                @JsonProperty("settlement_date") LocalDate settlementDate,
                @JsonProperty("maturity_date") LocalDate maturityDate,
                @JsonProperty("discount_curve") CurveRequest discountCurve,
                String currency) {}

            public record FraRequest(
                FraContract.PayReceive side,
                double notional,
                @JsonProperty("agreed_rate") double agreedRate,
                @JsonProperty("start_date") LocalDate startDate,
                @JsonProperty("maturity_date") LocalDate maturityDate,
                @JsonProperty("day_count") DayCountConvention dayCount,
                @JsonProperty("discount_curve") CurveRequest discountCurve,
                @JsonProperty("forward_curve") CurveRequest forwardCurve,
                String currency) {}

            public record InterestRateFutureRequest(
                @JsonProperty("futures_price") double futuresPrice,
                double volatility,
                double t1,
                double t2) {}

            public record DeliverableBondRequest(
                String id,
                @JsonProperty("clean_price") double cleanPrice,
                @JsonProperty("coupon_rate") double couponRate,
                @JsonProperty("time_to_maturity_years") double timeToMaturityYears,
                @JsonProperty("coupon_frequency_per_year") int couponFrequencyPerYear,
                @JsonProperty("accrued_interest") double accruedInterest) {}

            public record BondFutureRequest(
                @JsonProperty("futures_price") double futuresPrice,
                @JsonProperty("deliverable_bonds") List<DeliverableBondRequest> deliverableBonds) {}

            public enum DigitalPayoffType { CASH_OR_NOTHING, ASSET_OR_NOTHING, GAP }

            public record DigitalOptionRequest(
                @JsonProperty("payoff_type") DigitalPayoffType payoffType,
                GeneralizedBlackScholes.OptionType optionType,
                double spot,
                double strike,
                @JsonProperty("cash_payout") double cashPayout,
                @JsonProperty("strike_payoff") double strikePayoff,
                @JsonProperty("strike_trigger") double strikeTrigger,
                @JsonProperty("time_to_maturity") double timeToMaturity,
                @JsonProperty("risk_free_rate") double riskFreeRate,
                @JsonProperty("cost_of_carry") double costOfCarry,
                double volatility) {}

            public record LookbackRequest(
                LookbackOptionPricer.LookbackType type,
                @JsonProperty("is_call") boolean isCall,
                double spot,
                @JsonProperty("extreme_spot") double extremeSpot,
                @JsonProperty("time_to_maturity") double timeToMaturity,
                @JsonProperty("risk_free_rate") double riskFreeRate,
                @JsonProperty("cost_of_carry") double costOfCarry,
                double volatility) {}

            public record ChooserRequest(
                double spot,
                double strike,
                @JsonProperty("choice_time") double choiceTime,
                @JsonProperty("expiry_time") double expiryTime,
                @JsonProperty("risk_free_rate") double riskFreeRate,
                @JsonProperty("dividend_yield") double dividendYield,
                double volatility) {}

            public record BondFutureResponse(
                @JsonProperty("cheapest_to_deliver_id") String cheapestToDeliverId,
                @JsonProperty("conversion_factor") double conversionFactor,
                @JsonProperty("basis_cost") double basisCost,
                @JsonProperty("invoice_price") double invoicePrice) {}
}