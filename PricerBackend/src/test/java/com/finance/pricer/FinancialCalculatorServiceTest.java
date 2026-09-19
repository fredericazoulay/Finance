package com.finance.pricer;

import com.finance.pricer.api.dto.FinancialCalculatorRequest;
import com.finance.pricer.api.service.FinancialCalculatorService;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FinancialCalculatorServiceTest {
    private final FinancialCalculatorService service = new FinancialCalculatorService();

    @Test
    void pricesBondWithAccruedInterest() {
        FinancialCalculatorRequest request = new FinancialCalculatorRequest(
                null, null, 0.06, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, 100.0, 0.05, 1,
                LocalDate.of(2029, 9, 16), LocalDate.of(2026, 9, 19), "30/360",
                null, null);

        Map<String, Object> result = service.calculate("bond", request);

        double dirtyPrice = (double) result.get("dirtyPrice");
        double cleanPrice = (double) result.get("cleanPrice");
        double accruedInterest = (double) result.get("accruedInterest");

        assertEquals(3L, result.get("accruedDays"));
        assertEquals(0.0416666667, accruedInterest, 1e-9);
        assertEquals(dirtyPrice, cleanPrice + accruedInterest, 1e-9);
        assertTrue(dirtyPrice > cleanPrice);
        assertEquals("THIRTY_360", result.get("dayCount"));
    }
}
