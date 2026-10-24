import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BondComparable } from '../../../../models/bond-comparables.model';

interface PortfolioPosition {
  id: string;
  securityId: string;
  issuer: string;
  currency: string;
  maturityDate: string;
  nominal: number;
  marketPrice: number | null;
  costPrice: number | null;
  yieldToMaturity: number | null;
  modifiedDuration: number | null;
}

interface BondPortfolio {
  id: string;
  name: string;
  positions: PortfolioPosition[];
}

interface CurrencySummary {
  currency: string;
  marketValue: number;
  unrealizedPnl: number | null;
  dv01: number;
  rateShockPnl: number;
  weightedYield: number | null;
  yieldMarketValue: number;
  weightedDuration: number | null;
  durationMarketValue: number;
  pricedCount: number;
  positionCount: number;
  durationCount: number;
  allocations: Array<{ position: PortfolioPosition; marketValue: number; weight: number }>;
}

interface PositionDraft {
  securityId: string;
  issuer: string;
  currency: string;
  maturityDate: string;
  nominal: number;
  marketPrice: number | null;
  costPrice: number | null;
  yieldPercent: number | null;
  modifiedDuration: number | null;
}

@Component({
  selector: 'app-bond-portfolios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bond-portfolios.component.html',
  styleUrls: ['./bond-portfolios.component.scss']
})
export class BondPortfoliosComponent implements OnInit {
  @Input() bonds: BondComparable[] = [];

  private readonly storageKey = 'finance-pricer.bond-portfolios.v1';
  portfolios: BondPortfolio[] = [];
  activePortfolioId = '';
  newPortfolioName = '';
  portfolioPendingDeletion = '';
  selectedBondId = '';
  rateShockBps = 100;
  error = '';
  readonly draftDefaults: PositionDraft = {
    securityId: '', issuer: '', currency: 'EUR', maturityDate: '', nominal: 100_000,
    marketPrice: null, costPrice: null, yieldPercent: null, modifiedDuration: null
  };
  positionDraft: PositionDraft = { ...this.draftDefaults };

  ngOnInit(): void {
    this.restore();
  }

  get activePortfolio(): BondPortfolio | null {
    return this.portfolios.find(portfolio => portfolio.id === this.activePortfolioId) ?? null;
  }

  get currencySummaries(): CurrencySummary[] {
    return this.summarize(this.activePortfolio);
  }

  get marketValueLabel(): string {
    const summaries = this.currencySummaries.filter(summary => summary.pricedCount > 0);
    if (summaries.length !== 1) return summaries.length > 1 ? 'Multi-devises' : '—';
    return this.formatCurrency(summaries[0].marketValue, summaries[0].currency);
  }

  get pricedPositionCount(): number {
    return this.currencySummaries.reduce((count, summary) => count + summary.pricedCount, 0);
  }

  createPortfolio(): void {
    const name = this.newPortfolioName.trim() || `Portefeuille ${this.portfolios.length + 1}`;
    const portfolio: BondPortfolio = { id: crypto.randomUUID(), name, positions: [] };
    this.portfolios = [...this.portfolios, portfolio];
    this.activePortfolioId = portfolio.id;
    this.newPortfolioName = '';
    this.portfolioPendingDeletion = '';
    this.persist();
  }

  requestPortfolioDeletion(id: string): void {
    this.portfolioPendingDeletion = id;
  }

  deletePortfolio(): void {
    if (!this.portfolioPendingDeletion) return;
    this.portfolios = this.portfolios.filter(portfolio => portfolio.id !== this.portfolioPendingDeletion);
    if (this.activePortfolioId === this.portfolioPendingDeletion) {
      this.activePortfolioId = this.portfolios[0]?.id ?? '';
    }
    this.portfolioPendingDeletion = '';
    this.persist();
  }

  selectInstrument(securityId: string): void {
    this.selectedBondId = securityId;
    const bond = this.bonds.find(item => item.securityId === securityId);
    if (!bond) return;
    this.positionDraft = {
      securityId: bond.securityId,
      issuer: bond.issuer ?? bond.name ?? '',
      currency: bond.currency.toUpperCase(),
      maturityDate: bond.maturityDate,
      nominal: 100_000,
      marketPrice: bond.marketPrice ?? null,
      costPrice: null,
      yieldPercent: bond.yieldToMaturity * 100,
      modifiedDuration: null
    };
    this.error = '';
  }

  addPosition(): void {
    const portfolio = this.activePortfolio;
    const draft = this.positionDraft;
    if (!portfolio) return;
    if (!draft.securityId.trim() || !draft.currency.trim() || !Number.isFinite(draft.nominal) || draft.nominal <= 0) {
      this.error = 'Renseignez un identifiant, une devise et un nominal positif.';
      return;
    }
    if ((draft.marketPrice !== null && draft.marketPrice <= 0) || (draft.costPrice !== null && draft.costPrice <= 0) || (draft.modifiedDuration !== null && draft.modifiedDuration < 0)) {
      this.error = 'Les prix doivent être positifs et la duration ne peut pas être négative.';
      return;
    }
    const position: PortfolioPosition = {
      id: crypto.randomUUID(),
      securityId: draft.securityId.trim(),
      issuer: draft.issuer.trim(),
      currency: draft.currency.trim().toUpperCase(),
      maturityDate: draft.maturityDate,
      nominal: draft.nominal,
      marketPrice: this.optionalNumber(draft.marketPrice),
      costPrice: this.optionalNumber(draft.costPrice),
      yieldToMaturity: draft.yieldPercent === null ? null : draft.yieldPercent / 100,
      modifiedDuration: this.optionalNumber(draft.modifiedDuration)
    };
    portfolio.positions = [...portfolio.positions, position];
    this.positionDraft = { ...this.draftDefaults };
    this.selectedBondId = '';
    this.error = '';
    this.persist();
  }

  removePosition(positionId: string): void {
    const portfolio = this.activePortfolio;
    if (!portfolio) return;
    portfolio.positions = portfolio.positions.filter(position => position.id !== positionId);
    this.persist();
  }

  persist(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({ portfolios: this.portfolios, activePortfolioId: this.activePortfolioId }));
    } catch {
      this.error = 'La sauvegarde locale est indisponible dans ce navigateur.';
    }
  }

  positionMarketValue(position: PortfolioPosition): number | null {
    if (!this.isFiniteNumber(position.marketPrice) || position.marketPrice <= 0 || !Number.isFinite(position.nominal) || position.nominal <= 0) return null;
    return position.nominal * position.marketPrice / 100;
  }

  positionPnl(position: PortfolioPosition): number | null {
    if (!Number.isFinite(position.nominal) || position.nominal <= 0 || !this.isFiniteNumber(position.marketPrice) || position.marketPrice <= 0 || !this.isFiniteNumber(position.costPrice) || position.costPrice <= 0) return null;
    return position.nominal * (position.marketPrice - position.costPrice) / 100;
  }

  positionDv01(position: PortfolioPosition): number | null {
    const marketValue = this.positionMarketValue(position);
    if (marketValue === null || position.modifiedDuration === null || !Number.isFinite(position.modifiedDuration) || position.modifiedDuration < 0) return null;
    return marketValue * position.modifiedDuration / 10_000;
  }

  portfolioSummary(portfolio: BondPortfolio): string {
    const summaries = this.summarize(portfolio).filter(summary => summary.pricedCount > 0);
    const values = summaries.map(summary => this.formatCurrency(summary.marketValue, summary.currency));
    const holdingCount = `${portfolio.positions.length} obligation${portfolio.positions.length === 1 ? '' : 's'}`;
    return [holdingCount, ...values].join(' · ');
  }

  private summarize(portfolio: BondPortfolio | null): CurrencySummary[] {
    if (!portfolio) return [];
    const summaries = new Map<string, CurrencySummary>();
    for (const position of portfolio.positions) {
      const summary = this.getOrCreateSummary(position.currency, summaries);
      this.accumulatePosition(summary, position);
    }
    for (const summary of summaries.values()) {
      this.finalizeSummary(summary);
    }
    return [...summaries.values()].sort((left, right) => left.currency.localeCompare(right.currency));
  }

  private getOrCreateSummary(currencyValue: string, summaries: Map<string, CurrencySummary>): CurrencySummary {
    const currency = currencyValue.toUpperCase();
    const existing = summaries.get(currency);
    if (existing) return existing;
    const summary: CurrencySummary = {
      currency, marketValue: 0, unrealizedPnl: 0, dv01: 0, rateShockPnl: 0,
      weightedYield: null, yieldMarketValue: 0, weightedDuration: null, durationMarketValue: 0,
      pricedCount: 0, positionCount: 0, durationCount: 0, allocations: []
    };
    summaries.set(currency, summary);
    return summary;
  }

  private accumulatePosition(summary: CurrencySummary, position: PortfolioPosition): void {
    summary.positionCount++;
    const marketValue = this.positionMarketValue(position);
    if (marketValue === null) return;
    summary.marketValue += marketValue;
    summary.pricedCount++;
    const pnl = this.positionPnl(position);
    if (pnl !== null) summary.unrealizedPnl = (summary.unrealizedPnl ?? 0) + pnl;
    this.accumulateYield(summary, position, marketValue);
    this.accumulateDuration(summary, position, marketValue);
    summary.allocations.push({ position, marketValue, weight: 0 });
  }

  private accumulateYield(summary: CurrencySummary, position: PortfolioPosition, marketValue: number): void {
    if (position.yieldToMaturity !== null && Number.isFinite(position.yieldToMaturity)) {
      summary.weightedYield = (summary.weightedYield ?? 0) + position.yieldToMaturity * marketValue;
      summary.yieldMarketValue += marketValue;
    }
  }

  private accumulateDuration(summary: CurrencySummary, position: PortfolioPosition, marketValue: number): void {
    if (position.modifiedDuration === null || !Number.isFinite(position.modifiedDuration) || position.modifiedDuration < 0) return;
    summary.weightedDuration = (summary.weightedDuration ?? 0) + position.modifiedDuration * marketValue;
    summary.durationMarketValue += marketValue;
    summary.dv01 += marketValue * position.modifiedDuration / 10_000;
    summary.durationCount++;
  }

  private finalizeSummary(summary: CurrencySummary): void {
    if (summary.marketValue > 0) this.normalizeSummaryWeights(summary);
    summary.rateShockPnl = -summary.dv01 * this.rateShockBps;
    summary.allocations.sort((left, right) => right.weight - left.weight);
  }

  private normalizeSummaryWeights(summary: CurrencySummary): void {
    if (summary.weightedYield !== null && summary.yieldMarketValue > 0) summary.weightedYield /= summary.yieldMarketValue;
    if (summary.weightedDuration !== null && summary.durationMarketValue > 0) summary.weightedDuration /= summary.durationMarketValue;
    for (const allocation of summary.allocations) allocation.weight = allocation.marketValue / summary.marketValue * 100;
  }

  private restore(): void {
    try {
      const serialized = localStorage.getItem(this.storageKey);
      if (!serialized) return;
      const state = JSON.parse(serialized) as { portfolios?: unknown; activePortfolioId?: unknown };
      if (!Array.isArray(state.portfolios)) return;
      this.portfolios = state.portfolios.filter((portfolio): portfolio is BondPortfolio => this.isPortfolio(portfolio));
      this.activePortfolioId = typeof state.activePortfolioId === 'string' && this.portfolios.some(portfolio => portfolio.id === state.activePortfolioId)
        ? state.activePortfolioId
        : this.portfolios[0]?.id ?? '';
    } catch {
      this.portfolios = [];
      this.activePortfolioId = '';
    }
  }

  private isPortfolio(value: unknown): value is BondPortfolio {
    if (!value || typeof value !== 'object') return false;
    const portfolio = value as Partial<BondPortfolio>;
    return typeof portfolio.id === 'string' && typeof portfolio.name === 'string' && Array.isArray(portfolio.positions)
      && portfolio.positions.every(position => !!position && typeof position.id === 'string'
        && typeof position.securityId === 'string' && typeof position.currency === 'string'
        && typeof position.nominal === 'number' && Number.isFinite(position.nominal));
  }

  private optionalNumber(value: number | null): number | null {
    return value !== null && Number.isFinite(value) ? value : null;
  }

  private isFiniteNumber(value: number | null): value is number {
    return value !== null && Number.isFinite(value);
  }

  private formatCurrency(value: number, currency: string): string {
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
    } catch {
      return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${currency}`;
    }
  }
}