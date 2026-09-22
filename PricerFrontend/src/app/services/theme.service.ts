import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly _isLightTheme$ = new BehaviorSubject<boolean>(false);
  readonly isLightTheme$ = this._isLightTheme$.asObservable();

  constructor() {
    this.initTheme();
  }

  get isLightTheme(): boolean {
    return this._isLightTheme$.value;
  }

  setTheme(isLight: boolean): void {
    this._isLightTheme$.next(isLight);
    try {
      localStorage.setItem('theme', isLight ? 'LIGHT' : 'DARK');
    } catch (e) {
      // Log storage errors rather than silently ignoring them so SonarQube rule S2486 is satisfied
      // eslint-disable-next-line no-console
      console.debug('[ThemeService] error persisting theme', e);
    }
    this.applyThemeToBody(isLight);
  }

  toggleTheme(): void {
    this.setTheme(!this.isLightTheme);
  }

  private initTheme(): void {
    let isLight = false;
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'LIGHT' || stored === 'DARK') {
        isLight = stored === 'LIGHT';
      } else if (typeof window !== 'undefined' && window.matchMedia) {
        isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      }
    } catch (e) {
      // Log storage access error for diagnostics
      // eslint-disable-next-line no-console
      console.debug('[ThemeService] initTheme error reading localStorage', e);
    }
    this._isLightTheme$.next(isLight);
    this.applyThemeToBody(isLight);
  }

  private applyThemeToBody(isLight: boolean): void {
    if (typeof document === 'undefined' || !document.body) return;
    if (isLight) {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    } else {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    }
  }
}
