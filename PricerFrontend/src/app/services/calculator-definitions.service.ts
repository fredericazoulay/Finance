import { Injectable } from '@angular/core';
import { Validators } from '@angular/forms';
import { CalculatorField, CalculatorGroup } from '../models/calculator.model';

@Injectable({ providedIn: 'root' })
export class CalculatorDefinitionsService {
  readonly groups: CalculatorGroup[] = [
    { label: 'Mortgage and Real Estate', items: ['mortgage', 'loan', 'payment', 'apr', 'refinance', 'house-affordability', 'rent'] },
    { label: 'Auto', items: ['auto-loan', 'auto-lease'] },
    { label: 'Investment', items: ['simple-interest', 'compound-interest', 'savings', 'investment', 'cd', 'bond', 'roi', 'irr', 'payback-period', 'present-value', 'future-value'] },
    { label: 'Retirement', items: ['retirement', '401k', 'ira', 'annuity', 'annuity-payout'] },
    { label: 'Tax and Salary', items: ['sales-tax', 'vat', 'income-tax', 'salary', 'take-home-paycheck'] },
    { label: 'Business', items: ['depreciation', 'margin', 'discount', 'commission'] },
    { label: 'Other', items: ['currency', 'inflation', 'debt-payoff', 'credit-card-payoff', 'student-loan'] }
  ];

  private readonly rate: CalculatorField = { key: 'annualRate', label: 'Annual rate', step: '0.0001' };
  private readonly term: CalculatorField = { key: 'termYears', label: 'Term (years)' };
  private readonly payments: CalculatorField = { key: 'paymentsPerYear', label: 'Payments per year', step: '1' };
  private readonly loanFields: CalculatorField[] = [{ key: 'principal', label: 'Principal' }, this.rate, this.term, this.payments];

  readonly fields: Record<string, CalculatorField[]> = {
    loan: this.loanFields,
    payment: this.loanFields,
    mortgage: [{ key: 'principal', label: 'Loan amount' }, this.rate, this.term, this.payments],
    'auto-loan': [{ key: 'principal', label: 'Loan amount' }, this.rate, this.term, this.payments],
    'student-loan': [{ key: 'principal', label: 'Loan amount' }, this.rate, this.term, this.payments],
    refinance: [{ key: 'currentBalance', label: 'Current balance' }, { key: 'newRate', label: 'New rate', step: '0.0001' }, this.term, { key: 'closingCosts', label: 'Closing costs' }],
    'house-affordability': [{ key: 'monthlyIncome', label: 'Monthly income' }, { key: 'monthlyExpenses', label: 'Monthly expenses' }, this.rate, this.term, { key: 'downPayment', label: 'Down payment' }],
    rent: [{ key: 'monthlyRent', label: 'Monthly rent' }, { key: 'propertyValue', label: 'Property value' }],
    'auto-lease': [{ key: 'principal', label: 'Vehicle price' }, { key: 'residualValue', label: 'Residual value' }, this.rate, this.term],
    'simple-interest': [{ key: 'principal', label: 'Principal' }, this.rate, this.term],
    'compound-interest': [{ key: 'principal', label: 'Principal' }, this.rate, this.term, { key: 'compoundsPerYear', label: 'Compounds per year', step: '1' }, { key: 'contribution', label: 'Contribution' }, { key: 'contributionFrequency', label: 'Contribution frequency', step: '1' }],
    savings: [{ key: 'principal', label: 'Initial savings' }, this.rate, this.term, { key: 'compoundsPerYear', label: 'Compounds per year', step: '1' }, { key: 'contribution', label: 'Contribution' }, { key: 'contributionFrequency', label: 'Contribution frequency', step: '1' }],
    investment: [{ key: 'principal', label: 'Initial investment' }, { key: 'returnRate', label: 'Return rate', step: '0.0001' }, this.term, { key: 'contribution', label: 'Contribution' }, { key: 'contributionFrequency', label: 'Contribution frequency', step: '1' }],
    cd: [{ key: 'principal', label: 'Deposit' }, this.rate, this.term, { key: 'compoundsPerYear', label: 'Compounds per year', step: '1' }],
    bond: [{ key: 'faceValue', label: 'Face value' }, { key: 'annualRate', label: 'Yield', step: '0.0001' }, { key: 'couponRate', label: 'Annual coupon', step: '0.0001' }, { key: 'couponFrequency', label: 'Coupon frequency', step: '1' }, { key: 'maturityDate', label: 'Maturity date', type: 'date' }, { key: 'settlementDate', label: 'Settlement date', type: 'date' }, { key: 'dayCount', label: 'Day count', type: 'text' }],
    roi: [{ key: 'principal', label: 'Amount invested' }, { key: 'futureValue', label: 'Amount returned' }],
    irr: [{ key: 'cashFlows', label: 'Cash flows (comma-separated)', type: 'text' }],
    'payback-period': [{ key: 'principal', label: 'Initial investment' }, { key: 'annualContribution', label: 'Annual cash flow' }],
    'present-value': [{ key: 'futureValue', label: 'Future value' }, this.rate, this.term],
    'future-value': [{ key: 'presentValue', label: 'Present value' }, this.rate, this.term],
    retirement: [{ key: 'currentSavings', label: 'Current savings' }, { key: 'annualContribution', label: 'Annual contribution' }, { key: 'returnRate', label: 'Return rate', step: '0.0001' }, { key: 'termYears', label: 'Years to retirement' }],
    '401k': [{ key: 'currentSavings', label: 'Current savings' }, { key: 'annualContribution', label: 'Annual contribution' }, { key: 'returnRate', label: 'Return rate', step: '0.0001' }, { key: 'termYears', label: 'Years to retirement' }],
    ira: [{ key: 'currentSavings', label: 'Current savings' }, { key: 'annualContribution', label: 'Annual contribution' }, { key: 'returnRate', label: 'Return rate', step: '0.0001' }, { key: 'termYears', label: 'Years to retirement' }],
    annuity: [{ key: 'payment', label: 'Payment' }, this.rate, this.term, this.payments],
    'annuity-payout': [{ key: 'payment', label: 'Payment' }, this.rate, this.term, this.payments],
    'debt-payoff': [{ key: 'principal', label: 'Debt balance' }, this.rate, { key: 'monthlyPayment', label: 'Monthly payment' }],
    'credit-card-payoff': [{ key: 'principal', label: 'Credit card balance' }, this.rate, { key: 'monthlyPayment', label: 'Monthly payment' }],
    inflation: [{ key: 'amount', label: 'Current amount' }, { key: 'inflationRate', label: 'Inflation rate', step: '0.0001' }, { key: 'termYears', label: 'Years' }],
    'sales-tax': [{ key: 'amount', label: 'Amount' }, { key: 'taxRate', label: 'Tax rate', step: '0.0001' }],
    vat: [{ key: 'amount', label: 'Amount' }, { key: 'taxRate', label: 'VAT rate', step: '0.0001' }],
    'income-tax': [{ key: 'amount', label: 'Income' }, { key: 'taxRate', label: 'Tax rate', step: '0.0001' }],
    salary: [{ key: 'annualIncome', label: 'Annual income' }, { key: 'taxRate', label: 'Tax rate', step: '0.0001' }],
    'take-home-paycheck': [{ key: 'annualIncome', label: 'Annual income' }, { key: 'taxRate', label: 'Tax rate', step: '0.0001' }],
    depreciation: [{ key: 'principal', label: 'Asset cost' }, { key: 'salvageValue', label: 'Salvage value' }, { key: 'usefulLifeYears', label: 'Useful life (years)' }],
    margin: [{ key: 'amount', label: 'Sales amount' }, { key: 'marginRate', label: 'Margin rate', step: '0.0001' }],
    discount: [{ key: 'amount', label: 'Original price' }, { key: 'discountRate', label: 'Discount rate', step: '0.0001' }],
    commission: [{ key: 'amount', label: 'Sale amount' }, { key: 'commissionRate', label: 'Commission rate', step: '0.0001' }],
    currency: [{ key: 'amount', label: 'Amount' }, { key: 'exchangeRate', label: 'Exchange rate', step: '0.0001' }],
    apr: [{ key: 'principal', label: 'Principal' }, this.rate, { key: 'fees', label: 'Fees' }, this.term]
  };

  getFields(calculator: string): CalculatorField[] {
    return this.fields[calculator] || this.fields['loan'];
  }

  getDefaultFormValues(): Record<string, any> {
    return {
      principal: 250000,
      amount: 10000,
      annualRate: 0.05,
      interestRate: 0.05,
      termYears: 30,
      paymentsPerYear: 12,
      compoundsPerYear: 12,
      contribution: 0,
      contributionFrequency: 12,
      payment: 1500,
      monthlyPayment: 300,
      initialInvestment: 10000,
      annualContribution: 5000,
      returnRate: 0.07,
      currentSavings: 25000,
      futureValue: 15000,
      presentValue: 10000,
      exchangeRate: 1.08,
      inflationRate: 0.03,
      taxRate: 0.2,
      fees: 0,
      cashFlows: '-10000,3000,4000,5000',
      faceValue: 100,
      couponRate: 0.05,
      couponFrequency: 1,
      maturityDate: '2029-09-16',
      settlementDate: '2026-09-19',
      dayCount: '30/360',
      currentBalance: 250000,
      newRate: 0.04,
      closingCosts: 5000,
      propertyValue: 300000,
      monthlyIncome: 6000,
      monthlyExpenses: 1800,
      monthlyRent: 1200,
      downPayment: 50000,
      residualValue: 10000,
      salvageValue: 0,
      usefulLifeYears: 5,
      discountRate: 0.1,
      marginRate: 0.2,
      commissionRate: 0.05,
      annualIncome: 60000
    };
  }

  getFormValidators(): Record<string, any[]> {
    return {
      principal: [Validators.min(0.01)],
      amount: [Validators.min(0.01)],
      annualRate: [Validators.min(0)],
      interestRate: [Validators.min(0)],
      termYears: [Validators.min(0.01)],
      paymentsPerYear: [Validators.min(1)],
      compoundsPerYear: [Validators.min(1)],
      contribution: [Validators.min(0)],
      contributionFrequency: [Validators.min(1)],
      payment: [Validators.min(0.01)],
      monthlyPayment: [Validators.min(0.01)],
      initialInvestment: [Validators.min(0.01)],
      annualContribution: [Validators.min(0)],
      returnRate: [Validators.min(0)],
      currentSavings: [Validators.min(0)],
      futureValue: [Validators.min(0.01)],
      presentValue: [Validators.min(0.01)],
      exchangeRate: [Validators.min(0.000001)],
      inflationRate: [Validators.min(0)],
      taxRate: [Validators.min(0)],
      fees: [Validators.min(0)],
      cashFlows: [],
      faceValue: [Validators.min(0.01)],
      couponRate: [Validators.min(0)],
      couponFrequency: [Validators.min(1)],
      maturityDate: [],
      settlementDate: [],
      dayCount: [],
      currentBalance: [Validators.min(0.01)],
      newRate: [Validators.min(0)],
      closingCosts: [Validators.min(0)],
      propertyValue: [Validators.min(0.01)],
      monthlyIncome: [Validators.min(0.01)],
      monthlyExpenses: [Validators.min(0.01)],
      monthlyRent: [Validators.min(0.01)],
      downPayment: [Validators.min(0)],
      residualValue: [Validators.min(0)],
      salvageValue: [Validators.min(0)],
      usefulLifeYears: [Validators.min(0.01)],
      discountRate: [Validators.min(0)],
      marginRate: [Validators.min(0)],
      commissionRate: [Validators.min(0)],
      annualIncome: [Validators.min(0.01)]
    };
  }
}
