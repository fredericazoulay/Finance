import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ThemeName, ThemeService } from '../../services/theme.service';
import { PricingService } from '../../services/pricing.service';
import { WorkGroupService } from '../../services/work-group.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.scss']
})
export class TopbarComponent implements OnInit {
  language = 'en';
  login = 'user1';
  environment: 'PROD' | 'PREX1' | 'REC1' | 'INT1' = 'PROD';
  constructor(
    readonly themeService: ThemeService,
    readonly pricingService: PricingService,
    readonly workGroupService: WorkGroupService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    try {
      const storedLang = localStorage.getItem('language');
      if (storedLang) {
        this.language = storedLang.toLowerCase();
      }
      const storedLogin = localStorage.getItem('login');
      if (storedLogin === 'user1' || storedLogin === 'user2') {
        this.login = storedLogin;
      }
    } catch (e) {
      // log the error for diagnostics
      // eslint-disable-next-line no-console
      console.debug('[TopbarComponent] error reading persisted language', e);
    }
  }

  setTheme(theme: ThemeName): void {
    this.themeService.setTheme(theme);
  }

  setEnvironment(environment: string): void {
    if (environment === 'PROD' || environment === 'PREX1' || environment === 'REC1' || environment === 'INT1') {
      this.environment = environment;
    }
  }

  setLogin(login: string): void {
    if (login !== 'user1' && login !== 'user2') return;
    this.login = login;
    try {
      localStorage.setItem('login', login);
    } catch (e) {}
  }

  setLanguage(lang: string): void {
    this.language = lang.toLowerCase();
    try {
      localStorage.setItem('language', this.language);
    } catch (e) {}
    this.translate.use(this.language);
  }
}
