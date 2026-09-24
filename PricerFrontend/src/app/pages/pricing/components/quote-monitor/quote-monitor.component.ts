import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { PriceResponse } from '../../../../models/pricing.model';
import { PricingService } from '../../../../services/pricing.service';

@Component({
  selector: 'app-quote-monitor',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './quote-monitor.component.html',
  styleUrls: ['./quote-monitor.component.scss']
})
export class QuoteMonitorComponent {
  @Input() lastResponse: PriceResponse | null = null;
  @Input() isPricing = false;
  @Input() apiError = '';

  activeTab: 'quote' | 'json' = 'quote';

  constructor(private readonly pricingService: PricingService) {}

  formatResultValue(result: PriceResponse | Record<string, unknown> | null | undefined): string {
    return this.pricingService.formatResultValue(result);
  }

  setTab(tab: 'quote' | 'json'): void {
    this.activeTab = tab;
  }
}
