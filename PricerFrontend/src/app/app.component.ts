import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

interface PriceResponse {
  request_id?: string;
  response_status?: string;
  security_id?: string;
  security_name?: string;
  product?: string;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule],
  template: `
    <div class="terminal-shell">
      <header class="topbar">
        <div class="brand">
          <span class="dot green"></span>
          <span>Finance Pricer Terminal</span>
        </div>
        <div class="status">
          <span>API</span>
          <span class="pill" [class.online]="apiOnline">{{ apiOnline ? 'ONLINE' : 'OFFLINE' }}</span>
        </div>
      </header>

      <aside class="sidebar">
        <div class="menu-title">Instrument</div>
        <button type="button" (click)="selectProduct('EQTY_OPT')" [class.active]="selectedProduct === 'EQTY_OPT'">Equity Option</button>
        <button type="button" (click)="selectProduct('IRS')" [class.active]="selectedProduct === 'IRS'">IRS</button>
        <button type="button" (click)="selectProduct('CDS')" [class.active]="selectedProduct === 'CDS'">CDS</button>
        <button type="button" (click)="selectProduct('FXC')" [class.active]="selectedProduct === 'FXC'">FX Forward</button>
        <button type="button" (click)="selectProduct('BOND')" [class.active]="selectedProduct === 'BOND'">Bond</button>
        <button type="button" (click)="selectProduct('EQUITY')" [class.active]="selectedProduct === 'EQUITY'">Equity</button>
      </aside>

      <main class="content">
        <section class="panel form-panel">
          <div class="panel-header">{{ selectedProductLabel }}</div>
          <form [formGroup]="form" (ngSubmit)="submitRequest()">
            <div class="grid">
              <label>
                <span>Request ID</span>
                <input formControlName="request_id" />
              </label>
              <label>
                <span>Security ID</span>
                <input formControlName="security_id" />
              </label>
              <label>
                <span>Security Name</span>
                <input formControlName="security_name" />
              </label>
              <label>
                <span>Product</span>
                <input formControlName="product" />
              </label>
              <label>
                <span>Curve</span>
                <input formControlName="curve_name" />
              </label>
              <label>
                <span>Source</span>
                <input formControlName="market_data_source" />
              </label>
              <label>
                <span>Model</span>
                <input formControlName="pricing_model" />
              </label>
            </div>

            <div class="subsection">
              <h3>Market Data</h3>
              <div class="grid small-grid">
                <label *ngFor="let field of marketFields">
                  <span>{{ field.label }}</span>
                  <input [formControlName]="field.key" [attr.type]="field.type || 'number'" />
                </label>
              </div>
            </div>

            <div class="subsection">
              <h3>Instrument</h3>
              <div class="grid small-grid">
                <label *ngFor="let field of instrumentFields">
                  <span>{{ field.label }}</span>
                  <input [formControlName]="field.key" [attr.type]="field.type || 'number'" />
                </label>
              </div>
            </div>

            <div class="actions">
              <button type="submit" class="primary" [disabled]="isPricing">{{ isPricing ? 'Pricing...' : 'Price' }}</button>
              <button type="button" class="secondary" (click)="resetForm()">Reset</button>
            </div>
            <p class="error-message" *ngIf="apiError">{{ apiError }}</p>
          </form>
        </section>

        <section class="panel quote-panel">
          <div class="panel-header">Quote Monitor</div>
          <div class="quote-grid">
            <div class="quote-box">
              <span class="label">Security</span>
              <strong>{{ lastResponse?.security_name || '-' }}</strong>
            </div>
            <div class="quote-box">
              <span class="label">Product</span>
              <strong>{{ lastResponse?.product || '-' }}</strong>
            </div>
            <div class="quote-box">
              <span class="label">Status</span>
              <strong>{{ lastResponse?.response_status || 'WAITING' }}</strong>
            </div>
            <div class="quote-box accent">
              <span class="label">Price</span>
              <strong>{{ formatResultValue(lastResponse?.result) }}</strong>
            </div>
          </div>

          <div class="json-box">
            <pre>{{ lastResponse | json }}</pre>
          </div>

          <div class="chart-box">
            <div class="chart-heading"><span>{{ chartTitle }}</span><span>{{ chartUnit }}</span></div>
            <svg viewBox="0 0 520 190" role="img" aria-label="Market sensitivity chart">
              <line class="chart-axis" x1="42" y1="155" x2="500" y2="155"></line>
              <line class="chart-axis" x1="42" y1="20" x2="42" y2="155"></line>
              <polyline class="chart-line" [attr.points]="chartPolyline"></polyline>
              <circle class="chart-point" *ngFor="let point of chartPoints" [attr.cx]="point.cx" [attr.cy]="point.cy" r="3"></circle>
            </svg>
          </div>
        </section>
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        background: #07141d;
        color: #eaf6ff;
        font-family: 'Segoe UI', sans-serif;
      }

      .terminal-shell {
        display: grid;
        grid-template-columns: 220px 1fr;
        grid-template-rows: 64px 1fr;
        height: 100vh;
      }

      .topbar {
        grid-column: 1 / -1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 20px;
        background: #0d1b25;
        border-bottom: 1px solid rgba(124, 181, 255, 0.2);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        display: inline-block;
      }

      .dot.green { background: #3ae374; }

      .status {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: #9db5c6;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(255, 0, 0, 0.12);
        color: #ff7d7d;
      }

      .pill.online {
        background: rgba(58, 227, 116, 0.12);
        color: #7af7a5;
      }

      .sidebar {
        background: rgba(7, 20, 29, 0.92);
        border-right: 1px solid rgba(124, 181, 255, 0.2);
        padding: 18px 12px;
      }

      .menu-title {
        font-size: 11px;
        text-transform: uppercase;
        color: #89a8bf;
        letter-spacing: 0.12em;
        margin: 6px 8px 14px;
      }

      .sidebar button {
        width: 100%;
        margin-bottom: 10px;
        background: #102532;
        border: 1px solid rgba(124, 181, 255, 0.2);
        color: #d9ebff;
        padding: 10px 12px;
        text-align: left;
        border-radius: 8px;
        cursor: pointer;
      }

      .sidebar button.active {
        background: #163d52;
        border-color: #59b6ff;
      }

      .content {
        display: grid;
        grid-template-columns: minmax(520px, 1.2fr) minmax(300px, 0.8fr);
        gap: 20px;
        padding: 20px;
        overflow: auto;
      }

      .panel {
        background: rgba(9, 25, 34, 0.95);
        border: 1px solid rgba(124, 181, 255, 0.2);
        border-radius: 14px;
        box-shadow: 0 0 24px rgba(16, 64, 100, 0.25);
      }

      .panel-header {
        border-bottom: 1px solid rgba(124, 181, 255, 0.15);
        padding: 16px 18px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #9fe1ff;
      }

      .form-panel {
        padding-bottom: 10px;
      }

      form {
        padding: 16px 18px 18px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(180px, 1fr));
        gap: 12px 16px;
      }

      .small-grid {
        grid-template-columns: repeat(2, minmax(160px, 1fr));
      }

      label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        color: #8eaec5;
      }

      input {
        background: #0c1b27;
        border: 1px solid rgba(124, 181, 255, 0.2);
        border-radius: 8px;
        padding: 10px 12px;
        color: #eaf6ff;
      }

      .subsection {
        margin-top: 18px;
      }

      .subsection h3 {
        margin: 0 0 10px;
        font-size: 13px;
        color: #9fe1ff;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .actions {
        display: flex;
        gap: 12px;
        margin-top: 20px;
      }

      button.primary, button.secondary {
        border: none;
        border-radius: 8px;
        padding: 10px 18px;
        font-weight: 700;
        cursor: pointer;
      }

      .primary {
        background: linear-gradient(135deg, #3ae374, #0ecb8d);
        color: #062116;
      }

      button:disabled {
        cursor: wait;
        opacity: 0.65;
      }

      .secondary {
        background: #102532;
        color: #d9ebff;
        border: 1px solid rgba(124, 181, 255, 0.2);
      }

      .quote-panel {
        padding-bottom: 12px;
      }

      .quote-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(120px, 1fr));
        gap: 14px;
        padding: 18px;
      }

      .quote-box {
        background: rgba(17, 33, 45, 0.9);
        border: 1px solid rgba(124, 181, 255, 0.15);
        border-radius: 12px;
        padding: 12px;
      }

      .quote-box.accent {
        background: rgba(13, 61, 69, 0.6);
        border-color: rgba(79, 227, 186, 0.4);
      }

      .label {
        display: block;
        font-size: 11px;
        color: #8eaec5;
        margin-bottom: 8px;
        text-transform: uppercase;
      }

      .quote-box strong {
        font-size: 18px;
      }

      .json-box {
        margin: 0 18px 18px;
        background: #07141d;
        border: 1px solid rgba(124, 181, 255, 0.15);
        border-radius: 12px;
        overflow: auto;
        max-height: 360px;
      }

      pre {
        margin: 0;
        padding: 14px;
        color: #a7f3c5;
        font-size: 12px;
        white-space: pre-wrap;
      }

      .error-message {
        margin: 14px 0 0;
        color: #ff9292;
        font-size: 12px;
      }

      .chart-box { margin: 0 18px 18px; padding: 14px; background: #0a1b25; border: 1px solid rgba(124, 181, 255, 0.15); border-radius: 12px; }
      .chart-heading { display: flex; justify-content: space-between; color: #9fe1ff; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
      .chart-heading span:last-child { color: #8eaec5; }
      svg { width: 100%; height: auto; margin-top: 10px; }
      .chart-axis { stroke: rgba(142, 174, 197, .35); stroke-width: 1; }
      .chart-line { fill: none; stroke: #3ae374; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
      .chart-point { fill: #9fe1ff; stroke: #07141d; stroke-width: 2; }
    `
  ]
})
export class AppComponent implements OnInit {
  apiOnline = false;
  isPricing = false;
  apiError = '';
  selectedProduct = 'EQTY_OPT';
  lastResponse: PriceResponse | null = null;
  marketFields: Array<{ key: string; label: string; type?: string }> = [];
  instrumentFields: Array<{ key: string; label: string; type?: string }> = [];

  form: FormGroup;

  constructor(private http: HttpClient, private fb: FormBuilder) {
    this.form = this.fb.group({
      request_id: ['REQ-1001'],
      security_id: ['AAPL US Equity'],
      security_name: ['AAPL US Equity'],
      product: ['EQTY_OPT'],
      curve_name: ['USD-SOFR'],
      market_data_source: ['BDP'],
      pricing_model: ['BLACK_SCHOLES'],
      underlying_spot: [100],
      risk_free_rate: [0.05],
      implied_volatility: [0.2],
      dividend_yield: [0.01],
      strike: [100],
      maturity_years: [1],
      option_type: ['CALL'],
      exercise_style: ['EUROPEAN']
      ,face_value: [100], coupon_rate: [0.04], coupon_frequency: [2], yield_to_maturity: [0.035]
      ,forecast_dividend: [2], growth_rate: [0.03], discount_rate: [0.05]
      ,tenors: [[1, 2, 3, 5, 7, 10]], discount_curve_rates: [[0.018, 0.022, 0.025, 0.029, 0.031, 0.033]], frequency: [2]
      ,notional: [1000000], fixed_rate: [0.03], payment_frequency: [2], receiver: [true]
      ,spread: [0.015], recovery_rate: [0.4]
      ,spot: [1.08], domestic_rate: [0.05], foreign_rate: [0.02], pair: ['EURUSD']
    });
  }

  ngOnInit(): void {
    this.applyFormForProduct(this.selectedProduct);
    this.checkApi();
  }

  get selectedProductLabel(): string {
    return {
      EQTY_OPT: 'Equity Option',
      IRS: 'Interest Rate Swap',
      CDS: 'Credit Default Swap',
      FXC: 'FX Forward'
      ,BOND: 'Fixed Income Bond', EQUITY: 'Equity'
    }[this.selectedProduct] || 'Instrument';
  }

  selectProduct(product: string): void {
    this.selectedProduct = product;
    this.applyFormForProduct(product);
  }

  applyFormForProduct(product: string): void {
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
      this.form.patchValue({
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
      });
      this.marketFields = [
        { key: 'tenors', label: 'Tenors' },
        { key: 'discount_curve_rates', label: 'Discount Curve Rates' },
        { key: 'frequency', label: 'Frequency' }
      ];
      this.instrumentFields = [
        { key: 'notional', label: 'Notional' },
        { key: 'fixed_rate', label: 'Fixed Rate' },
        { key: 'maturity_years', label: 'Maturity (Y)' },
        { key: 'payment_frequency', label: 'Payment Freq.' },
        { key: 'receiver', label: 'Receiver', type: 'checkbox' }
      ];
      return;
    }

    if (product === 'CDS') {
      this.form.patchValue({
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
      });
      this.marketFields = [
        { key: 'tenors', label: 'Tenors' },
        { key: 'discount_curve_rates', label: 'Discount Curve Rates' },
        { key: 'frequency', label: 'Frequency' }
      ];
      this.instrumentFields = [
        { key: 'notional', label: 'Notional' },
        { key: 'spread', label: 'Spread' },
        { key: 'maturity_years', label: 'Maturity (Y)' },
        { key: 'payment_frequency', label: 'Payment Freq.' },
        { key: 'recovery_rate', label: 'Recovery' }
      ];
      return;
    }

    if (product === 'FXC') {
      this.form.patchValue({
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
      });
      this.marketFields = [
        { key: 'spot', label: 'Spot' },
        { key: 'domestic_rate', label: 'Domestic Rate' },
        { key: 'foreign_rate', label: 'Foreign Rate' }
      ];
      this.instrumentFields = [
        { key: 'pair', label: 'Pair', type: 'text' },
        { key: 'maturity_years', label: 'Maturity (Y)' }
      ];
      return;
    }

    if (product === 'BOND') {
      this.form.patchValue({ ...base, security_id: 'US GOVT 5Y', security_name: 'US GOVT 5Y', product: 'BOND', market_data_source: 'Bloomberg', pricing_model: 'DISCOUNTED_CASH_FLOW', face_value: 100, coupon_rate: 0.04, coupon_frequency: 2, maturity_years: 5, yield_to_maturity: 0.035 });
      this.marketFields = [{ key: 'yield_to_maturity', label: 'Yield to Maturity' }];
      this.instrumentFields = [{ key: 'face_value', label: 'Face Value' }, { key: 'coupon_rate', label: 'Coupon Rate' }, { key: 'coupon_frequency', label: 'Coupon Freq.' }, { key: 'maturity_years', label: 'Maturity (Y)' }];
      return;
    }

    if (product === 'EQUITY') {
      this.form.patchValue({ ...base, security_id: 'AAPL US Equity', security_name: 'AAPL US Equity', product: 'EQUITY', market_data_source: 'Bloomberg', pricing_model: 'DISCOUNTED_CASH_FLOW', forecast_dividend: 2, growth_rate: 0.03, underlying_spot: 100, discount_rate: 0.05 });
      this.marketFields = [{ key: 'underlying_spot', label: 'Underlying Spot' }, { key: 'discount_rate', label: 'Discount Rate' }];
      this.instrumentFields = [{ key: 'forecast_dividend', label: 'Forecast Dividend' }, { key: 'growth_rate', label: 'Growth Rate' }];
      return;
    }

    this.form.patchValue({
      ...base,
      underlying_spot: 100,
      risk_free_rate: 0.05,
      implied_volatility: 0.2,
      dividend_yield: 0.01,
      strike: 100,
      maturity_years: 1,
      option_type: 'CALL',
      exercise_style: 'EUROPEAN'
    });
    this.marketFields = [
      { key: 'underlying_spot', label: 'Underlying Spot' },
      { key: 'risk_free_rate', label: 'Risk-Free Rate' },
      { key: 'implied_volatility', label: 'Volatility' },
      { key: 'dividend_yield', label: 'Dividend Yield' }
    ];
    this.instrumentFields = [
      { key: 'strike', label: 'Strike' },
      { key: 'maturity_years', label: 'Maturity (Y)' },
      { key: 'option_type', label: 'Option Type', type: 'text' },
      { key: 'exercise_style', label: 'Exercise Style', type: 'text' }
    ];
  }

  checkApi(): void {
    this.http.get<{ status?: string }>('/api/health').subscribe({
      next: () => this.apiOnline = true,
      error: () => this.apiOnline = false
    });
  }

  submitRequest(): void {
    const payload = this.buildPayload();
    const url = this.urlForProduct(this.selectedProduct);
    this.isPricing = true;
    this.apiError = '';

    this.http.post<PriceResponse>(url, payload).subscribe({
      next: (response) => {
        this.lastResponse = response;
        this.apiOnline = true;
        this.isPricing = false;
      },
      error: () => {
        this.apiOnline = false;
        this.isPricing = false;
        this.apiError = 'Pricing API unavailable. Start the Spring Boot service on port 9092.';
      }
    });
  }

  buildPayload(): Record<string, unknown> {
    const values = this.form.getRawValue();

    const base = {
      request_id: values.request_id,
      security_id: values.security_id,
      security_name: values.security_name,
      product: this.selectedProduct,
      curve_name: values.curve_name,
      market_data_source: values.market_data_source,
      pricing_model: values.pricing_model
    };

    if (this.selectedProduct === 'EQTY_OPT') {
      return {
        ...base,
        market_data: {
          underlying_spot: Number(values.underlying_spot),
          risk_free_rate: Number(values.risk_free_rate),
          implied_volatility: Number(values.implied_volatility),
          dividend_yield: Number(values.dividend_yield)
        },
        instrument: {
          strike: Number(values.strike),
          maturity_years: Number(values.maturity_years),
          option_type: values.option_type,
          exercise_style: values.exercise_style
        }
      };
    }

    if (this.selectedProduct === 'IRS') {
      return {
        ...base,
        market_data: {
          tenors: values.tenors,
          discount_curve_rates: values.discount_curve_rates,
          frequency: Number(values.frequency)
        },
        instrument: {
          notional: Number(values.notional),
          fixed_rate: Number(values.fixed_rate),
          maturity_years: Number(values.maturity_years),
          payment_frequency: Number(values.payment_frequency),
          receiver: Boolean(values.receiver)
        }
      };
    }

    if (this.selectedProduct === 'CDS') {
      return {
        ...base,
        market_data: {
          tenors: values.tenors,
          discount_curve_rates: values.discount_curve_rates,
          frequency: Number(values.frequency)
        },
        instrument: {
          notional: Number(values.notional),
          spread: Number(values.spread),
          maturity_years: Number(values.maturity_years),
          payment_frequency: Number(values.payment_frequency),
          recovery_rate: Number(values.recovery_rate)
        }
      };
    }

    if (this.selectedProduct === 'BOND') {
      return { model: values.pricing_model, face_value: Number(values.face_value), coupon_rate: Number(values.coupon_rate), coupon_frequency: Number(values.coupon_frequency), maturity_years: Number(values.maturity_years), yield_to_maturity: Number(values.yield_to_maturity) };
    }

    if (this.selectedProduct === 'EQUITY') {
      return { model: values.pricing_model, forecast_dividend: Number(values.forecast_dividend), growth_rate: Number(values.growth_rate), underlying_spot: Number(values.underlying_spot), discount_rate: Number(values.discount_rate) };
    }

    return {
      ...base,
      market_data: {
        spot: Number(values.spot),
        domestic_rate: Number(values.domestic_rate),
        foreign_rate: Number(values.foreign_rate)
      },
      instrument: {
        pair: values.pair,
        maturity_years: Number(values.maturity_years)
      }
    };
  }

  urlForProduct(product: string): string {
    const map: Record<string, string> = {
      EQTY_OPT: '/api/v1/blp/pricing/equity-option',
      IRS: '/api/v1/blp/pricing/irs',
      CDS: '/api/v1/blp/pricing/cds',
      FXC: '/api/v1/blp/pricing/fx-forward'
      ,BOND: '/api/v1/blp/pricing/fixed-income-bond'
      ,EQUITY: '/api/v1/blp/pricing/equity'
    };
    return map[product] || '/api/v1/blp/pricing/equity-option';
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

  resetForm(): void {
    this.applyFormForProduct(this.selectedProduct);
    this.lastResponse = null;
    this.apiError = '';
  }

  get chartTitle(): string {
    return this.selectedProduct === 'IRS' || this.selectedProduct === 'CDS' ? 'Curve monitor' : 'Sensitivity monitor';
  }

  get chartUnit(): string {
    return this.selectedProduct === 'FXC' ? 'Forward points' : this.selectedProduct === 'IRS' || this.selectedProduct === 'CDS' ? 'Rate' : 'Value';
  }

  get chartPoints(): Array<{ cx: number; cy: number }> {
    const values = this.form.getRawValue();
    let series: number[];
    if (this.selectedProduct === 'IRS' || this.selectedProduct === 'CDS') series = Array.from(values.discount_curve_rates || [], Number);
    else if (this.selectedProduct === 'FXC') series = [Number(values.spot), Number(values.spot) * (1 + (Number(values.domestic_rate) - Number(values.foreign_rate)) * Number(values.maturity_years))];
    else if (this.selectedProduct === 'EQTY_OPT') series = [80, 90, 100, 110, 120].map(spot => Math.max(spot - Number(values.strike), 0));
    else if (this.selectedProduct === 'BOND') series = [0, 1, 2, 3, 4, 5].map(year => Number(values.face_value) * Math.pow(1 + Number(values.yield_to_maturity), -year));
    else series = [Number(values.forecast_dividend), Number(values.forecast_dividend) * 1.1, Number(values.forecast_dividend) * 1.2, Number(values.forecast_dividend) * 1.3];
    series = series.filter(Number.isFinite);
    if (!series.length) return [];
    const min = Math.min(...series), max = Math.max(...series), spread = max - min || 1;
    return series.map((value, index) => ({ cx: 42 + index * (458 / Math.max(series.length - 1, 1)), cy: 145 - ((value - min) / spread) * 115 }));
  }

  get chartPolyline(): string {
    return this.chartPoints.map(point => `${point.cx},${point.cy}`).join(' ');
  }
}
