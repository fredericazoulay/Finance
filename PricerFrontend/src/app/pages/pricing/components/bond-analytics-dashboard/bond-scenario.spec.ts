// Runtime validation coverage for bond price and rate-risk scenarios.
import { describe, expect, it } from 'vitest';
import {
  calculateBondScenario,
  createBondCashFlows,
  priceBondAtYield
} from './bond-scenario';

const parBond = {
  faceValue: 100,
  couponRatePercent: 5,
  couponFrequency: 2,
  maturityYears: 3,
  yieldToMaturityPercent: 5
};

describe('bond scenario valuation', () => {
  it('prices a par bond at par when coupon and yield match', () => {
    const result = calculateBondScenario(parBond);

    expect(result).not.toBeNull();
    expect(result?.price).toBeCloseTo(100, 8);
    expect(result?.cashFlows).toHaveLength(6);
  });

  it('reprices lower when yield rises and exposes positive convexity and DV01', () => {
    const result = calculateBondScenario(parBond, 100);

    expect(result).not.toBeNull();
    expect(result?.price).toBeLessThan(result?.basePrice ?? 0);
    expect(result?.pnl).toBeLessThan(0);
    expect(result?.duration).toBeGreaterThan(0);
    expect(result?.convexity).toBeGreaterThan(0);
    expect(result?.dv01).toBeGreaterThan(0);
  });

  it('prorates the final coupon for a fractional last period', () => {
    const flows = createBondCashFlows({
      ...parBond,
      couponRatePercent: 6,
      maturityYears: 1.25
    });

    expect(flows).toHaveLength(3);
    expect(flows?.[2].timeYears).toBe(1.25);
    expect(flows?.[2].amount).toBeCloseTo(101.5, 8);
  });

  it('rejects invalid coupon frequencies and non-positive discount bases', () => {
    expect(calculateBondScenario({ ...parBond, couponFrequency: 3 })).toBeNull();
    expect(priceBondAtYield([{ timeYears: 1, amount: 100 }], 2, -2)).toBeNaN();
  });
});
