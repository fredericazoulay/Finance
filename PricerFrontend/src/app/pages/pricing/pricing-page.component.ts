import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, TimeoutError } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PriceResponse } from '../../models/pricing.model';
import { PricingService } from '../../services/pricing.service';
import { PricingFormComponent } from './components/pricing-form/pricing-form.component';
import { QuoteMonitorComponent } from './components/quote-monitor/quote-monitor.component';
import { FinancialChartComponent } from './components/financial-chart/financial-chart.component';

@Component({
  selector: 'app-pricing-page',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PricingFormComponent,
    QuoteMonitorComponent,
    FinancialChartComponent
  ],
  templateUrl: './pricing-page.component.html',
  styleUrls: ['./pricing-page.component.scss']
})
export class PricingPageComponent implements OnInit, OnDestroy {
  selectedProduct = 'EQTY_OPT';
  isPricing = false;
  apiError = '';
  lastResponse: PriceResponse | null = null;
  readonly form: FormGroup;

  private routeSub?: Subscription;

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
    private readonly translate: TranslateService,
    private readonly pricingService: PricingService
  ) {
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
      exercise_style: ['EUROPEAN'],
      face_value: [100],
      coupon_rate: [0.04],
      coupon_frequency: [2],
      yield_to_maturity: [0.035],
      forecast_dividend: [2],
      growth_rate: [0.03],
      discount_rate: [0.05],
      tenors: [[1, 2, 3, 5, 7, 10]],
      discount_curve_rates: [[0.018, 0.022, 0.025, 0.029, 0.031, 0.033]],
      frequency: [2],
      notional: [1000000],
      fixed_rate: [0.03],
      payment_frequency: [2],
      receiver: [true],
      spread: [0.015],
      recovery_rate: [0.4],
      spot: [1.08],
      domestic_rate: [0.05],
      foreign_rate: [0.02],
      pair: ['EURUSD']
    });
  }

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const product = params.get('product');
      if (product && this.pricingService.productOptions.some(p => p.code === product)) {
        this.selectedProduct = product;
      } else {
        this.selectedProduct = 'EQTY_OPT';
      }
      this.applyProduct(this.selectedProduct);
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  get selectedProductLabel(): string {
    const translated = this.translate.instant(this.selectedProduct);
    return translated && translated !== this.selectedProduct ? translated : this.translate.instant('instrument');
  }

  get formValues(): Record<string, any> {
    return this.form.getRawValue();
  }

  get lastPrice(): number | null {
    const p = this.lastResponse?.result?.['price'];
    return typeof p === 'number' ? p : null;
  }

  onProductChange(product: string): void {
    this.router.navigate(['/pricing', product]);
  }

  private applyProduct(product: string): void {
    this.lastResponse = null;
    this.apiError = '';
    const defaults = this.pricingService.getProductDefaults(product);
    this.form.patchValue(defaults);
  }

  submitRequest(): void {
    if (this.isPricing) return;

    this.isPricing = true;
    this.apiError = '';
    this.lastResponse = null;

    const payload = this.pricingService.buildPayload(this.selectedProduct, this.form.getRawValue());
    this.pricingService.submitPricing(this.selectedProduct, payload).subscribe({
      next: (response) => {
        // Normalize flat responses where pricing fields are at the root
        const resAny = response as any;
        const normalized: PriceResponse = { ...(response as PriceResponse) };

        if (resAny && typeof resAny['price'] === 'number') {
          normalized.result = {
            price: resAny['price'],
            currency: resAny['currency'],
            pricing_model: resAny['pricing_model']
          };
          // keep product if present at root
          if (!normalized.product && resAny['product']) normalized.product = resAny['product'];
        }

        if (!normalized.security_name) normalized.security_name = this.formValues['security_name'] || this.formValues['security_id'] || '';
        if (!normalized.response_status) normalized.response_status = 'SUCCESS';

        this.lastResponse = normalized;
        this.isPricing = false;
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.isPricing = false;
        const serverMessage = typeof error.error?.message === 'string' ? error.error.message : '';
        this.apiError = serverMessage || (error instanceof TimeoutError
          ? 'The pricing API did not respond within 15 seconds.'
          : 'Pricing API unavailable. Start the Spring Boot service on port 9092.');
        this.cdr.detectChanges();
      }
    });
  }

  resetForm(): void {
    this.applyProduct(this.selectedProduct);
  }
}
