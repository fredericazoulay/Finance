export interface BondScenarioInput {
  faceValue: number;
  couponRatePercent: number;
  couponFrequency: number;
  maturityYears: number;
  yieldToMaturityPercent: number;
}

export interface BondCashFlow {
  timeYears: number;
  amount: number;
}

export interface BondScenarioMetrics {
  price: number;
  basePrice: number;
  duration: number;
  convexity: number;
  dv01: number;
  pnl: number;
  cashFlows: BondCashFlow[];
}

export function createBondCashFlows(input: BondScenarioInput): BondCashFlow[] | null {
  const faceValue = Number(input.faceValue);
  const couponRate = Number(input.couponRatePercent) / 100;
  const frequency = Number(input.couponFrequency);
  const maturity = Number(input.maturityYears);
  const yieldRate = Number(input.yieldToMaturityPercent) / 100;
  if (
    !Number.isFinite(faceValue) || faceValue <= 0 ||
    !Number.isFinite(couponRate) || couponRate < 0 ||
    ![1, 2, 4, 12].includes(frequency) ||
    !Number.isFinite(maturity) || maturity <= 0 ||
    !Number.isFinite(yieldRate) || yieldRate <= -frequency
  ) return null;

  const periodCount = Math.ceil(maturity * frequency);
  return Array.from({ length: periodCount }, (_, index) => {
    const period = index + 1;
    const timeYears = Math.min(period / frequency, maturity);
    const couponFraction = Math.min(1, Math.max(0, (maturity - (period - 1) / frequency) * frequency));
    const amount = faceValue * couponRate / frequency * couponFraction
      + (period === periodCount ? faceValue : 0);
    return { timeYears, amount };
  });
}

export function priceBondAtYield(cashFlows: BondCashFlow[], frequency: number, yieldRate: number): number {
  const discountBase = 1 + yieldRate / frequency;
  if (discountBase <= 0) return Number.NaN;
  return cashFlows.reduce(
    (price, flow) => price + flow.amount / Math.pow(discountBase, flow.timeYears * frequency),
    0
  );
}

export function calculateBondScenario(input: BondScenarioInput, shockBps = 0): BondScenarioMetrics | null {
  const cashFlows = createBondCashFlows(input);
  const frequency = Number(input.couponFrequency);
  const baseYield = Number(input.yieldToMaturityPercent) / 100;
  const scenarioYield = baseYield + shockBps / 10000;
  if (!cashFlows || !Number.isFinite(shockBps) || scenarioYield <= -frequency) return null;

  const price = priceBondAtYield(cashFlows, frequency, scenarioYield);
  const discountBase = 1 + scenarioYield / frequency;
  const weightedTime = cashFlows.reduce((total, flow) => {
    const presentValue = flow.amount / Math.pow(discountBase, flow.timeYears * frequency);
    return total + flow.timeYears * presentValue;
  }, 0);
  const duration = weightedTime / price / discountBase;
  const convexity = cashFlows.reduce((total, flow) => {
    const presentValue = flow.amount / Math.pow(discountBase, flow.timeYears * frequency);
    return total + flow.timeYears * (flow.timeYears + 1 / frequency) * presentValue;
  }, 0) / (price * discountBase * discountBase);
  const basePrice = priceBondAtYield(cashFlows, frequency, baseYield);
  if (![price, basePrice, duration, convexity].every(Number.isFinite) || price <= 0) return null;

  return {
    price,
    basePrice,
    duration,
    convexity,
    dv01: price * duration / 10000,
    pnl: price - basePrice,
    cashFlows
  };
}
