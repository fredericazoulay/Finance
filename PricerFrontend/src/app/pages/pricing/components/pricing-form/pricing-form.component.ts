import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { FieldConfig, ProductOption } from '../../../../models/pricing.model';
import { YahooSecurity } from '../../../../models/security.model';
import { PricingService } from '../../../../services/pricing.service';
import { SecuritiesService } from '../../../../services/securities.service';

@Component({
  selector: 'app-pricing-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  templateUrl: './pricing-form.component.html',
  styleUrls: ['./pricing-form.component.scss']
})
export class PricingFormComponent implements OnChanges {
  @Input({ required: true }) product!: string;
  @Input({ required: true }) form!: FormGroup;
  @Input() isPricing = false;
  @Input() apiError = '';

  @Output() productChange = new EventEmitter<string>();
  @Output() priceSubmit = new EventEmitter<void>();
  @Output() formReset = new EventEmitter<void>();

  marketFields: FieldConfig[] = [];
  instrumentFields: FieldConfig[] = [];
  productOptions: ProductOption[] = [];
  pricingModelOptions: string[] = [];
  securityOptions: string[] = [];

  isSearchingSecurities = false;
  securityResults: YahooSecurity[] = [];
  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly pricingService: PricingService,
    private readonly securitiesService: SecuritiesService
  ) {
    this.productOptions = this.pricingService.productOptions;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product']) {
      this.refreshProductConfig();
    }
  }

  private refreshProductConfig(): void {
    const fields = this.pricingService.getProductFields(this.product);
    this.marketFields = fields.marketFields;
    this.instrumentFields = fields.instrumentFields;
    this.pricingModelOptions = this.pricingService.getPricingModelOptions(this.product);
    this.securityOptions = this.pricingService.getSecurityOptions(this.product);
    this.securityResults = [];
  }

  onProductSelect(newProduct: string): void {
    if (newProduct && newProduct !== this.product) {
      this.productChange.emit(newProduct);
    }
  }

  securityQueryChanged(query: string): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (!query.trim()) {
      this.securityResults = [];
      return;
    }
    this.searchTimer = setTimeout(() => this.searchSecurities(query), 400);
  }

  searchSecurities(query = String(this.form.get('security_id')?.value || '')): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    query = query.trim();
    if (!query) return;

    this.isSearchingSecurities = true;
    this.securitiesService.search(query).subscribe({
      next: (quotes) => {
        this.securityResults = quotes;
        this.isSearchingSecurities = false;
        if (quotes.length > 0) {
          const normalized = query.toUpperCase();
          const selected = quotes.find(item => item.symbol.toUpperCase() === normalized)
            || quotes.find(item => item.symbol.toUpperCase().startsWith(normalized))
            || quotes[0];
          this.selectSecurity(selected.symbol);
        }
      },
      error: () => {
        this.isSearchingSecurities = false;
      }
    });
  }

  selectSecurity(symbol: string): void {
    const security = this.securityResults.find(item => item.symbol === symbol);
    if (security) {
      this.form.patchValue({
        security_id: security.symbol,
        security_name: security.longname || security.shortname || security.symbol
      });
    }
  }

  // Quick actions for Options
  alignStrikeAtm(): void {
    const spot = this.form.get('underlying_spot')?.value;
    if (spot != null) {
      this.form.patchValue({ strike: Number(spot) });
    }
  }

  adjustVolatility(delta: number): void {
    const current = Number(this.form.get('implied_volatility')?.value || 0.2);
    const updated = Math.max(0.01, Number((current + delta).toFixed(4)));
    this.form.patchValue({ implied_volatility: updated });
  }

  getFieldSuffix(key: string): string {
    const map: Record<string, string> = {
      underlying_spot: '$',
      strike: '$',
      face_value: '$',
      spot: '$',
      risk_free_rate: '%',
      implied_volatility: '%',
      dividend_yield: '%',
      coupon_rate: '%',
      yield_to_maturity: '%',
      fixed_rate: '%',
      spread: 'bps',
      recovery_rate: '%',
      domestic_rate: '%',
      foreign_rate: '%',
      growth_rate: '%',
      discount_rate: '%',
      maturity_years: 'Y'
    };
    return map[key] || '';
  }

  onSubmit(): void {
    this.priceSubmit.emit();
  }

  onReset(): void {
    this.formReset.emit();
  }
}
