import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ThemeService } from '../../services/theme.service';
import { PricingService } from '../../services/pricing.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.scss']
})
export class TopbarComponent implements OnInit {
  language = 'en';

  constructor(
    readonly themeService: ThemeService,
    readonly pricingService: PricingService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    try {
      const storedLang = localStorage.getItem('language');
      if (storedLang) {
        this.language = storedLang.toLowerCase();
      }
    } catch (e) {
      // log the error for diagnostics
      // eslint-disable-next-line no-console
      console.debug('[TopbarComponent] error reading persisted language', e);
    }
  }

  setTheme(isLight: boolean): void {
    this.themeService.setTheme(isLight);
  }

  setLanguage(lang: string): void {
    this.language = lang.toLowerCase();
    try {
      localStorage.setItem('language', this.language);
    } catch (e) {}
    this.translate.use(this.language);
  }
}
