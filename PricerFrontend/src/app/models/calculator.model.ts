export interface CalculatorField {
  key: string;
  label: string;
  type?: string;
  step?: string;
}

export interface CalculatorGroup {
  label: string;
  items: string[];
}

export interface AmortizationRow {
  period: number | string;
  payment: number | string;
  principal: number | string;
  interest: number | string;
  balance: number | string;
  [key: string]: unknown;
}
