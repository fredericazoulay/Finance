import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ThemeName = 'DARK' | 'LIGHT' | 'RAINBOW' | 'NEON' | 'POP' | 'BLOOMBERG';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly _isLightTheme$ = new BehaviorSubject<boolean>(false);
  readonly isLightTheme$ = this._isLightTheme$.asObservable();
  private _theme: ThemeName = 'DARK';

  constructor() {
    this.initTheme();
  }

  get isLightTheme(): boolean {
    return this._isLightTheme$.value;
  }

  get theme(): ThemeName {
    return this._theme;
  }

  setTheme(theme: ThemeName | boolean): void {
    let selectedTheme: ThemeName;
    if (typeof theme === 'boolean') {
      selectedTheme = theme ? 'LIGHT' : 'DARK';
    } else {
      selectedTheme = theme;
    }
    const isLight = selectedTheme === 'LIGHT';
    this._theme = selectedTheme;
    this._isLightTheme$.next(isLight);
    try {
      localStorage.setItem('theme', selectedTheme);
    } catch (e) {
      // Log storage errors rather than silently ignoring them so SonarQube rule S2486 is satisfied
      // eslint-disable-next-line no-console
      console.debug('[ThemeService] error persisting theme', e);
    }
    this.applyThemeToBody(selectedTheme);
  }

  toggleTheme(): void {
    this.setTheme(!this.isLightTheme);
  }

  private initTheme(): void {
    let selectedTheme: ThemeName = 'DARK';
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'LIGHT' || stored === 'DARK' || stored === 'RAINBOW' || stored === 'NEON' || stored === 'POP' || stored === 'BLOOMBERG') {
        selectedTheme = stored;
      } else if (typeof window !== 'undefined' && window.matchMedia) {
        selectedTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'LIGHT' : 'DARK';
      }
    } catch (e) {
      // Log storage access error for diagnostics
      // eslint-disable-next-line no-console
      console.debug('[ThemeService] initTheme error reading localStorage', e);
    }
    this._theme = selectedTheme;
    this._isLightTheme$.next(selectedTheme === 'LIGHT');
    this.applyThemeToBody(selectedTheme);
  }

  private applyThemeToBody(theme: ThemeName): void {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.remove('dark-theme', 'light-theme', 'rainbow-theme', 'neon-theme', 'pop-theme', 'bloomberg-theme');
    document.body.classList.add(`${theme.toLowerCase()}-theme`);
  }
}
