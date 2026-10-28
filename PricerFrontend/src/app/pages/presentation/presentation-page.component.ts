import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PricingService } from '../../services/pricing.service';

@Component({
  selector: 'app-presentation-page',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule],
  templateUrl: './presentation-page.component.html',
  styleUrls: ['./presentation-page.component.scss']
})
export class PresentationPageComponent {
  readonly instruments = [
    { code: 'EQTY_OPT', icon: '◈', descriptionKey: 'presentation_option_description' },
    { code: 'IRS', icon: '↔', descriptionKey: 'presentation_irs_description' },
    { code: 'CDS', icon: '◇', descriptionKey: 'presentation_cds_description' },
    { code: 'FXC', icon: '⇄', descriptionKey: 'presentation_fxc_description' },
    { code: 'BOND', icon: '▤', descriptionKey: 'presentation_bond_description' },
    { code: 'EQUITY', icon: '▥', descriptionKey: 'presentation_equity_description' }
  ];

  constructor(readonly pricingService: PricingService) {}
}