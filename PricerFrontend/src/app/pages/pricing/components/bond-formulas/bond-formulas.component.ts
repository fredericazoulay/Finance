import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface FinancialFormula {
  name: string;
  description: string;
  definition: string;
}

@Component({
  selector: 'app-bond-formulas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bond-formulas.component.html',
  styleUrls: ['./bond-formulas.component.scss']
})
export class BondFormulasComponent {
  readonly formulas: FinancialFormula[] = [
    { name: 'DirtyPrice', description: 'Sum of discounted future cashflows', definition: 'PV = CF * exp(-(ZeroRate(Time) + ZSpread) * Time)' },
    { name: 'CleanPrice', description: 'Dirty price less accrued interest', definition: 'CleanPrice = DirtyPrice - AccruedInterest' },
    { name: 'AccruedInterest', description: 'Coupon accrued in the current coupon period', definition: 'Coupon * ActualDaysElapsed / ActualDaysInCouponPeriod' },
    { name: 'Duration', description: 'Present-value weighted time to cashflow', definition: 'Duration = Sum(Time * PV) / Sum(PV)' },
    { name: 'ModifiedDuration', description: 'Finite-difference price sensitivity', definition: '(Price(rate-1bp) - Price(rate+1bp)) / (2 * Price * 1bp)' },
    { name: 'Convexity', description: 'Finite-difference second-order price sensitivity', definition: '(PriceDown + PriceUp - 2 * Price) / (Price * 1bp^2)' },
    { name: 'DV01', description: 'Approximate price change for a 1bp rate move', definition: '(Price(rate-1bp) - Price(rate+1bp)) / 2' },
    { name: 'SpreadDV01', description: 'Approximate price change for a 1bp spread move', definition: '(Price(spread-1bp) - Price(spread+1bp)) / 2' },
    { name: 'CVA', description: 'Expected discounted counterparty loss', definition: 'Sum(DiscountFactor * EE * MarginalPD * LGD)' },
    { name: 'FRTB_IMA_ES', description: 'Synthetic scenario expected shortfall', definition: 'Mean of losses in worst 2.5% of generated scenarios' },
    { name: 'CallPriceAmount', description: 'Call amount in bond currency', definition: 'FaceValue * CallPricePer100 / 100' },
    { name: 'PutPriceAmount', description: 'Put amount in bond currency', definition: 'FaceValue * PutPricePer100 / 100' },
    { name: 'Parity', description: 'Convertible parity in bond currency', definition: 'UnderlyingSpot * ConversionRatio' },
    { name: 'ConversionPremiumPct', description: 'Premium of conversion price to underlying spot', definition: 'ConversionPrice / UnderlyingSpot - 1' },
    { name: 'OptionValue', description: 'Black-Scholes conversion-right proxy', definition: 'Ratio * (Spot * exp(-q*T) * N(d1) - Strike * exp(-r*T) * N(d2))' },
    { name: 'ConvertibleProxyValue', description: 'Bond floor plus conversion-right proxy', definition: 'BondFloor + OptionValue; not a convertible-bond valuation' },
    { name: 'Delta/Gamma/Vega/Theta/Rho', description: 'Conversion-right proxy sensitivities', definition: 'Black-Scholes call sensitivities scaled by conversion ratio; units stated on sheet' }
  ];
}
