import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PricingService } from '../../services/pricing.service';
import { ThemeName, ThemeService } from '../../services/theme.service';

const THEME_ARTWORK_OVERRIDES: Partial<Record<ThemeName, string>> = {
  COMPAGNY_CDC_GROUP: '/assets/Compagny_CDC_Groupe.jpg',
  COMPAGNY_CDC_INFORMATIQUE: '/assets/Compagny_CDC_Informatique.jpg',
  'DC-COMICS_SUPERMAN': '/assets/DC-Comics-Superman.jpg',
  MARVEL_IRONMAN: '/assets/Marvel_Ironman.jpg',
  MARVEL_HULK: '/assets/Marvel_Hulk.jpg'
};

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

  constructor(readonly pricingService: PricingService, readonly themeService: ThemeService) {}

  get selectedThemeArtwork(): string {
    const theme = this.themeService.theme;
    return THEME_ARTWORK_OVERRIDES[theme]
      ?? `/assets/theme-${theme.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webp`;
  }

  get selectedThemeLabel(): string {
    return this.themeService.theme.replace(/[_-]+/g, ' ');
  }
}