import { Injectable } from '@angular/core';

export interface OptionGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  breakEven: number;
  intrinsicValue: number;
  timeValue: number;
}

export interface PayoffPoint {
  spot: number;
  payoffAtExpiry: number;
  theoreticalValue: number;
}

@Injectable({
  providedIn: 'root'
})
export class FinancialMathService {
  /**
   * Probability density function for standard normal distribution
   */
  pdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  /**
   * Cumulative distribution function for standard normal distribution
   * using high-accuracy Abramowitz & Stegun approximation
   */
  cdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;

    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Compute Black-Scholes Price & Greeks
   */
  calculateBlackScholes(
    spot: number,
    strike: number,
    rate: number,
    volatility: number,
    maturityYears: number,
    dividendYield = 0,
    isCall = true
  ): { price: number; greeks: OptionGreeks } {
    spot = Math.max(0.0001, spot);
    strike = Math.max(0.0001, strike);
    volatility = Math.max(0.0001, volatility);
    const t = Math.max(0.0001, maturityYears);

    const sqrtT = Math.sqrt(t);
    const d1 = (Math.log(spot / strike) + (rate - dividendYield + 0.5 * volatility * volatility) * t) / (volatility * sqrtT);
    const d2 = d1 - volatility * sqrtT;

    const discountUnderlying = Math.exp(-dividendYield * t);
    const discountStrike = Math.exp(-rate * t);

    let price = 0;
    let delta = 0;
    let theta = 0;
    let breakEven = 0;
    let intrinsicValue = 0;

    const phiD1 = this.pdf(d1);
    const gamma = (discountUnderlying * phiD1) / (spot * volatility * sqrtT);
    // Vega per 1% change in volatility
    const vega = (spot * discountUnderlying * sqrtT * phiD1) / 100;

    if (isCall) {
      price = spot * discountUnderlying * this.cdf(d1) - strike * discountStrike * this.cdf(d2);
      delta = discountUnderlying * this.cdf(d1);
      const thetaAnnual = -(spot * discountUnderlying * phiD1 * volatility) / (2 * sqrtT)
        - rate * strike * discountStrike * this.cdf(d2)
        + dividendYield * spot * discountUnderlying * this.cdf(d1);
      theta = thetaAnnual / 365;
      breakEven = strike + price;
      intrinsicValue = Math.max(spot - strike, 0);
    } else {
      price = strike * discountStrike * this.cdf(-d2) - spot * discountUnderlying * this.cdf(-d1);
      delta = -discountUnderlying * this.cdf(-d1);
      const thetaAnnual = -(spot * discountUnderlying * phiD1 * volatility) / (2 * sqrtT)
        + rate * strike * discountStrike * this.cdf(-d2)
        - dividendYield * spot * discountUnderlying * this.cdf(-d1);
      theta = thetaAnnual / 365;
      breakEven = Math.max(0, strike - price);
      intrinsicValue = Math.max(strike - spot, 0);
    }

    const timeValue = Math.max(0, price - intrinsicValue);

    return {
      price: Math.max(0, price),
      greeks: {
        delta: Number(delta.toFixed(4)),
        gamma: Number(gamma.toFixed(6)),
        vega: Number(vega.toFixed(4)),
        theta: Number(theta.toFixed(4)),
        breakEven: Number(breakEven.toFixed(2)),
        intrinsicValue: Number(intrinsicValue.toFixed(2)),
        timeValue: Number(timeValue.toFixed(2))
      }
    };
  }

  /**
   * Generate points for the payoff diagram
   */
  generatePayoffCurve(
    spot: number,
    strike: number,
    rate: number,
    volatility: number,
    maturityYears: number,
    dividendYield = 0,
    isCall = true,
    steps = 40
  ): PayoffPoint[] {
    const minSpot = Math.max(1, strike * 0.5);
    const maxSpot = strike * 1.5;
    const stepSize = (maxSpot - minSpot) / steps;

    const currentResult = this.calculateBlackScholes(spot, strike, rate, volatility, maturityYears, dividendYield, isCall);
    const premium = currentResult.price;

    const points: PayoffPoint[] = [];

    for (let s = minSpot; s <= maxSpot; s += stepSize) {
      const theoretical = this.calculateBlackScholes(s, strike, rate, volatility, maturityYears, dividendYield, isCall).price - premium;
      const payoffAtExpiry = isCall ? Math.max(s - strike, 0) - premium : Math.max(strike - s, 0) - premium;

      points.push({
        spot: Number(s.toFixed(2)),
        payoffAtExpiry: Number(payoffAtExpiry.toFixed(2)),
        theoreticalValue: Number(theoretical.toFixed(2))
      });
    }

    return points;
  }
}
