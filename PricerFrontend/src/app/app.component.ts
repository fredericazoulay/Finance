import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostBinding, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ThemeService } from './services/theme.service';
import { TopbarComponent } from './layout/topbar/topbar.component';
import { SidebarComponent } from './layout/sidebar/sidebar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    TopbarComponent,
    SidebarComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  @HostBinding('class.light-theme')
  get isLightTheme(): boolean {
    return this.themeService.isLightTheme;
  }

  constructor(
    readonly themeService: ThemeService,
    private readonly translate: TranslateService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    let language = 'en';
    try {
      const storedLang = localStorage.getItem('language');
      if (storedLang === 'en' || storedLang === 'fr') {
        language = storedLang;
      }
    } catch (e) {}

    this.translate.addLangs(['en', 'fr']);
    this.translate.setDefaultLang('en');
    this.translate.use(language);

    try {
      this.translate.onLangChange.subscribe(() => this.cdr.detectChanges());
      this.translate.onTranslationChange.subscribe(() => this.cdr.detectChanges());
    } catch (e) {}
  }
}
