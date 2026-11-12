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
  couponDataStatus?: string;
  couponRate?: number;
  marketPrice?: number;
  cleanPrice?: number;
  cleanPriceDataStatus?: string;
  rating?: string;
  sector?: string;
  source?: string;
  asOf?: string;
  seniority?: string;
  isin?: string;
  modifiedDuration?: number;
  duration?: number;
  convexity?: number;
  dv01?: number;
  spreadBps?: number;
  spreadDataStatus?: string;
  zSpread?: number;
  bid?: number;
  ask?: number;
  bidAskSpread?: number;
  volume?: number;
  traceVolume?: number;
  liquidityScore?: number;
  liquidityDataStatus?: string;
  turnoverRatio?: number;
  frtbCapital?: number;
  frtbDisclaimer?: string;
  couponType?: 'Fixe' | 'Variable' | 'Zéro';
  liquidity?: 'Élevée' | 'Moyenne' | 'Faible';
  esgScore?: number;
  esgDataStatus?: string;
  ngfsScenarioImpacts?: Array<{
    scenario: string;
    spreadShockBps?: number;
    impact?: number;
    impactPercent?: number;
    dataStatus?: string;
  }>;
  isGreenBond?: boolean;
  relativeValueStatus?: 'CHEAP' | 'FAIR' | 'RICH';
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
    issuer?: string | null;
    rating?: string | null;
    sector?: string | null;
    seniority?: string | null;
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
    rank?: number | null;
    rankingReasons?: string[];
  }>;
  bestYieldSecurityId: string;
  appliedYield: number;
  rankingCriteria?: string[];
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