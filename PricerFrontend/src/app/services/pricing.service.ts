import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of, timeout } from 'rxjs';
import { ChartPoint, FieldConfig, PriceResponse, ProductOption } from '../models/pricing.model';

@Injectable({
  providedIn: 'root'
})
export class PricingService {
  private readonly _apiOnline$ = new BehaviorSubject<boolean>(false);
  readonly apiOnline$ = this._apiOnline$.asObservable();

  readonly productOptions: ProductOption[] = [
    { code: 'EQTY_OPT', label: 'Equity Option' },
    { code: 'IRS', label: 'Interest Rate Swap' },
    { code: 'CDS', label: 'Credit Default Swap' },
    { code: 'FXC', label: 'FX Forward' },
    { code: 'BOND', label: 'Fixed Income Bond' },
    { code: 'EQUITY', label: 'Equity' }
  ];

  constructor(private readonly http: HttpClient) {
    this.checkApiHealth();
  }

  get apiOnline(): boolean {
    return this._apiOnline$.value;
  }

  setApiOnline(online: boolean): void {
    this._apiOnline$.next(online);
  }

  checkApiHealth(): Observable<boolean> {
    return this.http.get<{ status?: string }>('/api/health').pipe(
      map(() => {
        this.setApiOnline(true);
        return true;
      }),
      catchError(() => {
        this.setApiOnline(false);
        return of(false);
      })
    );
  }

  getPricingUrl(product: string): string {
    const map: Record<string, string> = {
      EQTY_OPT: '/api/v1/blp/pricing/equity-option',
      IRS: '/api/v1/blp/pricing/irs',
      CDS: '/api/v1/blp/pricing/cds',
      FXC: '/api/v1/blp/pricing/fx-forward',
      BOND: '/api/v1/blp/pricing/fixed-income-bond',
      EQUITY: '/api/v1/blp/pricing/equity'
    };
    return map[product] || '/api/v1/blp/pricing/equity-option';
  }

  submitPricing(product: string, payload: Record<string, unknown>): Observable<PriceResponse> {
    const url = this.getPricingUrl(product);
    return this.http.post<PriceResponse>(url, payload).pipe(
      timeout(15000),
      map(res => {
        this.setApiOnline(true);
        return res;
      }),
      catchError((error: HttpErrorResponse) => {
        this.setApiOnline(false);
        throw error;
      })
    );
  }

  getSecurityOptions(product: string): string[] {
    const map: Record<string, string[]> = {
      EQTY_OPT: ['AAPL US Equity', 'MSFT US Equity', 'SPY US Equity', 'TSLA US Equity'],
      IRS: ['USD 2Y IRS', 'USD 5Y IRS', 'EUR 5Y IRS', 'GBP 10Y IRS'],
      CDS: ['XYZ 5Y CDS', 'AAPL 5Y CDS', 'IBM 5Y CDS'],
      FXC: ['EURUSD Curncy', 'GBPUSD Curncy', 'USDJPY Curncy'],
      BOND: ['US GOVT 2Y', 'US GOVT 5Y', 'US GOVT 10Y'],
      EQUITY: ['AAPL US Equity', 'MSFT US Equity', 'SPY US Equity', 'TSLA US Equity']
    };
    return map[product] || [];
  }

  getPricingModelOptions(product: string): string[] {
    if (product === 'EQTY_OPT') return ['BLACK_SCHOLES', 'BINOMIAL', 'MONTE_CARLO'];
    if (product === 'BOND' || product === 'EQUITY') return ['DISCOUNTED_CASH_FLOW'];
    if (product === 'IRS' || product === 'CDS') return ['PAR_SWAP'];
    return ['FX_FORWARD'];
  }

  getProductFields(product: string): { marketFields: FieldConfig[]; instrumentFields: FieldConfig[] } {
    if (product === 'IRS') {
      return {
        marketFields: [
          { key: 'tenors', label: 'Tenors' },
          { key: 'discount_curve_rates', label: 'Discount Curve Rates' },
          { key: 'frequency', label: 'Frequency' }
        ],
        instrumentFields: [
          { key: 'notional', label: 'Notional' },
          { key: 'fixed_rate', label: 'Fixed Rate' },
          { key: 'maturity_years', label: 'Maturity (Y)' },
          { key: 'payment_frequency', label: 'Payment Freq.' },
          { key: 'receiver', label: 'Receiver', type: 'checkbox' }
        ]
      };
    }

    if (product === 'CDS') {
      return {
        marketFields: [
          { key: 'tenors', label: 'Tenors' },
          { key: 'discount_curve_rates', label: 'Discount Curve Rates' },
          { key: 'frequency', label: 'Frequency' }
        ],
        instrumentFields: [
          { key: 'notional', label: 'Notional' },
          { key: 'spread', label: 'Spread' },
          { key: 'maturity_years', label: 'Maturity (Y)' },
          { key: 'payment_frequency', label: 'Payment Freq.' },
          { key: 'recovery_rate', label: 'Recovery' }
        ]
      };
    }

    if (product === 'FXC') {
      return {
        marketFields: [
          { key: 'spot', label: 'Spot' },
          { key: 'domestic_rate', label: 'Domestic Rate' },
          { key: 'foreign_rate', label: 'Foreign Rate' }
        ],
        instrumentFields: [
          { key: 'pair', label: 'Pair', options: ['EURUSD', 'GBPUSD', 'USDJPY'] },
          { key: 'maturity_years', label: 'Maturity (Y)' }
        ]
      };
    }

    if (product === 'BOND') {
      return {
        marketFields: [{ key: 'yield_to_maturity', label: 'Yield to Maturity' }],
        instrumentFields: [
          { key: 'face_value', label: 'Face Value' },
          { key: 'coupon_rate', label: 'Coupon Rate' },
          { key: 'coupon_frequency', label: 'Coupon Freq.' },
          { key: 'maturity_years', label: 'Maturity (Y)' }
        ]
      };
    }

    if (product === 'EQUITY') {
      return {
        marketFields: [
          { key: 'underlying_spot', label: 'Underlying Spot' },
          { key: 'discount_rate', label: 'Discount Rate' }
        ],
        instrumentFields: [
          { key: 'forecast_dividend', label: 'Forecast Dividend' },
          { key: 'growth_rate', label: 'Growth Rate' }
        ]
      };
    }

    return {
      marketFields: [
        { key: 'underlying_spot', label: 'Underlying Spot' },
        { key: 'risk_free_rate', label: 'Risk-Free Rate' },
        { key: 'implied_volatility', label: 'Volatility' },
        { key: 'dividend_yield', label: 'Dividend Yield' }
      ],
      instrumentFields: [
        { key: 'strike', label: 'Strike' },
        { key: 'maturity_years', label: 'Maturity (Y)' },
        { key: 'option_type', label: 'Option Type', options: ['CALL', 'PUT'] },
        { key: 'exercise_style', label: 'Exercise Style', options: ['EUROPEAN', 'AMERICAN'] }
      ]
    };
  }

  getProductDefaults(product: string): Record<string, unknown> {
    const base = {
      request_id: 'REQ-1001',
      security_id: 'AAPL US Equity',
      security_name: 'AAPL US Equity',
      curve_name: 'USD-SOFR',
      market_data_source: 'BDP',
      pricing_model: 'BLACK_SCHOLES',
      product
    };

    if (product === 'IRS') {
      return {
        ...base,
        security_id: 'USD 5Y IRS',
        security_name: 'USD 5Y IRS',
        market_data_source: 'Bloomberg',
        pricing_model: 'PAR_SWAP',
        notional: 1000000,
        fixed_rate: 0.03,
        maturity_years: 5,
        payment_frequency: 2,
        receiver: true,
        tenors: [1, 2, 3, 5, 7, 10],
        discount_curve_rates: [0.018, 0.022, 0.025, 0.029, 0.031, 0.033],
        frequency: 2
      };
    }

    if (product === 'CDS') {
      return {
        ...base,
        security_id: 'XYZ 5Y CDS',
        security_name: 'XYZ 5Y CDS',
        market_data_source: 'Bloomberg',
        pricing_model: 'IMPLIED_HAZARD',
        notional: 1000000,
        spread: 0.015,
        maturity_years: 5,
        payment_frequency: 4,
        recovery_rate: 0.4,
        tenors: [1, 2, 3, 5, 7, 10],
        discount_curve_rates: [0.015, 0.018, 0.021, 0.025, 0.028, 0.031],
        frequency: 4
      };
    }

    if (product === 'FXC') {
      return {
        ...base,
        security_id: 'EURUSD Curncy',
        security_name: 'EURUSD Curncy',
        market_data_source: 'Reuters',
        pricing_model: 'FX_FORWARD',
        spot: 1.08,
        domestic_rate: 0.05,
        foreign_rate: 0.02,
        pair: 'EURUSD',
        maturity_years: 1
      };
    }

    if (product === 'BOND') {
      return {
        ...base,
        security_id: 'US GOVT 5Y',
        security_name: 'US GOVT 5Y',
        product: 'BOND',
        market_data_source: 'Bloomberg',
        pricing_model: 'DISCOUNTED_CASH_FLOW',
        face_value: 100,
        coupon_rate: 0.04,
        coupon_frequency: 2,
        maturity_years: 5,
        yield_to_maturity: 0.035
      };
    }

    if (product === 'EQUITY') {
      return {
        ...base,
        security_id: 'AAPL US Equity',
        security_name: 'AAPL US Equity',
        product: 'EQUITY',
        market_data_source: 'Bloomberg',
        pricing_model: 'DISCOUNTED_CASH_FLOW',
        forecast_dividend: 2,
        growth_rate: 0.03,
        underlying_spot: 100,
        discount_rate: 0.05
      };
    }

    return {
      ...base,
      underlying_spot: 100,
      risk_free_rate: 0.05,
      implied_volatility: 0.2,
      dividend_yield: 0.01,
      strike: 100,
      maturity_years: 1,
      option_type: 'CALL',
      exercise_style: 'EUROPEAN'
    };
  }

  buildPayload(product: string, values: Record<string, any>): Record<string, unknown> {
    const base = {
      request_id: values['request_id'],
      security_id: values['security_id'],
      security_name: values['security_name'],
      product,
      curve_name: values['curve_name'],
      market_data_source: values['market_data_source'],
      pricing_model: values['pricing_model']
    };

    if (product === 'EQTY_OPT') {
      return {
        ...base,
        market_data: {
          underlying_spot: Number(values['underlying_spot']),
          risk_free_rate: Number(values['risk_free_rate']),
          implied_volatility: Number(values['implied_volatility']),
          dividend_yield: Number(values['dividend_yield'])
        },
        instrument: {
          strike: Number(values['strike']),
          maturity_years: Number(values['maturity_years']),
          option_type: values['option_type'],
          exercise_style: values['exercise_style']
        }
      };
    }

    if (product === 'IRS') {
      return {
        ...base,
        market_data: {
          tenors: values['tenors'],
          discount_curve_rates: values['discount_curve_rates'],
          frequency: Number(values['frequency'])
        },
        instrument: {
          notional: Number(values['notional']),
          fixed_rate: Number(values['fixed_rate']),
          maturity_years: Number(values['maturity_years']),
          payment_frequency: Number(values['payment_frequency']),
          receiver: Boolean(values['receiver'])
        }
      };
    }

    if (product === 'CDS') {
      return {
        ...base,
        market_data: {
          tenors: values['tenors'],
          discount_curve_rates: values['discount_curve_rates'],
          frequency: Number(values['frequency'])
        },
        instrument: {
          notional: Number(values['notional']),
          spread: Number(values['spread']),
          maturity_years: Number(values['maturity_years']),
          payment_frequency: Number(values['payment_frequency']),
          recovery_rate: Number(values['recovery_rate'])
        }
      };
    }

    if (product === 'BOND') {
      return {
        model: values['pricing_model'],
        face_value: Number(values['face_value']),
        coupon_rate: Number(values['coupon_rate']),
        coupon_frequency: Number(values['coupon_frequency']),
        maturity_years: Number(values['maturity_years']),
        yield_to_maturity: Number(values['yield_to_maturity'])
      };
    }

    if (product === 'EQUITY') {
      return {
        model: values['pricing_model'],
        forecast_dividend: Number(values['forecast_dividend']),
        growth_rate: Number(values['growth_rate']),
        underlying_spot: Number(values['underlying_spot']),
        discount_rate: Number(values['discount_rate'])
      };
    }

    return {
      ...base,
      market_data: {
        spot: Number(values['spot']),
        domestic_rate: Number(values['domestic_rate']),
        foreign_rate: Number(values['foreign_rate'])
      },
      instrument: {
        pair: values['pair'],
        maturity_years: Number(values['maturity_years'])
      }
    };
  }

  formatResultValue(result: Record<string, unknown> | undefined): string {
    if (!result) return '-';
    if (typeof result['price'] === 'number') return `$${Number(result['price']).toFixed(4)}`;
    if (typeof result['present_value'] === 'number') return `$${Number(result['present_value']).toFixed(2)}`;
    if (typeof result['forward_price'] === 'number') return Number(result['forward_price']).toFixed(6).toString();
    if (typeof result['implied_hazard_rate'] === 'number') return Number(result['implied_hazard_rate']).toFixed(6).toString();
    if (typeof result['par_rate'] === 'number') return Number(result['par_rate']).toFixed(6).toString();
    return JSON.stringify(result);
  }

  getChartTitle(product: string): string {
    return product === 'IRS' || product === 'CDS' ? 'Curve monitor' : 'Sensitivity monitor';
  }

  getChartUnit(product: string): string {
    if (product === 'FXC') return 'Forward points';
    if (product === 'IRS' || product === 'CDS') return 'Rate';
    return 'Value';
  }

  calculateChartPoints(product: string, values: Record<string, any>): ChartPoint[] {
    let series: number[];
    if (product === 'IRS' || product === 'CDS') {
      series = Array.from(values['discount_curve_rates'] || [], Number);
    } else if (product === 'FXC') {
      series = [
        Number(values['spot']),
        Number(values['spot']) * (1 + (Number(values['domestic_rate']) - Number(values['foreign_rate'])) * Number(values['maturity_years']))
      ];
    } else if (product === 'EQTY_OPT') {
      series = [80, 90, 100, 110, 120].map(spot => Math.max(spot - Number(values['strike']), 0));
    } else if (product === 'BOND') {
      series = [0, 1, 2, 3, 4, 5].map(year => Number(values['face_value']) * Math.pow(1 + Number(values['yield_to_maturity']), -year));
    } else {
      series = [
        Number(values['forecast_dividend']),
        Number(values['forecast_dividend']) * 1.1,
        Number(values['forecast_dividend']) * 1.2,
        Number(values['forecast_dividend']) * 1.3
      ];
    }
    series = series.filter(Number.isFinite);
    if (!series.length) return [];
    const min = Math.min(...series);
    const max = Math.max(...series);
    const spread = max - min || 1;
    return series.map((value, index) => ({
      cx: 42 + index * (458 / Math.max(series.length - 1, 1)),
      cy: 145 - ((value - min) / spread) * 115
    }));
  }
}
