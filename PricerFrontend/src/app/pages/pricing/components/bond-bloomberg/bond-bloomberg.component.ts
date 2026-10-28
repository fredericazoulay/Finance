import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

type BloombergScreen = 'SECF' | 'DES' | 'YAS' | 'DEBT';
type BloombergCouponType = 'Fixe' | 'Variable';

interface BloombergSecurity {
  securityId: string;
  issuer: string;
  couponRate: number | null;
  couponLabel?: string;
  couponType: BloombergCouponType;
  maturityLabel: string;
  yearsToMaturity: number | null;
  rating: string;
  currency: 'EUR' | 'GBP' | 'USD';
  price: number;
  source: string;
  yieldToMaturity?: number;
  spreadBps?: number;
  isin?: string;
  figi?: string;
  seniority?: string;
  couponFrequency?: string;
  dayCount?: string;
  issuePrice?: number;
  series?: string;
  market?: string;
  nominalAmount?: string;
  ratingMoody?: string;
  ratingSp?: string;
  ratingFitch?: string;
  modifiedDuration?: number;
  duration?: number;
  convexity?: number;
  dv01?: number;
  oas?: number;
  benchmark?: string;
}

@Component({
  selector: 'app-bond-bloomberg',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bond-bloomberg.component.html',
  styleUrls: ['./bond-bloomberg.component.scss']
})
export class BondBloombergComponent {
  readonly screens: { id: BloombergScreen; label: string; description: string }[] = [
    { id: 'SECF', label: 'SECF', description: 'Recherche titres' },
    { id: 'DES', label: 'DES', description: 'Description du titre' },
    { id: 'YAS', label: 'YAS', description: 'Rendement et spread' },
    { id: 'DEBT', label: 'Debt Summary', description: 'Dette société' }
  ];
  readonly currencies = ['Toutes', 'EUR', 'GBP', 'USD'];
  readonly couponTypes = ['Tous', 'Fixe', 'Variable'];
  readonly ratingFilters = ['Toutes', 'AAA', 'AA', 'A', 'BBB', 'BB'];
  readonly maturityFilters = ['Toutes', '< 5 ans', '5–15 ans', '15+ ans', 'Perpétuelle'];
  readonly securities: BloombergSecurity[] = [
    {
      securityId: 'EDF 4 1/8 06/17/31 Corp', issuer: 'Électricité de France SA', couponRate: 4.125,
      couponType: 'Fixe', maturityLabel: '17/06/2031', yearsToMaturity: 6.7, rating: 'BBB', currency: 'EUR',
      price: 104.480, source: 'BGN', yieldToMaturity: 3.368667, spreadBps: 144.25,
      isin: 'FR001400QR62', figi: 'BBG01N8GBXH1', seniority: 'Senior unsecured', couponFrequency: 'Annuelle',
      dayCount: 'ACT/ACT', issuePrice: 99.839, series: 'EMTN', market: 'Euronext Paris', nominalAmount: '100 000',
      ratingMoody: 'Baa1', ratingSp: 'BBB', ratingFitch: 'BBB+',
      modifiedDuration: 5.577, duration: 5.882, convexity: 0.388, dv01: 588, oas: 111.7,
      benchmark: 'DBR 0 02/15/31'
    },
    { securityId: 'Vinci SA FLOAT 05/13/26 Corp', issuer: 'Vinci SA', couponRate: null, couponLabel: 'FLOAT', couponType: 'Variable', maturityLabel: '13/05/2026', yearsToMaturity: 1.6, rating: 'A-', currency: 'EUR', price: 100.095, source: 'BGN' },
    { securityId: 'EDF 4 3/4 06/17/44 Corp', issuer: 'Électricité de France SA', couponRate: 4.75, couponType: 'Fixe', maturityLabel: '17/06/2044', yearsToMaturity: 19.7, rating: 'BBB', currency: 'EUR', price: 105.763, source: 'BGN' },
    { securityId: 'EDF 5 5/8 Perp Corp', issuer: 'Électricité de France SA', couponRate: 5.625, couponType: 'Fixe', maturityLabel: 'Perpétuelle', yearsToMaturity: null, rating: 'BB', currency: 'EUR', price: 101.960, source: 'BGN' },
    { securityId: 'EDF 5 1/8 Perp Corp', issuer: 'Électricité de France SA', couponRate: 5.125, couponType: 'Fixe', maturityLabel: 'Perpétuelle', yearsToMaturity: null, rating: 'BB', currency: 'EUR', price: 100.975, source: 'BGN' },
    { securityId: 'EDF 7 3/8 Perp Corp', issuer: 'Électricité de France SA', couponRate: 7.375, couponType: 'Fixe', maturityLabel: 'Perpétuelle', yearsToMaturity: null, rating: 'BB', currency: 'GBP', price: 103.048, source: 'BGN' },
    { securityId: 'EDF 5 1/2 01/22/34 Corp', issuer: 'Électricité de France SA', couponRate: 5.5, couponType: 'Variable', maturityLabel: '22/01/2034', yearsToMaturity: 9.3, rating: 'BBB', currency: 'USD', price: 105.158, source: 'BMRK' },
    { securityId: 'EDF 5 09/21/48 Corp', issuer: 'Électricité de France SA', couponRate: 5, couponType: 'Fixe', maturityLabel: '21/09/2048', yearsToMaturity: 24, rating: 'BBB', currency: 'USD', price: 95.645, source: 'BMRK' },
    { securityId: 'EDF 9 1/8 Perp Corp', issuer: 'Électricité de France SA', couponRate: 9.125, couponType: 'Fixe', maturityLabel: 'Perpétuelle', yearsToMaturity: null, rating: 'BB', currency: 'USD', price: 114.100, source: 'TRMT' }
  ];
  readonly debtHistory = [
    { period: 'Actuel', bonds: 79755, loans: 8288, total: 88043 },
    { period: 'T1 2024', bonds: 76589, loans: 8368, total: 84957 },
    { period: 'T4 2023', bonds: 76074, loans: 8341, total: 84415 },
    { period: 'T3 2023', bonds: 75587, loans: 7541, total: 83128 },
    { period: 'T2 2023', bonds: 75861, loans: 9002, total: 84863 }
  ];

  activeScreen: BloombergScreen = 'SECF';
  selectedSecurity = this.securities[0];
  search = '';
  currencyFilter = 'Toutes';
  couponFilter = 'Tous';
  ratingFilter = 'Toutes';
  maturityFilter = 'Toutes';

  get filteredSecurities(): BloombergSecurity[] {
    const query = this.search.trim().toLocaleLowerCase();
    return this.securities.filter(security => {
      const matchesQuery = !query || `${security.securityId} ${security.issuer} ${security.currency} ${security.rating}`.toLocaleLowerCase().includes(query);
      const matchesCurrency = this.currencyFilter === 'Toutes' || security.currency === this.currencyFilter;
      const matchesCoupon = this.couponFilter === 'Tous' || security.couponType === this.couponFilter;
      const matchesRating = this.ratingFilter === 'Toutes' || security.rating.startsWith(this.ratingFilter);
      const matchesMaturity = this.matchesMaturity(security);
      return matchesQuery && matchesCurrency && matchesCoupon && matchesRating && matchesMaturity;
    });
  }

  get activeScreenDescription(): string {
    return this.screens.find(screen => screen.id === this.activeScreen)?.description ?? '';
  }

  setScreen(screen: BloombergScreen): void {
    this.activeScreen = screen;
  }

  selectSecurity(security: BloombergSecurity): void {
    this.selectedSecurity = security;
  }

  selectForDescription(security: BloombergSecurity): void {
    this.selectSecurity(security);
    this.setScreen('DES');
  }

  selectForYieldAnalysis(security: BloombergSecurity): void {
    this.selectSecurity(security);
    this.setScreen('YAS');
  }

  barHeight(value: number): number {
    return Math.max(4, Math.round(value / 900));
  }

  private matchesMaturity(security: BloombergSecurity): boolean {
    if (this.maturityFilter === 'Toutes') return true;
    if (this.maturityFilter === 'Perpétuelle') return security.yearsToMaturity === null;
    if (security.yearsToMaturity === null) return false;
    if (this.maturityFilter === '< 5 ans') return security.yearsToMaturity < 5;
    if (this.maturityFilter === '5–15 ans') return security.yearsToMaturity >= 5 && security.yearsToMaturity <= 15;
    return security.yearsToMaturity > 15;
  }
}
