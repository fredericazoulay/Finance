export interface BondComparable {
  securityId: string;
  name: string;
  issuer?: string;
  currency: string;
  maturityDate: string;
  yieldToMaturity: number;
  faceValue?: number;
  couponFrequency?: number;
  couponRate?: number;
  marketPrice?: number;
  rating?: string;
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
    issueDate: string;
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