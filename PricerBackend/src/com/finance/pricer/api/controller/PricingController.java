package com.finance.pricer.api.controller;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.finance.pricer.Bond;
import com.finance.pricer.CdsPricer;
import com.finance.pricer.CreditDefaultSwap;
import com.finance.pricer.DiscountCurve;
import com.finance.pricer.FxForwardPricer;
import com.finance.pricer.InterestRateSwap;
import com.finance.pricer.MarketData;
import com.finance.pricer.Models;
import com.finance.pricer.Option;
import com.finance.pricer.OptionType;
import com.finance.pricer.PricingModel;
import com.finance.pricer.Stock;
import com.finance.pricer.SwapPricer;
import com.finance.pricer.api.dto.BloombergInstrument;
import com.finance.pricer.api.dto.BloombergMarketData;
import com.finance.pricer.api.dto.BloombergPricingRequest;
import com.finance.pricer.api.dto.BloombergPricingResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "http://localhost:4200")
public class PricingController {

    @GetMapping({"/health", "/v1/health"})
    public Map<String, String> health() {
        return Map.of("status", "UP", "service", "Finance Pricer API");
    }

    @GetMapping({"/products", "/v1/products", "/bloomberg/catalog", "/v1/blp/catalog"})
    public Map<String, List<String>> products() {
        return Map.of("products", List.of(
                "EQUITY_OPTION",
                "FIXED_INCOME_BOND",
                "EQUITY",
                "INTEREST_RATE_SWAP",
                "CREDIT_DEFAULT_SWAP",
                "FX_FORWARD"
        ));
    }

    @PostMapping({"/v1/blp/pricing/equity-option"})
    public ResponseEntity<BloombergPricingResponse> priceBloombergOption(@Valid @RequestBody BloombergPricingRequest request) {
        BloombergInstrument instrument = (BloombergInstrument) request.instrument();
        BloombergMarketData marketData = (BloombergMarketData) request.marketData();

        Option option = new Option(
                instrument.strike(),
                instrument.maturityYears(),
                OptionType.valueOf(instrument.optionType().toUpperCase(Locale.ROOT)),
                "EUROPEAN".equalsIgnoreCase(instrument.exerciseStyle())
        );
        MarketData md = new MarketData(
                marketData.underlyingSpot(),
                marketData.riskFreeRate(),
                marketData.impliedVolatility(),
                marketData.dividendYield()
        );
        PricingModel model = Models.create(request.pricingModel(), 100_000, 42L);
        double price = model.price(option, md);

        BloombergPricingResponse response = new BloombergPricingResponse(
                request.requestId(),
                "SUCCESS",
                OffsetDateTime.now(),
                request.securityId(),
                request.securityName(),
                "EQTY_OPT",
                request.curveName(),
                request.marketDataSource(),
                Map.of("price", price, "currency", "USD"),
                Map.of("pricing_model", model.name())
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping({"/v1/blp/pricing/irs"})
    public ResponseEntity<BloombergPricingResponse> priceBloombergSwap(@Valid @RequestBody BloombergPricingRequest request) {
        BloombergInstrument instrument = (BloombergInstrument) request.instrument();
        BloombergMarketData marketData = (BloombergMarketData) request.marketData();

        DiscountCurve curve = DiscountCurve.bootstrapParSwaps(
                marketData.tenors(),
                marketData.discountCurveRates(),
                marketData.frequency()
        );
        double parRate = SwapPricer.parRate(instrument.maturityYears(), instrument.paymentFrequency(), curve);
        InterestRateSwap swap = new InterestRateSwap(
                instrument.notional(),
                instrument.fixedRate(),
                instrument.maturityYears(),
                instrument.paymentFrequency(),
                instrument.receiver()
        );
        double pv = SwapPricer.presentValue(swap, curve);

        BloombergPricingResponse response = new BloombergPricingResponse(
                request.requestId(),
                "SUCCESS",
                OffsetDateTime.now(),
                request.securityId(),
                request.securityName(),
                "IRS",
                request.curveName(),
                request.marketDataSource(),
                Map.of("par_rate", parRate, "present_value", pv, "currency", "USD"),
                Map.of("pricing_model", request.pricingModel())
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping({"/v1/blp/pricing/cds"})
    public ResponseEntity<BloombergPricingResponse> priceBloombergCds(@Valid @RequestBody BloombergPricingRequest request) {
        BloombergInstrument instrument = (BloombergInstrument) request.instrument();
        BloombergMarketData marketData = (BloombergMarketData) request.marketData();

        CreditDefaultSwap cds = new CreditDefaultSwap(
                instrument.notional(),
                instrument.spread(),
                instrument.maturityYears(),
                instrument.paymentFrequency(),
                instrument.recoveryRate()
        );
        DiscountCurve curve = DiscountCurve.bootstrapParSwaps(
                marketData.tenors(),
                marketData.discountCurveRates(),
                marketData.frequency()
        );
        double impliedHazard = CdsPricer.impliedHazardRate(cds, curve);

        BloombergPricingResponse response = new BloombergPricingResponse(
                request.requestId(),
                "SUCCESS",
                OffsetDateTime.now(),
                request.securityId(),
                request.securityName(),
                "CDS",
                request.curveName(),
                request.marketDataSource(),
                Map.of("implied_hazard_rate", impliedHazard, "currency", "USD"),
                Map.of("pricing_model", request.pricingModel())
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping({"/v1/blp/pricing/fx-forward"})
    public ResponseEntity<BloombergPricingResponse> priceBloombergFxForward(@Valid @RequestBody BloombergPricingRequest request) {
        BloombergInstrument instrument = (BloombergInstrument) request.instrument();
        BloombergMarketData marketData = (BloombergMarketData) request.marketData();

        double forward = FxForwardPricer.forward(
                marketData.spot(),
                marketData.domesticRate(),
                marketData.foreignRate(),
                instrument.maturityYears()
        );

        BloombergPricingResponse response = new BloombergPricingResponse(
                request.requestId(),
                "SUCCESS",
                OffsetDateTime.now(),
                request.securityId(),
                request.securityName(),
                "FXC",
                request.curveName(),
                request.marketDataSource(),
                Map.of("forward_price", forward, "currency", "USD"),
                Map.of("pricing_model", request.pricingModel())
        );
        return ResponseEntity.ok(response);
    }

        @PostMapping({"/price/option", "/v1/bloomberg/pricing/equity-option"})
    public ResponseEntity<Map<String, Object>> priceOption(@Valid @RequestBody OptionRequest request) {
        Option option = new Option(request.strike(), request.maturity(), OptionType.valueOf(request.optionType().toUpperCase(Locale.ROOT)), request.exerciseStyle().equalsIgnoreCase("EUROPEAN"));
        MarketData marketData = new MarketData(request.underlyingSpot(), request.riskFreeRate(), request.impliedVolatility(), request.dividendYield());
        PricingModel model = Models.create(request.model(), 100_000, 42L);
        double price = model.price(option, marketData);

        return ResponseEntity.ok(Map.of(
                "product", "EQUITY_OPTION",
                "pricing_model", model.name(),
                "price", price,
                "currency", "USD"
        ));
    }

    @PostMapping({"/price/bond", "/v1/bloomberg/pricing/fixed-income-bond", "/v1/blp/pricing/fixed-income-bond"})
    public ResponseEntity<Map<String, Object>> priceBond(@Valid @RequestBody BondRequest request) {
        Bond bond = new Bond(request.faceValue(), request.couponRate(), request.couponFrequency(), request.maturityYears());
        MarketData marketData = new MarketData(0, request.yieldToMaturity(), 0, 0);
        PricingModel model = Models.create(request.model(), 100_000, 42L);
        double price = model.price(bond, marketData);

        return ResponseEntity.ok(Map.of(
                "product", "FIXED_INCOME_BOND",
                "pricing_model", model.name(),
                "price", price,
                "currency", "USD"
        ));
    }

    @PostMapping({"/price/stock", "/v1/bloomberg/pricing/equity", "/v1/blp/pricing/equity"})
    public ResponseEntity<Map<String, Object>> priceStock(@Valid @RequestBody StockRequest request) {
        Stock stock = new Stock(request.forecastDividend(), request.growthRate());
        MarketData marketData = new MarketData(request.underlyingSpot(), request.discountRate(), 0, 0);
        PricingModel model = Models.create(request.model(), 100_000, 42L);
        double price = model.price(stock, marketData);

        return ResponseEntity.ok(Map.of(
                "product", "EQUITY",
                "pricing_model", model.name(),
                "price", price,
                "currency", "USD"
        ));
    }

        @PostMapping({"/v1/bloomberg/pricing/irs"})
    public ResponseEntity<Map<String, Object>> priceSwap(@Valid @RequestBody SwapRequest request) {
        DiscountCurve curve = DiscountCurve.bootstrapParSwaps(
                request.tenors(),
                request.discountCurveRates(),
                request.frequency()
        );
        double parRate = SwapPricer.parRate(request.maturityYears(), request.paymentFrequency(), curve);
        InterestRateSwap swap = new InterestRateSwap(request.notional(), request.fixedRate(), request.maturityYears(), request.paymentFrequency(), request.isReceiver());
        double pv = SwapPricer.presentValue(swap, curve);

        return ResponseEntity.ok(Map.of(
                "product", "INTEREST_RATE_SWAP",
                "par_rate", parRate,
                "present_value", pv,
                "currency", "USD"
        ));
    }

        @PostMapping({"/v1/bloomberg/pricing/cds"})
    public ResponseEntity<Map<String, Object>> priceCds(@Valid @RequestBody CdsRequest request) {
        CreditDefaultSwap cds = new CreditDefaultSwap(request.notional(), request.spread(), request.maturityYears(), request.paymentFrequency(), request.recoveryRate());
        DiscountCurve curve = DiscountCurve.bootstrapParSwaps(
                request.tenors(),
                request.discountCurveRates(),
                request.frequency()
        );
        double impliedHazard = CdsPricer.impliedHazardRate(cds, curve);

        return ResponseEntity.ok(Map.of(
                "product", "CREDIT_DEFAULT_SWAP",
                "implied_hazard_rate", impliedHazard,
                "currency", "USD"
        ));
    }

        @PostMapping({"/v1/bloomberg/pricing/fx-forward"})
    public ResponseEntity<Map<String, Object>> priceFxForward(@Valid @RequestBody FxForwardRequest request) {
        double forward = FxForwardPricer.forward(request.spot(), request.domesticRate(), request.foreignRate(), request.maturityYears());
        return ResponseEntity.ok(Map.of(
                "product", "FX_FORWARD",
                "pair", request.pair(),
                "forward_price", forward,
                "currency", "USD"
        ));
    }

    public record OptionRequest(
            String model,
            @JsonProperty("strike") double strike,
            @JsonProperty("maturity_years") double maturity,
            @JsonProperty("option_type") String optionType,
            @JsonProperty("exercise_style") String exerciseStyle,
            @JsonProperty("underlying_spot") double underlyingSpot,
            @JsonProperty("risk_free_rate") double riskFreeRate,
            @JsonProperty("implied_volatility") double impliedVolatility,
            @JsonProperty("dividend_yield") double dividendYield
    ) {}

    public record BondRequest(
            String model,
            @JsonProperty("face_value") double faceValue,
            @JsonProperty("coupon_rate") double couponRate,
            @JsonProperty("coupon_frequency") int couponFrequency,
            @JsonProperty("maturity_years") double maturityYears,
            @JsonProperty("yield_to_maturity") double yieldToMaturity
    ) {}

    public record StockRequest(
            String model,
            @JsonProperty("forecast_dividend") double forecastDividend,
            @JsonProperty("growth_rate") double growthRate,
            @JsonProperty("underlying_spot") double underlyingSpot,
            @JsonProperty("discount_rate") double discountRate
    ) {}

    public record SwapRequest(
            @JsonProperty("tenors") double[] tenors,
            @JsonProperty("discount_curve_rates") double[] discountCurveRates,
            @JsonProperty("frequency") int frequency,
            @JsonProperty("notional") double notional,
            @JsonProperty("fixed_rate") double fixedRate,
            @JsonProperty("maturity_years") double maturityYears,
            @JsonProperty("payment_frequency") int paymentFrequency,
            @JsonProperty("receiver") boolean isReceiver
    ) {}

    public record CdsRequest(
            @JsonProperty("tenors") double[] tenors,
            @JsonProperty("discount_curve_rates") double[] discountCurveRates,
            @JsonProperty("frequency") int frequency,
            @JsonProperty("notional") double notional,
            @JsonProperty("spread") double spread,
            @JsonProperty("maturity_years") double maturityYears,
            @JsonProperty("payment_frequency") int paymentFrequency,
            @JsonProperty("recovery_rate") double recoveryRate
    ) {}

    public record FxForwardRequest(
            @JsonProperty("pair") String pair,
            @JsonProperty("spot") double spot,
            @JsonProperty("domestic_rate") double domesticRate,
            @JsonProperty("foreign_rate") double foreignRate,
            @JsonProperty("maturity_years") double maturityYears
    ) {}

    public record BloombergOptionRequest(
            @JsonProperty("security_name") String securityName,
            @JsonProperty("product") String product,
            @JsonProperty("pricing_model") String pricingModel,
            @JsonProperty("market_data") BloombergOptionMarketData marketData,
            @JsonProperty("instrument") BloombergOptionInstrument instrument
    ) {}

    public record BloombergOptionMarketData(
            @JsonProperty("underlying_spot") double underlyingSpot,
            @JsonProperty("risk_free_rate") double riskFreeRate,
            @JsonProperty("implied_volatility") double impliedVolatility,
            @JsonProperty("dividend_yield") double dividendYield
    ) {}

    public record BloombergOptionInstrument(
            @JsonProperty("strike") double strike,
            @JsonProperty("maturity_years") double maturityYears,
            @JsonProperty("option_type") String optionType,
            @JsonProperty("exercise_style") String exerciseStyle
    ) {}

    public record BloombergSwapRequest(
            @JsonProperty("security_name") String securityName,
            @JsonProperty("product") String product,
            @JsonProperty("pricing_model") String pricingModel,
            @JsonProperty("market_data") BloombergSwapMarketData marketData,
            @JsonProperty("instrument") BloombergSwapInstrument instrument
    ) {}

    public record BloombergSwapMarketData(
            @JsonProperty("tenors") double[] tenors,
            @JsonProperty("discount_curve_rates") double[] discountCurveRates,
            @JsonProperty("frequency") int frequency
    ) {}

    public record BloombergSwapInstrument(
            @JsonProperty("notional") double notional,
            @JsonProperty("fixed_rate") double fixedRate,
            @JsonProperty("maturity_years") double maturityYears,
            @JsonProperty("payment_frequency") int paymentFrequency,
            @JsonProperty("receiver") boolean receiver
    ) {}

    public record BloombergCdsRequest(
            @JsonProperty("security_name") String securityName,
            @JsonProperty("product") String product,
            @JsonProperty("pricing_model") String pricingModel,
            @JsonProperty("market_data") BloombergCdsMarketData marketData,
            @JsonProperty("instrument") BloombergCdsInstrument instrument
    ) {}

    public record BloombergCdsMarketData(
            @JsonProperty("tenors") double[] tenors,
            @JsonProperty("discount_curve_rates") double[] discountCurveRates,
            @JsonProperty("frequency") int frequency
    ) {}

    public record BloombergCdsInstrument(
            @JsonProperty("notional") double notional,
            @JsonProperty("spread") double spread,
            @JsonProperty("maturity_years") double maturityYears,
            @JsonProperty("payment_frequency") int paymentFrequency,
            @JsonProperty("recovery_rate") double recoveryRate
    ) {}

    public record BloombergFxForwardRequest(
            @JsonProperty("security_name") String securityName,
            @JsonProperty("product") String product,
            @JsonProperty("pricing_model") String pricingModel,
            @JsonProperty("market_data") BloombergFxMarketData marketData,
            @JsonProperty("instrument") BloombergFxInstrument instrument
    ) {}

    public record BloombergFxMarketData(
            @JsonProperty("spot") double spot,
            @JsonProperty("domestic_rate") double domesticRate,
            @JsonProperty("foreign_rate") double foreignRate
    ) {}

    public record BloombergFxInstrument(
            @JsonProperty("pair") String pair,
            @JsonProperty("maturity_years") double maturityYears
    ) {}
}
