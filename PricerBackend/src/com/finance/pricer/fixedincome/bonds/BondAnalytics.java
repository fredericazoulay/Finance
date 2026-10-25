package com.finance.pricer.fixedincome.bonds;

import com.finance.pricer.core.curves.YieldCurve;
import com.finance.pricer.core.calendar.DayCountConvention;
import com.finance.pricer.core.math.BrentSolver;

import java.time.LocalDate;

/**
 * Enterprise-grade Fixed Income & Bond Analytics engine as specified in John C. Hull (Chapter 4 & 6).
 * Computes Dirty/Clean Prices, Accrued Interest, Exact YTM solver, Macaulay & Modified Duration,
 * DV01 / PVBP, Convexity, Z-Spread, and Key Rate Durations (KRD).
 */
public final class BondAnalytics {

    private BondAnalytics() { }

    /**
     * Complete bond analytics summary result.
     */
    public record BondMetrics(
            double cleanPrice,
            double dirtyPrice,
            double accruedInterest,
            double ytm,
            double macaulayDuration,
            double modifiedDuration,
            double convexity,
            double dv01
    ) {}

    /**
     * Calculates the dirty price of a bond from its yield to maturity (YTM).
     * Compounding frequency matches the bond's coupon payment frequency m.
     */
    public static double dirtyPriceFromYtm(FixedCouponBond bond, LocalDate settlementDate, double ytm) {
        int m = bond.getFrequency();
        double periodicRate = ytm / m;
        double pv = 0.0;

        for (FixedCouponBond.CouponPayment cp : bond.getCashFlows()) {
            if (cp.paymentDate().isAfter(settlementDate)) {
                double t = yearFractionToPayment(bond, settlementDate, cp);
                double discountFactor = Math.pow(1.0 + periodicRate, -t * m);
                pv += cp.totalCashFlow() * discountFactor;
            }
        }
        return pv;
    }

    /**
     * Calculates the clean price = dirty price - accrued interest.
     */
    public static double cleanPriceFromYtm(FixedCouponBond bond, LocalDate settlementDate, double ytm) {
        double dirty = dirtyPriceFromYtm(bond, settlementDate, ytm);
        double accrued = bond.calculateAccruedInterest(settlementDate);
        return dirty - accrued;
    }

    /**
     * Solves for the exact Yield to Maturity (YTM) from the market dirty price using Brent's method.
     */
    public static double ytmFromDirtyPrice(FixedCouponBond bond, LocalDate settlementDate, double targetDirtyPrice) {
        if (!Double.isFinite(targetDirtyPrice) || targetDirtyPrice <= 0.0) {
            throw new IllegalArgumentException("targetDirtyPrice must be finite and greater than zero");
        }
        int frequency = bond.getFrequency();
        return BrentSolver.findRootWithBracket(
                y -> {
                    double difference = dirtyPriceFromYtm(bond, settlementDate, y) - targetDirtyPrice;
                    return Double.isInfinite(difference) ? Math.copySign(Double.MAX_VALUE, difference) : difference;
                },
                0.01,
                0.10,
                Math.nextUp(-frequency),
                1_000_000.0,
                1e-9,
                1e-9,
                150
        );
    }

    /**
     * Solves for the exact Yield to Maturity (YTM) from the quoted market clean price.
     */
    public static double ytmFromCleanPrice(FixedCouponBond bond, LocalDate settlementDate, double targetCleanPrice) {
        double accrued = bond.calculateAccruedInterest(settlementDate);
        return ytmFromDirtyPrice(bond, settlementDate, targetCleanPrice + accrued);
    }

    /**
     * Macaulay Duration: weighted average maturity of cash flows (in years).
     * D_mac = (1 / DirtyPrice) * sum [ t_i * CF_i / (1 + y/m)^(m * t_i) ]
     */
    public static double macaulayDuration(FixedCouponBond bond, LocalDate settlementDate, double ytm) {
        double dirtyPrice = dirtyPriceFromYtm(bond, settlementDate, ytm);
        if (dirtyPrice <= 0.0) return 0.0;

        int m = bond.getFrequency();
        double periodicRate = ytm / m;
        double weightedSum = 0.0;

        for (FixedCouponBond.CouponPayment cp : bond.getCashFlows()) {
            if (cp.paymentDate().isAfter(settlementDate)) {
                double t = yearFractionToPayment(bond, settlementDate, cp);
                double df = Math.pow(1.0 + periodicRate, -t * m);
                weightedSum += t * cp.totalCashFlow() * df;
            }
        }
        return weightedSum / dirtyPrice;
    }

    /**
     * Modified Duration: percentage price sensitivity to yield change.
     * D_mod = D_mac / (1 + y/m)
     */
    public static double modifiedDuration(FixedCouponBond bond, LocalDate settlementDate, double ytm) {
        double dMac = macaulayDuration(bond, settlementDate, ytm);
        int m = bond.getFrequency();
        return dMac / (1.0 + ytm / m);
    }

    /**
     * DV01 / PVBP (Price Value of a Basis Point): change in bond price for a 1 bp (0.01%) shift in yield.
     * DV01 = D_mod * DirtyPrice * 0.0001
     */
    public static double dv01(FixedCouponBond bond, LocalDate settlementDate, double ytm) {
        double dirtyPrice = dirtyPriceFromYtm(bond, settlementDate, ytm);
        double dMod = modifiedDuration(bond, settlementDate, ytm);
        return dMod * dirtyPrice * 0.0001;
    }

    /**
     * Bond Convexity: second-order price sensitivity with respect to yield.
     * C = [ 1 / (P * (1 + y/m)^2) ] * sum [ t_i * (t_i + 1/m) * CF_i / (1 + y/m)^(m * t_i) ]
     */
    public static double convexity(FixedCouponBond bond, LocalDate settlementDate, double ytm) {
        double dirtyPrice = dirtyPriceFromYtm(bond, settlementDate, ytm);
        if (dirtyPrice <= 0.0) return 0.0;

        int m = bond.getFrequency();
        double periodicRate = ytm / m;
        double factor = dirtyPrice * Math.pow(1.0 + periodicRate, 2);
        double sum = 0.0;

        for (FixedCouponBond.CouponPayment cp : bond.getCashFlows()) {
            if (cp.paymentDate().isAfter(settlementDate)) {
                double t = yearFractionToPayment(bond, settlementDate, cp);
                double df = Math.pow(1.0 + periodicRate, -t * m);
                sum += t * (t + 1.0 / m) * cp.totalCashFlow() * df;
            }
        }
        return sum / factor;
    }

    /**
     * Estimates price change from a yield shift deltaY using duration and convexity:
     * deltaP approx -D_mod * P * deltaY + 0.5 * C * P * (deltaY)^2
     */
    public static double estimatePriceChange(double dirtyPrice, double modifiedDuration, double convexity, double deltaY) {
        return -modifiedDuration * dirtyPrice * deltaY + 0.5 * convexity * dirtyPrice * deltaY * deltaY;
    }

    /**
     * Solves for the Zero-Spread (Z-Spread):
     * The constant parallel spread s over the zero yield curve that discounts all future cash flows
     * to match the market dirty price:
     * TargetDirtyPrice = sum [ CF_i * exp(-(r(t_i) + s) * t_i) ]
     *
     * @return Z-Spread in decimal (e.g. 0.0075 for 75 bps)
     */
    public static double calculateZSpread(FixedCouponBond bond, LocalDate settlementDate, double targetDirtyPrice, YieldCurve zeroCurve) {
        return BrentSolver.findRootWithBracket(
                s -> {
                    double pv = 0.0;
                    for (FixedCouponBond.CouponPayment cp : bond.getCashFlows()) {
                        if (cp.paymentDate().isAfter(settlementDate)) {
                            double t = zeroCurve.getDayCountConvention()
                                    .yearFraction(settlementDate, cp.paymentDate());
                            double baseZero = zeroCurve.zeroRate(cp.paymentDate());
                            pv += cp.totalCashFlow() * Math.exp(-(baseZero + s) * t);
                        }
                    }
                    return pv - targetDirtyPrice;
                },
                -0.01,
                0.05,
                1e-9,
                1e-9,
                150
        );
    }

    /**
     * Key Rate Durations (KRD) across selected key pillar tenors (e.g., 2Y, 5Y, 10Y, 30Y).
     * Applies triangular linear perturbation bumps to the zero rate curve.
     */
    public static double[] calculateKeyRateDurations(
            FixedCouponBond bond,
            LocalDate settlementDate,
            double[] keyTenors,
            YieldCurve baseZeroCurve) {

        double baseDirtyPrice = 0.0;
        for (FixedCouponBond.CouponPayment cp : bond.getCashFlows()) {
            if (cp.paymentDate().isAfter(settlementDate)) {
                baseDirtyPrice += cp.totalCashFlow() * baseZeroCurve.discountFactor(cp.paymentDate());
            }
        }

        double shift = 0.0001; // 1 bp
        double[] krds = new double[keyTenors.length];

        for (int k = 0; k < keyTenors.length; k++) {
            double tk = keyTenors[k];
            double tPrev = (k == 0) ? 0.0 : keyTenors[k - 1];
            double tNext = (k == keyTenors.length - 1) ? keyTenors[k] + 10.0 : keyTenors[k + 1];

            double bumpedUpPrice = 0.0;
            double bumpedDownPrice = 0.0;

            for (FixedCouponBond.CouponPayment cp : bond.getCashFlows()) {
                if (cp.paymentDate().isAfter(settlementDate)) {
                    double t = baseZeroCurve.getDayCountConvention()
                            .yearFraction(settlementDate, cp.paymentDate());
                    double weight = triangularWeight(t, tPrev, tk, tNext);

                    double baseR = baseZeroCurve.zeroRate(cp.paymentDate());
                    double rUp = baseR + shift * weight;
                    double rDown = baseR - shift * weight;

                    bumpedUpPrice += cp.totalCashFlow() * Math.exp(-rUp * t);
                    bumpedDownPrice += cp.totalCashFlow() * Math.exp(-rDown * t);
                }
            }

            // KRD = -(P_up - P_down) / (2 * shift * P_base)
            krds[k] = -(bumpedUpPrice - bumpedDownPrice) / (2.0 * shift * baseDirtyPrice);
        }

        return krds;
    }

    private static double triangularWeight(double t, double tPrev, double tk, double tNext) {
        if (t <= tPrev || t >= tNext) return 0.0;
        if (t <= tk) {
            return (t - tPrev) / (tk - tPrev);
        } else {
            return (tNext - t) / (tNext - tk);
        }
    }

    private static double yearFractionToPayment(
            FixedCouponBond bond,
            LocalDate settlementDate,
            FixedCouponBond.CouponPayment payment) {
        DayCountConvention.ScheduleContext context = DayCountConvention.ScheduleContext.of(
                bond.getFrequency(), payment.periodStart(), payment.periodEnd());
        return bond.getDayCountConvention().yearFraction(settlementDate, payment.paymentDate(), context);
    }

    /**
     * Computes all primary metrics for a bond given its quoted clean price.
     */
    public static BondMetrics computeAllMetrics(FixedCouponBond bond, LocalDate settlementDate, double cleanPrice) {
        double accrued = bond.calculateAccruedInterest(settlementDate);
        double dirtyPrice = cleanPrice + accrued;
        double ytm = ytmFromDirtyPrice(bond, settlementDate, dirtyPrice);
        double dMac = macaulayDuration(bond, settlementDate, ytm);
        double dMod = modifiedDuration(bond, settlementDate, ytm);
        double conv = convexity(bond, settlementDate, ytm);
        double dv01Val = dv01(bond, settlementDate, ytm);

        return new BondMetrics(cleanPrice, dirtyPrice, accrued, ytm, dMac, dMod, conv, dv01Val);
    }
}

