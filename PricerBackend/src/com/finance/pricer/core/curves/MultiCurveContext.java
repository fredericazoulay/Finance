package com.finance.pricer.core.curves;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Modern multi-curve container mapping an OIS discount curve and specific index forward curves
 * (e.g., EURIBOR_3M, EURIBOR_6M, SOFR_3M).
 * Adheres to post-crisis dual-curve pricing (Hull Chapters 4 & 7).
 */
public class MultiCurveContext {

    private final YieldCurve discountCurve;
    private final Map<String, YieldCurve> forwardCurves;

    public MultiCurveContext(YieldCurve discountCurve, Map<String, YieldCurve> forwardCurves) {
        this.discountCurve = Objects.requireNonNull(discountCurve, "discountCurve cannot be null");
        this.forwardCurves = new HashMap<>(forwardCurves != null ? forwardCurves : Collections.emptyMap());
    }

    public MultiCurveContext(YieldCurve singleCurve) {
        this(singleCurve, Collections.emptyMap());
    }

    public YieldCurve getDiscountCurve() {
        return discountCurve;
    }

    public YieldCurve getForwardCurve(String indexName) {
        YieldCurve fwd = forwardCurves.get(indexName);
        return fwd != null ? fwd : discountCurve; // Fallback to discount curve if no basis curve is registered
    }

    public MultiCurveContext withForwardCurve(String indexName, YieldCurve curve) {
        Map<String, YieldCurve> updated = new HashMap<>(this.forwardCurves);
        updated.put(indexName, Objects.requireNonNull(curve, "curve cannot be null"));
        return new MultiCurveContext(this.discountCurve, updated);
    }
}

