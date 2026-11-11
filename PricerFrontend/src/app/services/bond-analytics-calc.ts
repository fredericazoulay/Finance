import { BondComparable } from '../models/bond-comparables.model';

export interface BondComputedMetrics {
  cleanPrice: number;
  dirtyPrice: number;
  accruedInterest: number;
  yieldToMaturity: number;
  currentYield: number;
  macaulayDuration: number;
  modifiedDuration: number;
  convexity: number;
  dv01: number; // For 100,000 nominal
  gSpreadBps: number;
  iSpreadBps: number;
  zSpreadBps: number;
  aswBps: number;
  oasBps: number;
  benchmarkSecurity: string;
  benchmarkYield: number;
  yearsToMaturity: number;
  yieldToDurationRatio: number; // YTM / ModDur
  relativeValueStatus: 'CHEAP' | 'FAIR' | 'RICH';
  relativeValueSpreadResidueBps: number;
}

/**
 * Returns estimated sovereign benchmark yield for a given currency and maturity in years.
 */
export function getBenchmarkYield(currency: string, maturityYears: number): { name: string; yieldPercent: number } {
  const t = Math.max(0.1, maturityYears);
  const curr = (currency || 'EUR').toUpperCase();

  if (curr === 'USD') {
    const yPercent = 3.85 + 0.55 * (1 - Math.exp(-t / 4.5)) + 0.015 * t;
    const name = t <= 2.5 ? 'UST 2Y' : t <= 6 ? 'UST 5Y' : t <= 15 ? 'UST 10Y' : 'UST 30Y';
    return { name, yieldPercent: Math.round(yPercent * 1000) / 1000 };
  }

  if (curr === 'GBP') {
    const yPercent = 3.90 + 0.45 * (1 - Math.exp(-t / 4.0)) + 0.01 * t;
    const name = t <= 2.5 ? 'UKT 2Y' : t <= 6 ? 'UKT 5Y' : t <= 15 ? 'UKT 10Y' : 'UKT 30Y';
    return { name, yieldPercent: Math.round(yPercent * 1000) / 1000 };
  }

  // Default: EUR (German Bund benchmark)
  const yPercent = 2.05 + 0.58 * (1 - Math.exp(-t / 4.0)) + 0.012 * t;
  const name = t <= 2.5 ? 'DBR 2Y' : t <= 6 ? 'DBR 5Y' : t <= 12 ? 'DBR 0 02/15/31' : 'DBR 30Y';
  return { name, yieldPercent: Math.round(yPercent * 1000) / 1000 };
}

/**
 * Solve clean price from yield to maturity for bullet fixed-coupon bond.
 */
export function priceFromYield(
  faceValue: number,
  couponRatePercent: number,
  couponFrequency: number,
  yearsToMaturity: number,
  yieldPercent: number
): number {
  const f = Math.max(1, couponFrequency);
  const y = yieldPercent / 100;
  const n = Math.max(1, Math.round(yearsToMaturity * f));
  const couponAmount = (faceValue * (couponRatePercent / 100)) / f;
  const discountFactor = 1 + y / f;

  if (discountFactor <= 0) return faceValue;

  let pvCoupons = 0;
  for (let k = 1; k <= n; k++) {
    pvCoupons += couponAmount / Math.pow(discountFactor, k);
  }
  const pvFace = faceValue / Math.pow(discountFactor, n);
  return pvCoupons + pvFace;
}

/**
 * Solve yield to maturity from clean price using Newton-Raphson.
 */
export function yieldFromPrice(
  faceValue: number,
  couponRatePercent: number,
  couponFrequency: number,
  yearsToMaturity: number,
  targetPrice: number
): number {
  if (targetPrice <= 0 || yearsToMaturity <= 0) return 0;

  let y = (couponRatePercent / 100) + (faceValue - targetPrice) / (yearsToMaturity * faceValue);
  y = Math.max(0.001, y);

  const f = Math.max(1, couponFrequency);
  const n = Math.max(1, Math.round(yearsToMaturity * f));
  const c = (faceValue * (couponRatePercent / 100)) / f;

  for (let iter = 0; iter < 20; iter++) {
    const base = 1 + y / f;
    if (base <= 0) break;

    let pv = 0;
    let dPv = 0;

    for (let k = 1; k <= n; k++) {
      const df = Math.pow(base, k);
      pv += c / df;
      dPv -= (k / f) * (c / (df * base));
    }
    const dfN = Math.pow(base, n);
    pv += faceValue / dfN;
    dPv -= (n / f) * (faceValue / (dfN * base));

    const diff = pv - targetPrice;
    if (Math.abs(diff) < 1e-6) break;
    if (Math.abs(dPv) < 1e-12) break;

    y = y - diff / dPv;
    if (y < -0.05) y = 0.001;
  }

  return y * 100;
}

/**
 * Compute exhaustive actuarial analytics for any bond.
 */
export function computeBondAnalytics(bond: BondComparable, settlementDateStr?: string): BondComputedMetrics {
  const face = bond.faceValue && bond.faceValue > 0 ? bond.faceValue : 100;
  const freq = bond.couponFrequency && [1, 2, 4, 12].includes(bond.couponFrequency) ? bond.couponFrequency : 1;
  const couponRate = bond.couponRate != null && Number.isFinite(bond.couponRate) ? bond.couponRate : 3.5;

  // Compute years to maturity
  const today = settlementDateStr ? new Date(settlementDateStr) : new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  let years = 5;

  if (bond.maturityDate) {
    const mat = new Date(`${bond.maturityDate}T00:00:00Z`);
    if (!Number.isNaN(mat.getTime()) && mat.getTime() > todayUtc) {
      years = Math.max(0.2, (mat.getTime() - todayUtc) / (365.25 * 86400000));
    }
  }

  // Yield and Clean Price resolution
  let yieldPercent: number;
  let cleanPrice: number;

  if (bond.yieldToMaturity != null && Number.isFinite(bond.yieldToMaturity) && bond.yieldToMaturity > 0) {
    yieldPercent = bond.yieldToMaturity > 1 ? bond.yieldToMaturity : bond.yieldToMaturity * 100;
    cleanPrice = bond.marketPrice && bond.marketPrice > 0
      ? bond.marketPrice
      : priceFromYield(face, couponRate, freq, years, yieldPercent);
  } else if (bond.marketPrice && bond.marketPrice > 0) {
    cleanPrice = bond.marketPrice;
    yieldPercent = yieldFromPrice(face, couponRate, freq, years, cleanPrice);
  } else {
    yieldPercent = 3.5;
    cleanPrice = priceFromYield(face, couponRate, freq, years, yieldPercent);
  }

  // Accrued Interest (approximate based on day fraction in year)
  const annualCouponAmount = face * (couponRate / 100);
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
  const accruedFraction = (dayOfYear % Math.floor(365 / freq)) / (365 / freq);
  const accruedInterest = Math.max(0, (annualCouponAmount / freq) * accruedFraction);
  const dirtyPrice = cleanPrice + accruedInterest;

  // Duration & Convexity
  const y = yieldPercent / 100;
  const f = freq;
  const n = Math.max(1, Math.round(years * f));
  const c = annualCouponAmount / f;
  const discountBase = 1 + y / f;

  let weightedTime = 0;
  let convexitySum = 0;

  for (let k = 1; k <= n; k++) {
    const t_k = k / f;
    const pv_k = (k === n ? c + face : c) / Math.pow(discountBase, k);
    weightedTime += t_k * pv_k;
    convexitySum += t_k * (t_k + 1 / f) * pv_k;
  }

  const macaulayDuration = dirtyPrice > 0 ? weightedTime / dirtyPrice : years;
  const modifiedDuration = macaulayDuration / discountBase;
  const convexity = dirtyPrice > 0 ? convexitySum / (dirtyPrice * discountBase * discountBase) : 0;
  const dv01 = (dirtyPrice * modifiedDuration * 0.0001 * 1000); // For 100,000 nominal

  // Benchmark & Spreads
  const benchmark = getBenchmarkYield(bond.currency, years);
  const gSpreadBps = Math.round((yieldPercent - benchmark.yieldPercent) * 100);
  const iSpreadBps = Math.round(gSpreadBps - 28);
  const zSpreadBps = Math.round(iSpreadBps + 0.3 * convexity);
  const aswBps = Math.round(iSpreadBps + 1.5);
  const oasBps = Math.round(zSpreadBps - 2.0);

  // Current Yield & Decision Ratios
  const currentYield = cleanPrice > 0 ? (annualCouponAmount / cleanPrice) * 100 : 0;
  const yieldToDurationRatio = modifiedDuration > 0 ? yieldPercent / modifiedDuration : 0;

  // Relative Value estimation (peer residue)
  // Benchmark curve + credit rating premium expectation
  const ratingNorm = (bond.rating || '').toUpperCase();
  let ratingSpreadExpectationBps = 80;
  if (ratingNorm.startsWith('AAA')) ratingSpreadExpectationBps = 15;
  else if (ratingNorm.startsWith('AA')) ratingSpreadExpectationBps = 35;
  else if (ratingNorm.startsWith('A')) ratingSpreadExpectationBps = 75;
  else if (ratingNorm.startsWith('BBB')) ratingSpreadExpectationBps = 130;
  else if (ratingNorm.startsWith('BB')) ratingSpreadExpectationBps = 260;
  else if (ratingNorm.startsWith('B')) ratingSpreadExpectationBps = 450;

  const expectedSpreadBps = ratingSpreadExpectationBps + Math.min(60, years * 3);
  const relativeValueSpreadResidueBps = gSpreadBps - expectedSpreadBps;

  let relativeValueStatus: 'CHEAP' | 'FAIR' | 'RICH' = 'FAIR';
  if (relativeValueSpreadResidueBps >= 18) relativeValueStatus = 'CHEAP';
  else if (relativeValueSpreadResidueBps <= -18) relativeValueStatus = 'RICH';

  return {
    cleanPrice: Math.round(cleanPrice * 1000) / 1000,
    dirtyPrice: Math.round(dirtyPrice * 1000) / 1000,
    accruedInterest: Math.round(accruedInterest * 1000) / 1000,
    yieldToMaturity: Math.round(yieldPercent * 1000) / 1000,
    currentYield: Math.round(currentYield * 1000) / 1000,
    macaulayDuration: Math.round(macaulayDuration * 1000) / 1000,
    modifiedDuration: Math.round(modifiedDuration * 1000) / 1000,
    convexity: Math.round(convexity * 1000) / 1000,
    dv01: Math.round(dv01 * 10) / 10,
    gSpreadBps,
    iSpreadBps,
    zSpreadBps,
    aswBps,
    oasBps,
    benchmarkSecurity: benchmark.name,
    benchmarkYield: benchmark.yieldPercent,
    yearsToMaturity: Math.round(years * 10) / 10,
    yieldToDurationRatio: Math.round(yieldToDurationRatio * 100) / 100,
    relativeValueStatus,
    relativeValueSpreadResidueBps
  };
}

/**
 * Calculates rate shock impact on a bond using modified duration and convexity.
 * Formula: dP/P ≈ -D_mod * dy + 0.5 * Conv * (dy)^2
 */
export function calculateRateShockImpact(
  modDuration: number,
  convexity: number,
  shockBps: number,
  nominal = 100000,
  cleanPrice = 100
): {
  pctChange: number;
  monetaryChange: number;
  newPrice: number;
} {
  const dy = shockBps / 10000;
  const pctChange = (-modDuration * dy + 0.5 * convexity * dy * dy) * 100;
  const newPrice = Math.max(0.01, cleanPrice * (1 + pctChange / 100));
  const monetaryChange = (pctChange / 100) * (nominal * (cleanPrice / 100));

  return {
    pctChange: Math.round(pctChange * 100) / 100,
    monetaryChange: Math.round(monetaryChange * 10) / 10,
    newPrice: Math.round(newPrice * 1000) / 1000
  };
}

/**
 * High quality realistic benchmark & corporate universe for instant exploration.
 */
export const DEFAULT_BENCHMARK_BONDS: BondComparable[] = [
  {
    securityId: 'FR0014007L00',
    name: 'OAT 2.50% 09/24/30',
    issuer: 'République Française',
    currency: 'EUR',
    issueDate: '2023-01-20',
    settlementDate: '2024-09-24',
    maturityDate: '2030-09-24',
    yieldToMaturity: 0.0265,
    faceValue: 100,
    couponRate: 2.50,
    couponFrequency: 1,
    marketPrice: 99.30,
    rating: 'AA',
    sector: 'Souverain',
    source: 'BGN',
    seniority: 'Senior Secured',
    isin: 'FR0014007L00',
    liquidity: 'Élevée',
    isGreenBond: false
  },
  {
    securityId: 'DE0001102580',
    name: 'Bund 2.10% 04/11/29',
    issuer: 'République Fédérale d’Allemagne',
    currency: 'EUR',
    issueDate: '2024-02-15',
    settlementDate: '2024-09-24',
    maturityDate: '2029-04-11',
    yieldToMaturity: 0.0220,
    faceValue: 100,
    couponRate: 2.10,
    couponFrequency: 1,
    marketPrice: 99.60,
    rating: 'AAA',
    sector: 'Souverain',
    source: 'BGN',
    seniority: 'Senior Secured',
    isin: 'DE0001102580',
    liquidity: 'Élevée',
    isGreenBond: false
  },
  {
    securityId: 'US91282CGM73',
    name: 'US Treasury 3.875% 08/15/33',
    issuer: 'United States of America',
    currency: 'USD',
    issueDate: '2023-08-15',
    settlementDate: '2024-09-24',
    maturityDate: '2033-08-15',
    yieldToMaturity: 0.0422,
    faceValue: 100,
    couponRate: 3.875,
    couponFrequency: 2,
    marketPrice: 97.40,
    rating: 'AAA',
    sector: 'Souverain',
    source: 'BMRK',
    seniority: 'Senior Secured',
    isin: 'US91282CGM73',
    liquidity: 'Élevée',
    isGreenBond: false
  },
  {
    securityId: 'FR001400QR62',
    name: 'EDF 4.125% 06/17/31 Corp',
    issuer: 'Électricité de France SA',
    currency: 'EUR',
    issueDate: '2024-06-17',
    settlementDate: '2024-09-24',
    maturityDate: '2031-06-17',
    yieldToMaturity: 0.0337,
    faceValue: 100,
    couponRate: 4.125,
    couponFrequency: 1,
    marketPrice: 104.48,
    rating: 'BBB',
    sector: 'Utilities',
    source: 'BGN',
    seniority: 'Senior Unsecured',
    isin: 'FR001400QR62',
    liquidity: 'Élevée',
    isGreenBond: true
  },
  {
    securityId: 'FR001400DO87',
    name: 'TotalEnergies 3.875% 03/15/28',
    issuer: 'TotalEnergies SE',
    currency: 'EUR',
    issueDate: '2023-03-15',
    settlementDate: '2024-09-24',
    maturityDate: '2028-03-15',
    yieldToMaturity: 0.0305,
    faceValue: 100,
    couponRate: 3.875,
    couponFrequency: 1,
    marketPrice: 102.50,
    rating: 'A+',
    sector: 'Énergie',
    source: 'BGN',
    seniority: 'Senior Unsecured',
    isin: 'FR001400DO87',
    liquidity: 'Élevée',
    isGreenBond: false
  },
  {
    securityId: 'FR0014007KS2',
    name: 'BNP Paribas 4.250% 04/13/31',
    issuer: 'BNP Paribas SA',
    currency: 'EUR',
    issueDate: '2023-04-13',
    settlementDate: '2024-09-24',
    maturityDate: '2031-04-13',
    yieldToMaturity: 0.0385,
    faceValue: 100,
    couponRate: 4.250,
    couponFrequency: 1,
    marketPrice: 102.10,
    rating: 'A-',
    sector: 'Finance',
    source: 'BGN',
    seniority: 'Senior Non-Preferred',
    isin: 'FR0014007KS2',
    liquidity: 'Élevée',
    isGreenBond: true
  },
  {
    securityId: 'FR001400G8Y1',
    name: 'Sanofi 3.125% 09/13/29',
    issuer: 'Sanofi SA',
    currency: 'EUR',
    issueDate: '2023-09-13',
    settlementDate: '2024-09-24',
    maturityDate: '2029-09-13',
    yieldToMaturity: 0.0282,
    faceValue: 100,
    couponRate: 3.125,
    couponFrequency: 1,
    marketPrice: 101.20,
    rating: 'AA-',
    sector: 'Santé',
    source: 'BGN',
    seniority: 'Senior Unsecured',
    isin: 'FR001400G8Y1',
    liquidity: 'Moyenne',
    isGreenBond: false
  },
  {
    securityId: 'FR001400L252',
    name: 'LVMH 3.375% 10/21/31',
    issuer: 'LVMH Moët Hennessy',
    currency: 'EUR',
    issueDate: '2023-10-21',
    settlementDate: '2024-09-24',
    maturityDate: '2031-10-21',
    yieldToMaturity: 0.0290,
    faceValue: 100,
    couponRate: 3.375,
    couponFrequency: 1,
    marketPrice: 102.80,
    rating: 'AA-',
    sector: 'Consommation',
    source: 'BGN',
    seniority: 'Senior Unsecured',
    isin: 'FR001400L252',
    liquidity: 'Élevée',
    isGreenBond: false
  },
  {
    securityId: 'FR0013396515',
    name: 'Vinci SA 3.375% 05/13/26',
    issuer: 'Vinci SA',
    currency: 'EUR',
    issueDate: '2020-05-13',
    settlementDate: '2024-09-24',
    maturityDate: '2026-05-13',
    yieldToMaturity: 0.0315,
    faceValue: 100,
    couponRate: 3.375,
    couponFrequency: 1,
    marketPrice: 100.10,
    rating: 'A-',
    sector: 'Industrie',
    source: 'BGN',
    seniority: 'Senior Unsecured',
    isin: 'FR0013396515',
    liquidity: 'Élevée',
    isGreenBond: false
  },
  {
    securityId: 'XS1813724603',
    name: 'Telecom Italia 6.875% 02/15/28',
    issuer: 'Telecom Italia SpA',
    currency: 'EUR',
    issueDate: '2018-02-15',
    settlementDate: '2024-09-24',
    maturityDate: '2028-02-15',
    yieldToMaturity: 0.0620,
    faceValue: 100,
    couponRate: 6.875,
    couponFrequency: 1,
    marketPrice: 102.30,
    rating: 'BB-',
    sector: 'Télécom',
    source: 'BGN',
    seniority: 'Senior Unsecured',
    isin: 'XS1813724603',
    liquidity: 'Moyenne',
    isGreenBond: false
  },
  {
    securityId: 'FR001400BK73',
    name: 'OAT 3.00% 05/25/34',
    issuer: 'République Française',
    currency: 'EUR',
    issueDate: '2023-05-25',
    settlementDate: '2024-09-24',
    maturityDate: '2034-05-25',
    yieldToMaturity: 0.0295,
    faceValue: 100,
    couponRate: 3.00,
    couponFrequency: 1,
    marketPrice: 100.40,
    rating: 'AA',
    sector: 'Souverain',
    source: 'BGN',
    seniority: 'Senior Secured',
    isin: 'FR001400BK73',
    liquidity: 'Élevée',
    isGreenBond: true
  },
  {
    securityId: 'FR001400F5K2',
    name: 'Air Liquide 2.875% 09/16/32',
    issuer: 'Air Liquide SA',
    currency: 'EUR',
    issueDate: '2022-09-16',
    settlementDate: '2024-09-24',
    maturityDate: '2032-09-16',
    yieldToMaturity: 0.0312,
    faceValue: 100,
    couponRate: 2.875,
    couponFrequency: 1,
    marketPrice: 98.20,
    rating: 'A',
    sector: 'Chimie',
    source: 'BGN',
    seniority: 'Senior Unsecured',
    isin: 'FR001400F5K2',
    liquidity: 'Élevée',
    isGreenBond: true
  }
];
