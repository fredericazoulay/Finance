export const OPTION_IMPORT_COLUMNS = [
  'optionId',
  'optionType',
  'underlyingType',
  'underlyingSecurityId',
  'currency',
  'valuationDate',
  'underlyingSpot',
  'strikePrice',
  'expirationDate',
  'premiumPerUnit',
  'exerciseStyle',
  'quantity',
  'nominal',
  'position',
  'intrinsicValuePerUnit',
  'timeValuePerUnit',
  'moneyness',
  'volatility',
  'riskFreeRate',
  'dividendYield',
  'delta',
  'gamma',
  'vegaPer1PctVol',
  'thetaPerDay',
  'rhoPer1PctRate',
  'underlyingYieldToMaturity',
  'dataSource'
] as const;

export type OptionImportColumn = typeof OPTION_IMPORT_COLUMNS[number];

export interface OptionImportRecord {
  optionId: string;
  optionType: 'CALL' | 'PUT';
  underlyingType: string;
  underlyingSecurityId: string;
  currency: string;
  valuationDate: string;
  underlyingSpot: number;
  strikePrice: number;
  expirationDate: string;
  premiumPerUnit: number;
  exerciseStyle: 'EUROPEAN' | 'AMERICAN' | 'BERMUDAN';
  quantity: number;
  nominal: number;
  position: 'LONG' | 'SHORT';
  intrinsicValuePerUnit: number;
  timeValuePerUnit: number;
  moneyness: string;
  volatility: number;
  riskFreeRate: number;
  dividendYield: number;
  delta: number;
  gamma: number;
  vegaPer1PctVol: number;
  thetaPerDay: number;
  rhoPer1PctRate: number;
  underlyingYieldToMaturity: number | null;
  dataSource: string;
}
