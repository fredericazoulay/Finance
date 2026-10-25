package com.finance.pricer.api.controller;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finance.pricer.Bond;
import com.finance.pricer.CdsPricer;
import com.finance.pricer.CreditDefaultSwap;
import com.finance.pricer.DiscountCurve;
import com.finance.pricer.ExerciseStyle;
import com.finance.pricer.FxForwardPricer;
import com.finance.pricer.InterestRateSwap;
import com.finance.pricer.MarketData;
import com.finance.pricer.Models;
import com.finance.pricer.Option;
import com.finance.pricer.OptionGreekCalculator;
import com.finance.pricer.OptionGreeks;
import com.finance.pricer.OptionType;
import com.finance.pricer.PricingModel;
import com.finance.pricer.Stock;
import com.finance.pricer.SwapPricer;
import com.finance.pricer.api.dto.BloombergInstrument;
import com.finance.pricer.api.dto.BloombergMarketData;
import com.finance.pricer.api.dto.BloombergPricingBatchRequest;
import com.finance.pricer.api.dto.BloombergPricingBatchResult;
import com.finance.pricer.api.dto.BloombergPricingRequest;
import com.finance.pricer.api.dto.BloombergPricingResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "http://localhost:4200")
public class PricingController {
        private static final String MESSAGE_KEY = "message";
        private static final String SUCCESS_STATUS = "SUCCESS";
        private static final String PRICE_KEY = "price";
        private static final String CURRENCY_KEY = "currency";
        private static final String PRICING_MODEL_KEY = "pricing_model";
        private static final String PRODUCT_KEY = "product";
        private final ObjectMapper objectMapper;
        private final HttpClient yahooClient = HttpClient.newHttpClient();

        public PricingController(ObjectMapper objectMapper) {
                this.objectMapper = objectMapper;
        }

    @GetMapping({"/health", "/v1/health"})
    public Map<String, String> health() {
        return Map.of("status", "UP", "service", "Finance Pricer API");
    }

        @GetMapping("/securities/search")
        public ResponseEntity<Object> searchSecurities(@RequestParam String q) {
                if (q == null || q.isBlank()) {
                        return ResponseEntity.badRequest().body(Map.of(MESSAGE_KEY, "Query q is required"));
                }

                try {
                        String encodedQuery = URLEncoder.encode(q.trim(), StandardCharsets.UTF_8);
                        URI uri = URI.create("https://query1.finance.yahoo.com/v1/finance/search?q="
                                        + encodedQuery + "&quotesCount=25&newsCount=0");
                        HttpRequest request = HttpRequest.newBuilder(uri)
                                        .header("User-Agent", "FinancePricer/1.0")
                                        .GET()
                                        .build();
                        HttpResponse<String> yahooResponse = yahooClient.send(request, HttpResponse.BodyHandlers.ofString());
                        JsonNode body = objectMapper.readTree(yahooResponse.body());
                        if (yahooResponse.statusCode() >= 200 && yahooResponse.statusCode() < 300) {
                                return ResponseEntity.ok().body(body);
                        }
                        return ResponseEntity.status(502).body(Map.of(
                                        MESSAGE_KEY, "Yahoo Finance search failed",
                                        "upstream_status", yahooResponse.statusCode()
                        ));
                } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                        return ResponseEntity.status(502).body(Map.of(MESSAGE_KEY, "Yahoo Finance search interrupted"));
                } catch (Exception exception) {
                        return ResponseEntity.status(502).body(Map.of(MESSAGE_KEY, "Yahoo Finance search unavailable"));
                }
        }

    @GetMapping({"/products", "/v1/products", "/bloomberg/catalog", "/v1/blp/catalog"})
    public Map<String, List<String>> products() {
        return Map.of("products", List.of(
                "EQUITY_OPTION",
                "FIXED_INCOME_BOND",
                "EQUITY",
                "INTEREST_RATE_SWAP",
                "CREDIT_DEFAULT_SWAP",
                                "FX_FORWARD",
                                "INTEREST_RATE_CAP_FLOOR",
                                "EUROPEAN_SWAPTION",
                                "BARRIER_OPTION",
                                "ASIAN_OPTION",
                                "SPREAD_OPTION",
                                "SABR_IMPLIED_VOLATILITY",
                                "FORWARD",
                                "FRA",
                                "INTEREST_RATE_FUTURE",
                                "BOND_FUTURE",
                                "DIGITAL_OPTION",
                                "LOOKBACK_OPTION",
                                "CHOOSER_OPTION"
        ));
    }

    @PostMapping({"/v1/blp/pricing/equity-option"})
    public ResponseEntity<BloombergPricingResponse> priceBloombergOption(@Valid @RequestBody BloombergPricingRequest request) {
                return ResponseEntity.ok(priceBloombergOptionResponse(request));
        }

        @PostMapping("/v1/blp/pricing/equity-option/batch")
        public List<BloombergPricingBatchResult> priceBloombergOptionBatch(
                        @Valid @RequestBody BloombergPricingBatchRequest batch) {
                return batch.requests().stream().map(request -> {
                        try {
                                return new BloombergPricingBatchResult(request.requestId(), priceBloombergOptionResponse(request), null);
                        } catch (RuntimeException exception) {
                                String error = exception.getMessage() == null ? "Pricing failed" : exception.getMessage();
                                return new BloombergPricingBatchResult(request.requestId(), null, error);
                        }
                }).toList();
        }

        private BloombergPricingResponse priceBloombergOptionResponse(BloombergPricingRequest request) {
        BloombergInstrument instrument = request.instrument();
        BloombergMarketData marketData = request.marketData();

        Option option = new Option(
                instrument.strike(),
                instrument.maturityYears(),
                OptionType.valueOf(instrument.optionType().toUpperCase(Locale.ROOT)),
                exerciseStyle(instrument.exerciseStyle(), request.pricingModel()),
                instrument.exerciseTimesYears()
        );
        MarketData md = new MarketData(
                marketData.underlyingSpot(),
                marketData.riskFreeRate(),
                marketData.impliedVolatility(),
                marketData.dividendYield()
        );
        PricingModel model = Models.create(request.pricingModel(), 100_000, 42L);
        double price = model.price(option, md);
        OptionGreeks greeks = OptionGreekCalculator.calculate(option, md, model, price);

        return new BloombergPricingResponse(
                request.requestId(),
                SUCCESS_STATUS,
                OffsetDateTime.now(ZoneOffset.UTC),
                request.securityId(),
                request.securityName(),
                "EQTY_OPT",
                request.curveName(),
                request.marketDataSource(),
                Map.of(PRICE_KEY, price, CURRENCY_KEY, "USD", "greeks", greeks),
                Map.of(PRICING_MODEL_KEY, model.name(), "exercise_style", option.exerciseStyle().name(),
                        "greek_units", greekUnits())
        );
    }

    @PostMapping({"/v1/blp/pricing/irs"})
    public ResponseEntity<BloombergPricingResponse> priceBloombergSwap(@Valid @RequestBody BloombergPricingRequest request) {
        BloombergInstrument instrument = request.instrument();
        BloombergMarketData marketData = request.marketData();

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
                SUCCESS_STATUS,
                OffsetDateTime.now(ZoneOffset.UTC),
                request.securityId(),
                request.securityName(),
                "IRS",
                request.curveName(),
                request.marketDataSource(),
                Map.of("par_rate", parRate, "present_value", pv, CURRENCY_KEY, "USD"),
                Map.of(PRICING_MODEL_KEY, request.pricingModel())
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping({"/v1/blp/pricing/cds"})
    public ResponseEntity<BloombergPricingResponse> priceBloombergCds(@Valid @RequestBody BloombergPricingRequest request) {
        BloombergInstrument instrument = request.instrument();
        BloombergMarketData marketData = request.marketData();

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
                SUCCESS_STATUS,
                OffsetDateTime.now(ZoneOffset.UTC),
                request.securityId(),
                request.securityName(),
                "CDS",
                request.curveName(),
                request.marketDataSource(),
                Map.of("implied_hazard_rate", impliedHazard, CURRENCY_KEY, "USD"),
                Map.of(PRICING_MODEL_KEY, request.pricingModel())
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping({"/v1/blp/pricing/fx-forward"})
    public ResponseEntity<BloombergPricingResponse> priceBloombergFxForward(@Valid @RequestBody BloombergPricingRequest request) {
        BloombergInstrument instrument = request.instrument();
        BloombergMarketData marketData = request.marketData();

        double forward = FxForwardPricer.forward(
                marketData.spot(),
                marketData.domesticRate(),
                marketData.foreignRate(),
                instrument.maturityYears()
        );

        BloombergPricingResponse response = new BloombergPricingResponse(
                request.requestId(),
                SUCCESS_STATUS,
                OffsetDateTime.now(ZoneOffset.UTC),
                request.securityId(),
                request.securityName(),
                "FXC",
                request.curveName(),
                request.marketDataSource(),
                Map.of("forward_price", forward, CURRENCY_KEY, "USD"),
                Map.of(PRICING_MODEL_KEY, request.pricingModel())
        );
        return ResponseEntity.ok(response);
    }

        @PostMapping({"/price/option", "/v1/bloomberg/pricing/equity-option"})
    public ResponseEntity<Map<String, Object>> priceOption(@Valid @RequestBody OptionRequest request) {
                Option option = new Option(
                        request.strike(),
                        request.maturity(),
                        OptionType.valueOf(request.optionType().toUpperCase(Locale.ROOT)),
                        exerciseStyle(request.exerciseStyle(), request.model()),
                        request.exerciseTimesYears()
                );
        MarketData marketData = new MarketData(request.underlyingSpot(), request.riskFreeRate(), request.impliedVolatility(), request.dividendYield());
        PricingModel model = Models.create(request.model(), 100_000, 42L);
        double price = model.price(option, marketData);
                OptionGreeks greeks = OptionGreekCalculator.calculate(option, marketData, model, price);

        return ResponseEntity.ok(Map.of(
                PRODUCT_KEY, "EQUITY_OPTION",
                PRICING_MODEL_KEY, model.name(),
                PRICE_KEY, price,
                        CURRENCY_KEY, "USD",
                        "exercise_style", option.exerciseStyle().name(),
                        "greeks", greeks,
                        "greek_units", greekUnits()
        ));
    }

            private static ExerciseStyle exerciseStyle(String requestedStyle, String modelName) {
                String style = requestedStyle;
                if (style == null || style.isBlank()) {
                    style = "AMERICAN".equalsIgnoreCase(modelName) || "BERMUDAN".equalsIgnoreCase(modelName)
                            ? modelName
                            : "EUROPEAN";
                }
                return ExerciseStyle.valueOf(style.trim().toUpperCase(Locale.ROOT));
            }

            private static Map<String, String> greekUnits() {
                return Map.of(
                        "delta", "per underlying unit",
                        "gamma", "per underlying unit squared",
                        "theta", "per calendar day",
                        "vega", "per 1 volatility percentage point",
                        "rho", "per 1 interest-rate percentage point"
                );
            }

    @PostMapping({"/price/bond", "/v1/bloomberg/pricing/fixed-income-bond", "/v1/blp/pricing/fixed-income-bond"})
    public ResponseEntity<Map<String, Object>> priceBond(@Valid @RequestBody BondRequest request) {
        Bond bond = new Bond(request.faceValue(), request.couponRate(), request.couponFrequency(), request.maturityYears());
        MarketData marketData = new MarketData(0, request.yieldToMaturity(), 0, 0);
        PricingModel model = Models.create(request.model(), 100_000, 42L);
        double price = model.price(bond, marketData);

        return ResponseEntity.ok(Map.of(
                PRODUCT_KEY, "FIXED_INCOME_BOND",
                PRICING_MODEL_KEY, model.name(),
                PRICE_KEY, price,
                CURRENCY_KEY, "USD"
        ));
    }

    @PostMapping({"/price/stock", "/v1/bloomberg/pricing/equity", "/v1/blp/pricing/equity"})
    public ResponseEntity<Map<String, Object>> priceStock(@Valid @RequestBody StockRequest request) {
        Stock stock = new Stock(request.forecastDividend(), request.growthRate());
        MarketData marketData = new MarketData(request.underlyingSpot(), request.discountRate(), 0, 0);
        PricingModel model = Models.create(request.model(), 100_000, 42L);
        double price = model.price(stock, marketData);

        return ResponseEntity.ok(Map.of(
                PRODUCT_KEY, "EQUITY",
                PRICING_MODEL_KEY, model.name(),
                PRICE_KEY, price,
                CURRENCY_KEY, "USD"
        ));
    }

        @PostMapping({"/v1/bloomberg/pricing/irs"})
    public ResponseEntity<Map<String, Object>> priceSwap(@Valid @RequestBody SwapRequest request) {
        DiscountCurve curve = DiscountCurve.bootstrapParSwaps(
                toPrimitiveArray(request.tenors()),
                toPrimitiveArray(request.discountCurveRates()),
                request.frequency()
        );
        double parRate = SwapPricer.parRate(request.maturityYears(), request.paymentFrequency(), curve);
        InterestRateSwap swap = new InterestRateSwap(request.notional(), request.fixedRate(), request.maturityYears(), request.paymentFrequency(), request.isReceiver());
        double pv = SwapPricer.presentValue(swap, curve);

        return ResponseEntity.ok(Map.of(
                PRODUCT_KEY, "INTEREST_RATE_SWAP",
                "par_rate", parRate,
                "present_value", pv,
                CURRENCY_KEY, "USD"
        ));
    }

        @PostMapping({"/v1/bloomberg/pricing/cds"})
    public ResponseEntity<Map<String, Object>> priceCds(@Valid @RequestBody CdsRequest request) {
        CreditDefaultSwap cds = new CreditDefaultSwap(request.notional(), request.spread(), request.maturityYears(), request.paymentFrequency(), request.recoveryRate());
        DiscountCurve curve = DiscountCurve.bootstrapParSwaps(
                toPrimitiveArray(request.tenors()),
                toPrimitiveArray(request.discountCurveRates()),
                request.frequency()
        );
        double impliedHazard = CdsPricer.impliedHazardRate(cds, curve);

        return ResponseEntity.ok(Map.of(
                PRODUCT_KEY, "CREDIT_DEFAULT_SWAP",
                "implied_hazard_rate", impliedHazard,
                CURRENCY_KEY, "USD"
        ));
    }

        @PostMapping({"/v1/bloomberg/pricing/fx-forward"})
    public ResponseEntity<Map<String, Object>> priceFxForward(@Valid @RequestBody FxForwardRequest request) {
        double forward = FxForwardPricer.forward(request.spot(), request.domesticRate(), request.foreignRate(), request.maturityYears());
        return ResponseEntity.ok(Map.of(
                PRODUCT_KEY, "FX_FORWARD",
                "pair", request.pair(),
                "forward_price", forward,
                CURRENCY_KEY, "USD"
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
            @JsonProperty("dividend_yield") double dividendYield,
            @JsonProperty("exercise_times_years") List<Double> exerciseTimesYears
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

        private static double[] toPrimitiveArray(List<Double> values) {
                        if (values == null) return new double[0];
                        double[] result = new double[values.size()];
                        for (int index = 0; index < values.size(); index++) {
                                Double value = values.get(index);
                                if (value == null) throw new IllegalArgumentException("Curve values cannot be null");
                                result[index] = value;
                        }
                        return result;
        }

    public record SwapRequest(
                        @JsonProperty("tenors") List<Double> tenors,
                        @JsonProperty("discount_curve_rates") List<Double> discountCurveRates,
            @JsonProperty("frequency") int frequency,
            @JsonProperty("notional") double notional,
            @JsonProperty("fixed_rate") double fixedRate,
            @JsonProperty("maturity_years") double maturityYears,
            @JsonProperty("payment_frequency") int paymentFrequency,
            @JsonProperty("receiver") boolean isReceiver
    ) {}

    public record CdsRequest(
            @JsonProperty("tenors") List<Double> tenors,
            @JsonProperty("discount_curve_rates") List<Double> discountCurveRates,
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
            @JsonProperty(PRODUCT_KEY) String product,
            @JsonProperty(PRICING_MODEL_KEY) String pricingModel,
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
            @JsonProperty(PRODUCT_KEY) String product,
            @JsonProperty(PRICING_MODEL_KEY) String pricingModel,
            @JsonProperty("market_data") BloombergSwapMarketData marketData,
            @JsonProperty("instrument") BloombergSwapInstrument instrument
    ) {}

    public record BloombergSwapMarketData(
            @JsonProperty("tenors") List<Double> tenors,
            @JsonProperty("discount_curve_rates") List<Double> discountCurveRates,
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
            @JsonProperty(PRODUCT_KEY) String product,
            @JsonProperty(PRICING_MODEL_KEY) String pricingModel,
            @JsonProperty("market_data") BloombergCdsMarketData marketData,
            @JsonProperty("instrument") BloombergCdsInstrument instrument
    ) {}

    public record BloombergCdsMarketData(
            @JsonProperty("tenors") List<Double> tenors,
            @JsonProperty("discount_curve_rates") List<Double> discountCurveRates,
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
            @JsonProperty(PRODUCT_KEY) String product,
            @JsonProperty(PRICING_MODEL_KEY) String pricingModel,
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
