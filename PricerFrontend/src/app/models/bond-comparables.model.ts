export interface BondComparable {
  securityId: string;
  name: string;
  issuer?: string;
  currency: string;
  issueDate?: string;
  settlementDate?: string;
  maturityDate: string;
  yieldToMaturity: number;
  faceValue?: number;
  couponFrequency?: number;
  couponRate?: number;
  marketPrice?: number;
  rating?: string;
  sector?: string;
  source?: string;
  asOf?: string;
}

export interface BondComparablesRequest {
  target: {
    securityId: string;
    name: string;
    currency: string;
    faceValue: number;
    couponRate: number;
    couponFrequency: number;
    issueDate: string | null;
    maturityDate: string;
    settlementDate: string;
    dayCount: string;
  };
  panel: BondComparable[];
  maturityToleranceMonths: number;
}

export interface BondComparablesResponse {
  targetSecurityId: string;
  currency: string;
  maturityToleranceMonths: number;
  panel: Array<{
    bond: BondComparable;
    eligible: boolean;
    selected: boolean;
    exclusionReason: string | null;
  }>;
  bestYieldSecurityId: string;
  appliedYield: number;
  valuation: {
    cleanPrice: number;
    dirtyPrice: number;
    accruedInterest: number;
    accruedDays: number;
    dayCount: string;
    ytm: number;
    macaulayDuration: number;
    modifiedDuration: number;
    convexity: number;
    dv01: number;
  };
}

export interface BondDirectPricingRequest {
  solveFor: 'PRICE' | 'YTM' | 'TERM';
  faceValue: number;
  couponRate: number;
  couponFrequency: number;
  price?: number | null;
  ytm?: number | null;
  termYears?: number | null;
  issueDate?: string | null;
  maturityDate?: string | null;
  settlementDate?: string | null;
  dayCount?: string | null;
}

export interface BondDirectPricingResponse {
  solveFor: 'PRICE' | 'YTM' | 'TERM';
  faceValue: number;
  price: number;
  ytm: number;
  termYears: number;
  dirtyPrice: number | null;
  accruedInterest: number | null;
  accruedDays: number | null;
  dayCount: string;
  macaulayDuration: number | null;
  modifiedDuration: number | null;
  convexity: number | null;
  dv01: number | null;
}