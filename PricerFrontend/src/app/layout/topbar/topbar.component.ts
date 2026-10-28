import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ThemeName, ThemeService } from '../../services/theme.service';
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
  login = 'user1';
  environment: 'PROD' | 'PREX1' | 'REC1' | 'INT1' = 'PROD';
  group: 'BO' | 'CONFIG' | 'FO' | 'MO' | 'MLC' | 'MOA' | 'COLLATERAL' | 'CONTRL-INT' | 'CONTROL' | 'DEOFIP' | 'DFFE' | 'DFI' | 'DFINB2' | 'DFINB3' | 'DFINF' | 'DPFGPA-DR' | 'DPFGPA-WI' | 'DPFGPTAUX' | 'DPFIDS-DR' | 'DPFIDS-WI' | 'HOUSEKEEP' | 'INTERMED' | 'LICADMIN' | 'MOASUPP_BO' | 'MOASUPP_FO' | 'MOASUPP_MO' | 'MOA_CONFIG' = 'CONFIG';

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

  setGroup(group: string): void {
    this.group = group;
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
