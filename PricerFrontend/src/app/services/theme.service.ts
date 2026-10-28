import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const STANDARD_THEME_NAMES = ['DARK', 'LIGHT', 'RAINBOW', 'NEON', 'POP', 'BLOOMBERG'] as const;

export const THEME_NAMES = [
  ...STANDARD_THEME_NAMES,
  'COMPAGNY_MUREX', 'COMPAGNY_MISTRAL_AI', 'COMPAGNY_CDC_GROUP', 'COMPAGNY_CDC_INFORMATIQUE',
  'DC-COMICS_BATMAN', 'DC-COMICS_SUPERMAN', 'DC-COMICS_FLASH', 'DC-COMICS_GREENLANTERN', 'DC-COMICS_AQUAMAN',
  'DC-COMICS_CYBORG', 'DC-COMICS_SHAZAM', 'DC-COMICS_GREENARROW', 'DC-COMICS_BLACKADAM', 'DC-COMICS_CHAOS',
  'DC-COMICS_BATGIRL', 'DC-COMICS_ROBIN', 'DC-COMICS_NIGHTWING', 'DC-COMICS_WONDERWOMAN',
  'MARVEL_IRONMAN', 'MARVEL_CAPTAINAMERICA', 'MARVEL_THOR', 'MARVEL_HULK', 'MARVEL_BLACKWIDOW',
  'MARVEL_HAWKEYE', 'MARVEL_SCARLETWITCH', 'MARVELVISION', 'MARVELBLACKPANTHER', 'MARVELANTMAN', 'MARVELWASP',
  'MARVELFALCON', 'MARVELWINTERSOLDIER', 'MARVELDOCTORSTRANGE', 'MARVELSPIDERMAN',
  'CYBERPUNK', 'FUTURISTIC', 'RETRO', 'VINTAGE', 'MINIMAL', 'DYSTOPIAN', 'STEAMPUNK', 'SOLARIZED', 'MONOKAI',
  'GRUVBOX', 'DRACULA', 'ATOM', 'BLINK', 'SOLID', 'GLASS', 'WOOD', 'MARBLE', 'CONCRETE', 'BRUTALIST',
  'FANTASY', 'CYBERGOTH', 'VAPORWAVE', 'RETROFUTURE', 'RETROWAVE', 'SYNTHWAVE', 'LOFI', 'CHROMATIC',
  'PRISMATIC', 'HOLOGRAPHIC', 'NEBULA', 'GALAXY', 'UNIVERSE', 'MULTIVERSE', 'OMNIVERSE', 'METAVERSE',
  'ARCADE', 'PIXEL', '8BIT', '16BIT', '32BIT', '64BIT', '128BIT'
] as const;

export type ThemeName = typeof THEME_NAMES[number];
type StandardThemeName = typeof STANDARD_THEME_NAMES[number];
type CustomThemeName = Exclude<ThemeName, StandardThemeName>;

const CUSTOM_THEME_ACCENTS: Record<CustomThemeName, string> = {
  COMPAGNY_MUREX: '#3bc3c8',
  COMPAGNY_MISTRAL_AI: '#f07852',
  COMPAGNY_CDC_GROUP: '#df5c42',
  COMPAGNY_CDC_INFORMATIQUE: '#57b78c',
  'DC-COMICS_BATMAN': '#f3c64e',
  'DC-COMICS_SUPERMAN': '#4388ef',
  'DC-COMICS_FLASH': '#f2574b',
  'DC-COMICS_GREENLANTERN': '#59d66c',
  'DC-COMICS_AQUAMAN': '#35c5c6',
  'DC-COMICS_CYBORG': '#46a9ee',
  'DC-COMICS_SHAZAM': '#f1b83d',
  'DC-COMICS_GREENARROW': '#8ebc4b',
  'DC-COMICS_BLACKADAM': '#d6a838',
  'DC-COMICS_CHAOS': '#dc62ca',
  'DC-COMICS_BATGIRL': '#ef70b1',
  'DC-COMICS_ROBIN': '#ee5f53',
  'DC-COMICS_NIGHTWING': '#438ee8',
  'DC-COMICS_WONDERWOMAN': '#dc5d64',
  MARVEL_IRONMAN: '#e65f4d',
  MARVEL_CAPTAINAMERICA: '#528ee8',
  MARVEL_THOR: '#78a8e8',
  MARVEL_HULK: '#69c65a',
  MARVEL_BLACKWIDOW: '#d95658',
  MARVEL_HAWKEYE: '#9b76d1',
  MARVEL_SCARLETWITCH: '#dd5c72',
  MARVELVISION: '#5ac1a1',
  MARVELBLACKPANTHER: '#a184d6',
  MARVELANTMAN: '#d8584f',
  MARVELWASP: '#e8c34b',
  MARVELFALCON: '#5b9dde',
  MARVELWINTERSOLDIER: '#8298b0',
  MARVELDOCTORSTRANGE: '#db744d',
  MARVELSPIDERMAN: '#ef5149',
  CYBERPUNK: '#f05bd5',
  FUTURISTIC: '#54c8e8',
  RETRO: '#e9a44e',
  VINTAGE: '#c69a62',
  MINIMAL: '#b8c2c8',
  DYSTOPIAN: '#c96c53',
  STEAMPUNK: '#c58a4b',
  SOLARIZED: '#2aa198',
  MONOKAI: '#a6d94d',
  GRUVBOX: '#fabd2f',
  DRACULA: '#bd93f9',
  ATOM: '#61afef',
  BLINK: '#f0d95c',
  SOLID: '#ed6a52',
  GLASS: '#71c9da',
  WOOD: '#d09a62',
  MARBLE: '#b5c7d2',
  CONCRETE: '#a9b0b4',
  BRUTALIST: '#f1d34e',
  FANTASY: '#b987ec',
  CYBERGOTH: '#e14f9c',
  VAPORWAVE: '#ee78d1',
  RETROFUTURE: '#f5a94f',
  RETROWAVE: '#ed6a8b',
  SYNTHWAVE: '#c273ef',
  LOFI: '#88b68d',
  CHROMATIC: '#f16e62',
  PRISMATIC: '#74c9b0',
  HOLOGRAPHIC: '#73cde8',
  NEBULA: '#ad82e6',
  GALAXY: '#7989ed',
  UNIVERSE: '#69a9df',
  MULTIVERSE: '#d982ca',
  OMNIVERSE: '#e08b62',
  METAVERSE: '#65c9c4',
  ARCADE: '#f35e52',
  PIXEL: '#6ed681',
  '8BIT': '#ffd64f',
  '16BIT': '#53c6cf',
  '32BIT': '#f07852',
  '64BIT': '#a77ce5',
  '128BIT': '#76c78b'
};

const CUSTOM_THEME_SURFACES: Partial<Record<CustomThemeName, { page: string; surface: string; raised: string }>> = {
  VINTAGE: { page: '#1b1815', surface: '#26211b', raised: '#342b21' },
  SOLARIZED: { page: '#002b36', surface: '#073642', raised: '#164b55' },
  GRUVBOX: { page: '#1d2021', surface: '#282828', raised: '#3c3836' },
  GLASS: { page: '#10191d', surface: 'rgba(32, 48, 54, 0.88)', raised: 'rgba(255, 255, 255, 0.08)' },
  WOOD: { page: '#1a1511', surface: '#261d16', raised: '#35271c' },
  MARBLE: { page: '#191c20', surface: '#23272b', raised: '#30363a' },
  CONCRETE: { page: '#1c1d1e', surface: '#27292a', raised: '#36393a' },
  LOFI: { page: '#171914', surface: '#20231c', raised: '#303329' }
};

const THEME_STYLE_PROPERTIES = [
  '--bg', '--panel', '--panel-2', '--text', '--muted', '--accent', '--ui-page', '--ui-surface', '--ui-raised',
  '--ui-field', '--ui-text', '--ui-muted', '--ui-border', '--ui-accent', '--ui-accent-soft', '--ui-action-ink'
];

function isThemeName(value: string): value is ThemeName {
  return (THEME_NAMES as readonly string[]).includes(value);
}

function themeClassName(theme: ThemeName): string {
  if ((STANDARD_THEME_NAMES as readonly string[]).includes(theme)) return `${theme.toLowerCase()}-theme`;
  return `theme-${theme.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

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
    if (typeof theme === 'string' && !isThemeName(theme)) return;
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
      if (stored && isThemeName(stored)) {
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
    const body = document.body;
    body.classList.remove(...THEME_NAMES.map(themeClassName), 'custom-theme');
    THEME_STYLE_PROPERTIES.forEach(property => body.style.removeProperty(property));
    body.classList.add(themeClassName(theme));

    if ((STANDARD_THEME_NAMES as readonly string[]).includes(theme)) return;

    body.classList.add('custom-theme');
    const accent = CUSTOM_THEME_ACCENTS[theme as CustomThemeName];
    const surfaces = CUSTOM_THEME_SURFACES[theme as CustomThemeName] ?? {
      page: '#141414',
      surface: '#1d1d1d',
      raised: '#2a2a2a'
    };
    const palette: Record<string, string> = {
      '--bg': surfaces.page,
      '--panel': surfaces.surface,
      '--panel-2': surfaces.raised,
      '--text': '#f2f2f2',
      '--muted': '#b3b3b3',
      '--accent': accent,
      '--ui-page': surfaces.page,
      '--ui-surface': surfaces.surface,
      '--ui-raised': surfaces.raised,
      '--ui-field': '#111111',
      '--ui-text': '#f2f2f2',
      '--ui-muted': '#b3b3b3',
      '--ui-border': `color-mix(in srgb, ${accent} 26%, #454545)`,
      '--ui-accent': accent,
      '--ui-accent-soft': `color-mix(in srgb, ${accent} 14%, transparent)`,
      '--ui-action-ink': '#111111'
    };
    Object.entries(palette).forEach(([property, value]) => body.style.setProperty(property, value));
  }
}
