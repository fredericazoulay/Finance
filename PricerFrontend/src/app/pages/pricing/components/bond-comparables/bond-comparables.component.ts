import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subscription, TimeoutError, catchError, finalize, from, map, mergeMap, of, tap, toArray } from 'rxjs';
import {
  BondComparable,
  BondComparablesRequest,
  BondComparablesResponse,
  BondDirectPricingRequest,
  BondDirectPricingResponse
} from '../../../../models/bond-comparables.model';
import { OPTION_IMPORT_COLUMNS, OptionImportColumn, OptionImportRecord } from '../../../../models/option-import.model';
import { PricingBatchItemResult } from '../../../../models/pricing.model';
import { BondComparablesService } from '../../../../services/bond-comparables.service';
import { PricingService } from '../../../../services/pricing.service';
import { AiAssistantService, BondTargetExtractionResponse } from '../../../../services/ai-assistant.service';
import { AiAnalysisComponent } from '../ai-analysis/ai-analysis.component';
import { FullOptionGraphsComponent } from '../full-option-graphs/full-option-graphs.component';
import { BondMarkowitzComponent } from '../bond-markowitz/bond-markowitz.component';
import { BondPortfoliosComponent } from '../bond-portfolios/bond-portfolios.component';
import { BondPeriodicCalculatorComponent } from '../bond-periodic-calculator/bond-periodic-calculator.component';
import { BondAnalyticsDashboardComponent } from '../bond-analytics-dashboard/bond-analytics-dashboard.component';
import { BondScenarioInput, calculateBondScenario } from '../bond-analytics-dashboard/bond-scenario';
import { BondFormulasComponent } from '../bond-formulas/bond-formulas.component';
import { BondBloombergComponent } from '../bond-bloomberg/bond-bloomberg.component';
import { BondAnalysisGuideComponent } from '../bond-analysis-guide/bond-analysis-guide.component';
import { BondComparatorComponent } from '../bond-comparator/bond-comparator.component';
import { BondMarketHubComponent } from '../bond-market-hub/bond-market-hub.component';
import { DEFAULT_BENCHMARK_BONDS } from '../../../../services/bond-analytics-calc';
import { MarketDataLiveService } from '../../../../services/market-data-live.service';
import { WorkGroupService } from '../../../../services/work-group.service';

interface BondComparableRow extends BondComparable {
  eligible: boolean | null;
  selected: boolean;
  exclusionReason: string | null;
  rank?: number | null;
  rankingReasons?: string[];
}

type BondBaseColumn = 'securityId' | 'issuer' | 'currency' | 'issueDate' | 'settlementDate' | 'maturityDate' | 'rating' | 'yieldToMaturity' | 'source';
type BondDataColumn = 'sector' | 'seniority' | 'seniorityDataStatus' | 'spreadBps' | 'spreadDataStatus' | 'assetSwapSpreadBps' | 'assetSwapSpreadDataStatus' | 'cdsSpreadBps' | 'cdsSpreadDataStatus' | 'gSpreadBps' | 'gSpreadDataStatus' | 'iSpreadBps' | 'iSpreadDataStatus' | 'nominalSpreadBps' | 'nominalSpreadDataStatus' | 'oasBps' | 'oasDataStatus' | 'tedSpreadBps' | 'tedSpreadDataStatus' | 'zSpread' | 'zSpreadDataStatus' | 'couponRate' | 'couponFrequency' | 'couponDataStatus' | 'cleanPrice' | 'cleanPriceDataStatus' | 'liquidityScore' | 'liquidityDataStatus';
type BondColumn = BondBaseColumn | BondDataColumn | 'eligibility';
type TextFilterColumn = BondBaseColumn | BondDataColumn;
type EligibilityFilter = 'best' | 'eligible' | 'excluded' | 'pending';
type BondTargetForm = BondComparablesRequest['target'];
type LightExportFormat = 'csv' | 'xlsx' | 'pdf';
type BondScreenMode = 'basic' | 'periodic-calculator' | 'bond-graphs' | 'formulas' | 'advanced' | 'bloomberg' | 'comparables-light' | 'comparables-full' | 'comparables-full-graphs' | 'comparables-full-markowitz' | 'portfolios' | 'ai-analysis' | 'bond-analysis' | 'comparator' | 'market-hub';
type BondSolveFor = 'PRICE' | 'YTM' | 'TERM';
type FullOptionColumn = typeof OPTION_IMPORT_COLUMNS[number] | 'calculatedPremiumPerUnit' | 'pricingStatus' | 'eligible';
type FullOptionDisplayColumn = FullOptionColumn | 'graphs';
type FullOptionValue = string | number | boolean | null | undefined;

interface ZeroCurvePointInput {
  timeYears: number | null;
  zeroRatePercent: number | null;
}

interface FullOptionGroup {
  key: string;
  label: string;
  rows: OptionImportRecord[];
}

interface BondGroup {
  key: string;
  label: string;
  rows: BondComparableRow[];
}

const currentLocalDate = (): string => {
  const date = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatCalendarDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};
interface PersistedBondComparablesState {
  version: 1;
  target: BondTargetForm;
  panel: BondComparable[];
  fullOptions?: OptionImportRecord[];
  result: BondComparablesResponse | null;
  lastCalculatedAt: string | null;
  zeroCurvePoints?: ZeroCurvePointInput[];
  maturityToleranceMonths: number;
  filters: Record<TextFilterColumn, string>;
  eligibilityFilters: EligibilityFilter[];
  yieldMinimum: string;
  yieldMaximum: string;
  sortColumn: BondColumn;
  sortDirection: 1 | -1;
  fullOptionFilters?: Partial<Record<FullOptionColumn, string>>;
  fullOptionSortColumn?: FullOptionColumn;
  fullOptionSortDirection?: 1 | -1;
  fullOptionGroupColumns?: FullOptionColumn[];
  fullOptionColumnOrder?: FullOptionDisplayColumn[];
  fullOptionVisibleColumns?: FullOptionDisplayColumn[];
  alternateFullOptionRows?: boolean;
  bondGroupColumns?: BondColumn[];
  bondColumnOrder?: BondColumn[];
  bondVisibleColumns?: BondColumn[];
  alternateBondRows?: boolean;
}

@Component({
  selector: 'app-bond-comparables',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    AiAnalysisComponent,
    FullOptionGraphsComponent,
    BondMarkowitzComponent,
    BondPortfoliosComponent,
    BondPeriodicCalculatorComponent,
    BondAnalyticsDashboardComponent,
    BondFormulasComponent,
    BondBloombergComponent,
    BondAnalysisGuideComponent,
    BondComparatorComponent,
    BondMarketHubComponent
  ],
  templateUrl: './bond-comparables.component.html',
  styleUrls: ['./bond-comparables.component.scss']
})
export class BondComparablesComponent implements OnDestroy {
  private readonly storageKey = 'finance-pricer.bond-comparables.v1';
  readonly apiOnline$: Observable<boolean>;
  private readonly commonCurrencies = ['AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'JPY', 'USD'];
  private importGeneration = 0;
  private directPricingSubscription?: Subscription;
  private directPricingWatchdog?: ReturnType<typeof setTimeout>;
  private isDestroyed = false;
  readonly eligibilityOptions = [
    { value: 'best', label: 'Retenu par le classement' },
    { value: 'eligible', label: 'Comparable' },
    { value: 'excluded', label: 'Exclue' },
    { value: 'pending', label: 'À analyser' }
  ] as const;
  readonly fullOptionColumns: FullOptionColumn[] = [...OPTION_IMPORT_COLUMNS, 'calculatedPremiumPerUnit', 'pricingStatus', 'eligible'];
  readonly defaultBondColumns: BondColumn[] = ['securityId', 'issuer', 'currency', 'issueDate', 'settlementDate', 'maturityDate', 'rating', 'yieldToMaturity', 'source', 'eligibility'];
  readonly bondColumns: BondColumn[] = [...this.defaultBondColumns, 'sector', 'seniority', 'seniorityDataStatus', 'spreadBps', 'spreadDataStatus', 'assetSwapSpreadBps', 'assetSwapSpreadDataStatus', 'cdsSpreadBps', 'cdsSpreadDataStatus', 'gSpreadBps', 'gSpreadDataStatus', 'iSpreadBps', 'iSpreadDataStatus', 'nominalSpreadBps', 'nominalSpreadDataStatus', 'oasBps', 'oasDataStatus', 'tedSpreadBps', 'tedSpreadDataStatus', 'zSpread', 'zSpreadDataStatus', 'couponRate', 'couponFrequency', 'couponDataStatus', 'cleanPrice', 'cleanPriceDataStatus', 'liquidityScore', 'liquidityDataStatus'];
  readonly bondColumnLabels: Record<BondColumn, string> = {
    securityId: 'Obligation', issuer: 'Émetteur', currency: 'Devise', issueDate: 'Émission', settlementDate: 'Règlement',
    maturityDate: 'Échéance', rating: 'Notation', yieldToMaturity: 'YTM', source: 'Source / date', eligibility: 'Éligibilité',
    couponRate: 'Coupon annuel', couponFrequency: 'Coupons / an', couponDataStatus: 'Statut coupon',
    cleanPrice: 'Prix clean', cleanPriceDataStatus: 'Statut prix clean', liquidityScore: 'Score liquidité',
    liquidityDataStatus: 'Statut liquidité', sector: 'Secteur', seniority: 'Séniorité', seniorityDataStatus: 'Statut séniorité',
    spreadBps: 'Spread générique (pb)', spreadDataStatus: 'Statut spread générique',
    assetSwapSpreadBps: 'Asset swap spread (pb)', assetSwapSpreadDataStatus: 'Statut ASW',
    cdsSpreadBps: 'CDS spread (pb)', cdsSpreadDataStatus: 'Statut CDS',
    gSpreadBps: 'G-spread (pb)', gSpreadDataStatus: 'Statut G-spread',
    iSpreadBps: 'I-spread (pb)', iSpreadDataStatus: 'Statut I-spread',
    nominalSpreadBps: 'Nominal spread (pb)', nominalSpreadDataStatus: 'Statut nominal spread',
    oasBps: 'OAS (pb)', oasDataStatus: 'Statut OAS',
    tedSpreadBps: 'TED spread (pb)', tedSpreadDataStatus: 'Statut TED',
    zSpread: 'Z-spread importé (pb)', zSpreadDataStatus: 'Statut Z-spread importé'
  };
  bondColumnOrder: BondColumn[] = [...this.bondColumns];
  bondVisibleColumns = new Set<BondColumn>(this.defaultBondColumns);
  alternateBondRows = false;
  bondGroupColumns: BondColumn[] = [];
  collapsedBondGroups = new Set<string>();
  isBondGroupingDragOver = false;
  fullOptionColumnOrder: FullOptionDisplayColumn[] = [...this.fullOptionColumns, 'graphs'];
  fullOptionVisibleColumns = new Set<FullOptionDisplayColumn>(this.fullOptionColumnOrder);
  alternateFullOptionRows = false;
  fullOptionFilters: Partial<Record<FullOptionColumn, string>> = {};
  fullOptionSortColumn: FullOptionColumn = 'optionId';
  fullOptionSortDirection: 1 | -1 = 1;
  fullOptionGroupColumns: FullOptionColumn[] = [];
  collapsedFullOptionGroups = new Set<string>();
  isFullOptionGroupingDragOver = false;
  activeMode: BondScreenMode = 'basic';
  targetBondSearch = '';
  directResult: BondDirectPricingResponse | null = null;
  directError = '';
  isDirectPricing = false;
  directCurrency = 'USD';
  get basicCouponRatePercent(): number {
    const faceValue = Number(this.basicForm.faceValue);
    const couponValue = Number(this.basicForm.couponValue);
    if (!Number.isFinite(faceValue) || faceValue <= 0 || !Number.isFinite(couponValue)) return Number.NaN;
    return this.basicForm.couponUnit === 'AMOUNT' ? couponValue / faceValue * 100 : couponValue;
  }

  readonly basicForm = {
    solveFor: 'PRICE' as BondSolveFor,
    faceValue: 100,
    couponValue: 5,
    couponUnit: 'PERCENT' as 'PERCENT' | 'AMOUNT',
    couponFrequency: 2,
    price: null as number | null,
    ytm: 6,
    termYears: 3
  };
  readonly advancedForm = {
    solveFor: 'PRICE' as 'PRICE' | 'YTM',
    faceValue: 100,
    couponRate: 5,
    couponFrequency: 2,
    issueDate: '2020-10-23',
    maturityDate: '2029-10-23',
    settlementDate: currentLocalDate(),
    dayCount: '30/360',
    ytm: 6,
    marketPrice: null as number | null
  };

  target: BondTargetForm = {
    securityId: '',
    name: '',
    currency: 'EUR',
    faceValue: 100,
    couponRate: 4,
    couponFrequency: 2,
    issueDate: '',
    maturityDate: '',
    settlementDate: currentLocalDate(),
    dayCount: '30/360'
  };
  maturityToleranceMonths = 24;
  panel: BondComparable[] = [];
  fullOptions: OptionImportRecord[] = [];
  selectedFullOption: OptionImportRecord | null = null;
  fullOptionSearch = '';
  targetDescription = '';
  isExtractingTarget = false;
  targetExtractionError = '';
  targetExtractionMissingFields: string[] = [];
  targetExtractionAmbiguities: string[] = [];
  readonly fullOptionLabels: Record<FullOptionColumn, string> = {
    optionId: 'Identifiant option',
    optionType: 'Type d’option',
    underlyingType: 'Type de sous-jacent',
    underlyingSecurityId: 'Identifiant du sous-jacent',
    currency: 'Devise',
    valuationDate: 'Date de valorisation',
    underlyingSpot: 'Cours du sous-jacent',
    strikePrice: 'Prix d’exercice',
    expirationDate: 'Date d’expiration',
    premiumPerUnit: 'Prime par unité',
    exerciseStyle: 'Style d’exercice',
    quantity: 'Quantité',
    nominal: 'Nominal',
    position: 'Position',
    intrinsicValuePerUnit: 'Valeur intrinsèque par unité',
    timeValuePerUnit: 'Valeur temps par unité',
    moneyness: 'Moneyness',
    volatility: 'Volatilité',
    riskFreeRate: 'Taux sans risque',
    dividendYield: 'Rendement du dividende',
    delta: 'Delta',
    gamma: 'Gamma',
    vegaPer1PctVol: 'Vega par 1 % de volatilité',
    thetaPerDay: 'Theta par jour',
    rhoPer1PctRate: 'Rho par 1 % de taux',
    underlyingYieldToMaturity: 'YTM du sous-jacent',
    dataSource: 'Source des données',
    calculatedPremiumPerUnit: 'Prime calculée par unité',
    pricingStatus: 'Statut du pricing',
    eligible: 'ELIGIBLE'
  };
  result: BondComparablesResponse | null = null;
  lastCalculatedAt: Date | null = null;
  zeroCurvePoints: ZeroCurvePointInput[] = [];
  error = '';
  importError = '';
  marketSearchError = '';
  marketSearchMessage = '';
  exportSuccess = '';
  isLoading = false;
  isImporting = false;
  isSearchingPanel = false;
  isExporting = false;
  exportError = '';
  isFullOptionsExporting = false;
  fullOptionsExportError = '';
  fullOptionsExportSuccess = '';
  isFullOptionPricing = false;
  fullOptionPricingProgress = 0;
  fullOptionPricingSummary = '';
  filters: Record<TextFilterColumn, string> = {
    securityId: '', issuer: '', currency: '', issueDate: '', settlementDate: '', maturityDate: '', rating: '', yieldToMaturity: '', source: '',
    couponRate: '', couponFrequency: '', couponDataStatus: '', cleanPrice: '', cleanPriceDataStatus: '', liquidityScore: '', liquidityDataStatus: '',
    sector: '', seniority: '', seniorityDataStatus: '', spreadBps: '', spreadDataStatus: '',
    assetSwapSpreadBps: '', assetSwapSpreadDataStatus: '', cdsSpreadBps: '', cdsSpreadDataStatus: '',
    gSpreadBps: '', gSpreadDataStatus: '', iSpreadBps: '', iSpreadDataStatus: '',
    nominalSpreadBps: '', nominalSpreadDataStatus: '', oasBps: '', oasDataStatus: '',
    tedSpreadBps: '', tedSpreadDataStatus: '', zSpread: '', zSpreadDataStatus: ''
  };
  eligibilityFilters = new Set<EligibilityFilter>();
  yieldMinimum = '';
  yieldMaximum = '';
  sortColumn: BondColumn = 'yieldToMaturity';
  sortDirection: 1 | -1 = -1;

  selectedBondIdsForCompare = new Set<string>();
  activeBloombergSecurityId?: string;

  constructor(
    private readonly comparablesService: BondComparablesService,
    private readonly pricingService: PricingService,
    private readonly aiAssistantService: AiAssistantService,
    private readonly cdr: ChangeDetectorRef,
    readonly workGroupService: WorkGroupService,
    readonly marketDataService: MarketDataLiveService
  ) {
    this.apiOnline$ = this.pricingService.apiOnline$;
    this.restoreState();
    if (this.panel.length === 0) {
      this.loadDefaultBenchmarkUniverse();
    } else if (this.selectedBondIdsForCompare.size === 0 && this.panel.length >= 2) {
      this.selectedBondIdsForCompare.add(this.panel[0].securityId);
      this.selectedBondIdsForCompare.add(this.panel[1].securityId);
    }
  }

  applyLiveMarketRates(): void {
    this.marketDataService.refreshLiveMarketData().subscribe(() => {
      this.cdr.markForCheck();
    });
  }

  onAddBenchmarkToCompare(symbol: string): void {
    const quotes = this.marketDataService.currentSnapshot.quotes;
    const match = quotes.find(q => q.symbol === symbol);
    if (!match) return;

    const existing = this.panel.find(b => b.securityId === match.symbol);
    if (!existing) {
      const benchmarkBond: BondComparable = {
        securityId: match.symbol,
        name: match.name,
        issuer: match.source,
        currency: match.currency,
        maturityDate: '2034-08-15',
        yieldToMaturity: match.yieldPercent / 100,
        couponRate: match.yieldPercent,
        couponFrequency: 1,
        marketPrice: match.price,
        rating: match.assetClass === 'High Yield' ? 'BB' : match.assetClass === 'Corp IG' ? 'A' : 'AAA',
        sector: match.assetClass,
        source: 'Yahoo Finance'
      };
      this.panel.unshift(benchmarkBond);
    }
    this.selectedBondIdsForCompare.add(match.symbol);
    this.setMode('comparator');
  }

  get comparedBonds(): BondComparable[] {
    const targetBond = this.targetPanelBond;
    return [
      ...(targetBond && this.selectedBondIdsForCompare.has(targetBond.securityId) ? [targetBond] : []),
      ...this.panel.filter(bond => bond.securityId !== targetBond?.securityId && this.selectedBondIdsForCompare.has(bond.securityId))
    ];
  }

  get targetPanelBond(): BondComparable | null {
    return this.panel.find(bond => bond.securityId === this.target.securityId) ?? null;
  }

  get searchedTargetBonds(): BondComparable[] {
    const query = this.targetBondSearch.trim().toLocaleLowerCase();
    if (!query) return this.panel;
    return this.panel.filter(bond => [
      bond.securityId,
      bond.name,
      bond.issuer,
      bond.isin,
      bond.currency,
      bond.maturityDate
    ].some(value => value?.toLocaleLowerCase().includes(query)));
  }

  get targetPanelBondOutsideSearch(): boolean {
    return Boolean(this.targetPanelBond && !this.searchedTargetBonds.some(bond => bond.securityId === this.target.securityId));
  }

  searchTargetBonds(query: string): void {
    this.targetBondSearch = query;
  }

  toggleCompareBond(securityId: string): void {
    if (this.selectedBondIdsForCompare.has(securityId)) {
      this.selectedBondIdsForCompare.delete(securityId);
    } else {
      if (this.selectedBondIdsForCompare.size >= 5) {
        const first = this.selectedBondIdsForCompare.values().next().value;
        if (first) this.selectedBondIdsForCompare.delete(first);
      }
      this.selectedBondIdsForCompare.add(securityId);
    }
    this.persistState();
  }

  isSelectedForCompare(securityId: string): boolean {
    return this.selectedBondIdsForCompare.has(securityId);
  }

  compareCheckboxId(securityId: string): string {
    return `compare-bond-${encodeURIComponent(securityId)}`;
  }

  clearComparedBonds(): void {
    this.selectedBondIdsForCompare.clear();
    this.persistState();
  }

  openComparator(ids?: string[]): void {
    if (ids && ids.length > 0) {
      this.selectedBondIdsForCompare = new Set(ids);
    } else if (this.selectedBondIdsForCompare.size === 0 && this.panel.length >= 2) {
      this.selectedBondIdsForCompare.add(this.panel[0].securityId);
      this.selectedBondIdsForCompare.add(this.panel[1].securityId);
    }
    this.setMode('comparator');
  }

  openInBloomberg(securityId: string): void {
    this.activeBloombergSecurityId = securityId;
    this.setMode('bloomberg');
  }

  loadDefaultBenchmarkUniverse(): void {
    this.panel = [...DEFAULT_BENCHMARK_BONDS];
    this.syncTargetMetadataFromPanel();
    this.selectedBondIdsForCompare.clear();
    if (this.panel.length >= 3) {
      this.selectedBondIdsForCompare.add(this.panel[0].securityId);
      this.selectedBondIdsForCompare.add(this.panel[1].securityId);
      this.selectedBondIdsForCompare.add(this.panel[3].securityId);
    }
    this.persistState();
  }

  searchMarketPanel(): void {
    this.marketSearchError = '';
    this.marketSearchMessage = '';
    if (!this.target.currency || !this.target.maturityDate) {
      this.marketSearchError = 'Renseignez la devise et l’échéance de la cible avant la recherche.';
      return;
    }

    this.isSearchingPanel = true;
    this.comparablesService.searchPanel(this.target, Number(this.maturityToleranceMonths))
      .pipe(finalize(() => {
        this.isSearchingPanel = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: bonds => {
          this.panel = bonds;
          this.syncTargetMetadataFromPanel();
          this.selectedBondIdsForCompare.clear();
          this.invalidateResult();
          if (bonds.length) {
            const source = bonds.find(bond => bond.source)?.source ?? 'fournisseur configuré';
            this.marketSearchMessage = `${bonds.length} obligation(s) reçue(s) depuis ${source}. Vérifiez les dates et la provenance avant le pricing.`;
          } else {
            this.marketSearchError = 'Le fournisseur n’a retourné aucun comparable pour ces critères.';
          }
          this.persistState();
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 503) {
            this.marketSearchError = 'Le fournisseur de données obligataires n’est pas configuré côté backend.';
          } else if (error.status === 502) {
            this.marketSearchError = 'Le fournisseur de données obligataires est indisponible ou a renvoyé une réponse invalide.';
          } else if (error.status === 0) {
            this.marketSearchError = 'API backend inaccessible. Vérifiez le service sur le port 9092.';
          } else {
            this.marketSearchError = 'La recherche de comparables a échoué. Vérifiez la cible et réessayez.';
          }
        }
      });
  }

  setMode(mode: BondScreenMode): void {
    this.activeMode = mode;
    this.directError = '';
  }

  get aiAnalysisContext(): string {
    const comparableCandidates = this.panel
      .filter(bond => bond.currency === this.target.currency)
      .slice()
      .sort((left, right) => right.yieldToMaturity - left.yieldToMaturity)
      .slice(0, 5);
    const bestComparable = this.result?.panel.find(row => row.selected)?.bond ?? comparableCandidates[0] ?? null;
    return JSON.stringify({
      target: this.target,
      pricing: this.result ? {
        bestYieldSecurityId: this.result.bestYieldSecurityId,
        appliedYield: this.result.appliedYield,
        valuation: this.result.valuation
      } : null,
      bestComparable,
      comparableCandidates
    });
  }

  openFullOptionGraphs(option: OptionImportRecord): void {
    this.selectedFullOption = option;
    this.fullOptionSearch = '';
    this.setMode('comparables-full-graphs');
  }

  extractTargetFromDescription(): void {
    const description = this.targetDescription.trim();
    if (!description || this.isExtractingTarget) return;

    this.isExtractingTarget = true;
    this.targetExtractionError = '';
    this.targetExtractionMissingFields = [];
    this.targetExtractionAmbiguities = [];
    this.aiAssistantService.extractBondTarget(description).pipe(finalize(() => {
      this.isExtractingTarget = false;
    })).subscribe({
      next: extraction => this.applyTargetExtraction(extraction),
      error: (error: HttpErrorResponse) => {
        if (typeof error.error?.message === 'string') {
          this.targetExtractionError = error.error.message;
        } else if (error.status === 0) {
          this.targetExtractionError = 'API indisponible. Vérifiez que le backend répond sur le port 9092.';
        } else {
          this.targetExtractionError = 'L’extraction IA a échoué. Vérifiez la description puis réessayez.';
        }
      }
    });
  }

  private applyTargetExtraction(extraction: BondTargetExtractionResponse): void {
    this.target = {
      securityId: extraction.securityId ?? '',
      name: extraction.name ?? '',
      currency: extraction.currency ?? '',
      faceValue: extraction.faceValue ?? 0,
      couponRate: extraction.couponRate == null ? 0 : extraction.couponRate * 100,
      couponFrequency: extraction.couponFrequency ?? 0,
      issueDate: extraction.issueDate,
      maturityDate: extraction.maturityDate ?? '',
      settlementDate: extraction.settlementDate ?? '',
      dayCount: extraction.dayCount ?? ''
    };
    const labels: Record<string, string> = {
      securityId: 'Identifiant', currency: 'Devise', faceValue: 'Nominal', couponRate: 'Coupon annuel',
      couponFrequency: 'Fréquence du coupon', maturityDate: 'Échéance', settlementDate: 'Date de règlement',
      dayCount: 'Convention de jours'
    };
    this.targetExtractionMissingFields = extraction.missingFields.map(field => labels[field] ?? field);
    this.targetExtractionAmbiguities = extraction.ambiguities;
    this.invalidateResult();
  }

  get searchedFullOptions(): OptionImportRecord[] {
    const query = this.fullOptionSearch.trim().toLocaleLowerCase();
    return this.fullOptions.filter(option =>
      `${option.optionId} ${option.underlyingSecurityId} ${option.currency} ${option.optionType}`
        .toLocaleLowerCase()
        .includes(query)
    );
  }

  searchFullOptions(query: string): void {
    this.fullOptionSearch = query;
    if (this.selectedFullOption && !this.searchedFullOptions.includes(this.selectedFullOption)) {
      this.selectedFullOption = null;
    }
  }

  selectFullOption(option: OptionImportRecord | null): void {
    this.selectedFullOption = option;
  }

  calculateBasic(): void {
    const couponRate = this.basicForm.couponUnit === 'AMOUNT'
      ? Number(this.basicForm.couponValue) / Number(this.basicForm.faceValue)
      : Number(this.basicForm.couponValue) / 100;
    if (this.basicForm.solveFor === 'PRICE') {
      const faceValue = Number(this.basicForm.faceValue);
      const couponRatePercent = couponRate * 100;
      const couponFrequency = Number(this.basicForm.couponFrequency);
      const termYears = Number(this.basicForm.termYears);
      const ytmPercent = Number(this.basicForm.ytm);
      this.directError = '';
      this.directResult = null;

      if (
        !Number.isFinite(faceValue) || faceValue <= 0 ||
        !Number.isFinite(couponRatePercent) || couponRatePercent < 0 ||
        ![1, 2, 4, 12].includes(couponFrequency) ||
        !Number.isFinite(termYears) || termYears <= 0 || termYears > 200 ||
        !Number.isFinite(ytmPercent) || ytmPercent <= -couponFrequency * 100
      ) {
        this.directError = 'Vérifiez le nominal, le coupon, la fréquence, l’échéance (maximum 200 ans) et le rendement.';
        return;
      }

      const result = calculateBondScenario({
        faceValue,
        couponRatePercent,
        couponFrequency,
        maturityYears: termYears,
        yieldToMaturityPercent: ytmPercent
      });
      if (!result) {
        this.directError = 'Le prix ne peut pas être calculé avec ces paramètres.';
        return;
      }

      this.directResult = {
        solveFor: 'PRICE',
        faceValue,
        price: result.price,
        ytm: ytmPercent / 100,
        termYears,
        dirtyPrice: result.price,
        accruedInterest: 0,
        accruedDays: 0,
        dayCount: 'N/A',
        macaulayDuration: null,
        modifiedDuration: null,
        convexity: null,
        dv01: null
      };
      return;
    }

    const request: BondDirectPricingRequest = {
      solveFor: this.basicForm.solveFor,
      faceValue: Number(this.basicForm.faceValue),
      couponRate,
      couponFrequency: Number(this.basicForm.couponFrequency),
      price: Number(this.basicForm.price),
      ytm: this.basicForm.solveFor === 'YTM' ? null : Number(this.basicForm.ytm) / 100,
      termYears: this.basicForm.solveFor === 'TERM' ? null : Number(this.basicForm.termYears)
    };
    this.submitDirect(request);
  }

  updateBondScenarioInput(change: { key: keyof BondScenarioInput; value: number }): void {
    switch (change.key) {
      case 'faceValue':
        this.basicForm.faceValue = change.value;
        break;
      case 'couponRatePercent':
        this.basicForm.couponValue = change.value;
        this.basicForm.couponUnit = 'PERCENT';
        break;
      case 'couponFrequency':
        this.basicForm.couponFrequency = change.value;
        break;
      case 'maturityYears':
        this.basicForm.termYears = change.value;
        break;
      case 'yieldToMaturityPercent':
        this.basicForm.ytm = change.value;
        break;
    }
  }

  calculateAdvanced(): void {
    const request: BondDirectPricingRequest = {
      solveFor: this.advancedForm.solveFor,
      faceValue: Number(this.advancedForm.faceValue),
      couponRate: Number(this.advancedForm.couponRate) / 100,
      couponFrequency: Number(this.advancedForm.couponFrequency),
      price: this.advancedForm.solveFor === 'YTM' ? Number(this.advancedForm.marketPrice) : null,
      ytm: this.advancedForm.solveFor === 'PRICE' ? Number(this.advancedForm.ytm) / 100 : null,
      issueDate: this.advancedForm.issueDate,
      maturityDate: this.advancedForm.maturityDate,
      settlementDate: this.advancedForm.settlementDate,
      dayCount: this.advancedForm.dayCount
    };
    this.submitDirect(request);
  }

  resetBasic(): void {
    Object.assign(this.basicForm, {
      solveFor: 'PRICE', faceValue: 100, couponValue: 5, couponUnit: 'PERCENT',
      couponFrequency: 2, price: null, ytm: 6, termYears: 3
    });
    this.directResult = null;
    this.directError = '';
  }

  resetAdvanced(): void {
    Object.assign(this.advancedForm, {
      solveFor: 'PRICE', faceValue: 100, couponRate: 5, couponFrequency: 2,
      issueDate: '2020-10-23', maturityDate: '2029-10-23',
      settlementDate: currentLocalDate(), dayCount: '30/360',
      ytm: 6, marketPrice: null
    });
    this.directResult = null;
    this.directError = '';
  }

  private submitDirect(request: BondDirectPricingRequest): void {
    if (this.isDirectPricing) return;
    this.directError = '';
    this.directResult = null;
    this.isDirectPricing = true;
    this.directPricingWatchdog = setTimeout(() => {
      this.directPricingWatchdog = undefined;
      if (!this.isDirectPricing) return;
      this.directError = 'Le calcul dépasse le délai prévu. Le bouton a été réactivé; vérifiez le backend puis réessayez.';
      this.pricingService.setApiOnline(false);
      this.directPricingSubscription?.unsubscribe();
      this.directPricingSubscription = undefined;
      this.isDirectPricing = false;
      this.cdr.detectChanges();
    }, 2000);
    this.directPricingSubscription = this.comparablesService.priceDirectly(request).pipe(finalize(() => {
      if (this.directPricingWatchdog !== undefined) clearTimeout(this.directPricingWatchdog);
      this.directPricingWatchdog = undefined;
      this.directPricingSubscription = undefined;
      this.isDirectPricing = false;
      if (!this.isDestroyed) this.cdr.detectChanges();
    })).subscribe({
      next: result => {
        this.directResult = result;
        this.pricingService.setApiOnline(true);
        this.cdr.detectChanges();
      },
      error: (error: unknown) => {
        if (error instanceof TimeoutError) {
          this.pricingService.setApiOnline(false);
          this.directError = 'Le backend n’a pas répondu dans les 15 secondes. Le calcul a été réinitialisé.';
        } else if (error instanceof HttpErrorResponse) {
          this.pricingService.setApiOnline(error.status !== 0);
          if (typeof error.error?.message === 'string') {
            this.directError = error.error.message;
          } else if (error.status === 0) {
            this.directError = 'API inaccessible. Vérifiez que le backend répond sur le port 9092.';
          } else {
            this.directError = 'Le calcul obligataire a échoué. Vérifiez les paramètres puis réessayez.';
          }
        } else {
          this.directError = 'Le calcul obligataire a échoué. Vérifiez les paramètres puis réessayez.';
        }
        this.cdr.detectChanges();
      }
    });
  }

  cancelDirectPricing(): void {
    if (!this.isDirectPricing) return;
    this.directError = 'Calcul annulé.';
    if (this.directPricingWatchdog !== undefined) clearTimeout(this.directPricingWatchdog);
    this.directPricingWatchdog = undefined;
    this.directPricingSubscription?.unsubscribe();
    this.directPricingSubscription = undefined;
    this.isDirectPricing = false;
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    if (this.directPricingWatchdog !== undefined) clearTimeout(this.directPricingWatchdog);
    this.directPricingWatchdog = undefined;
    this.directPricingSubscription?.unsubscribe();
    this.directPricingSubscription = undefined;
  }

  async onFileSelected(event: Event, mode: 'light' | 'full'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const generation = ++this.importGeneration;
    this.isImporting = true;
    this.importError = '';
    this.result = null;
    this.lastCalculatedAt = null;
    const timeoutId = this.startImportTimeout(input, generation);

    try {
      this.cdr.detectChanges();
      const imported = await this.readImportRows(file, generation);
      if (!imported || generation !== this.importGeneration) return;
      this.applyImportedRows(imported.rows, imported.xlsx, mode);
    } catch (error) {
      if (generation !== this.importGeneration) return;
      if (mode === 'full') this.fullOptions = [];
      else this.panel = [];
      this.importError = error instanceof Error ? error.message : 'Impossible de lire ce fichier.';
    } finally {
      clearTimeout(timeoutId);
      if (generation === this.importGeneration) {
        this.isImporting = false;
        input.value = '';
        this.persistState();
        this.cdr.detectChanges();
      }
    }
  }

  private startImportTimeout(input: HTMLInputElement, generation: number) {
    return setTimeout(() => {
      if (generation !== this.importGeneration) return;
      this.importGeneration++;
      this.isImporting = false;
      this.importError = 'La lecture dépasse 30 secondes. Vérifiez le fichier puis réessayez.';
      input.value = '';
      this.cdr.detectChanges();
    }, 30000);
  }

  private async readImportRows(
    file: File,
    generation: number
  ): Promise<{ xlsx: typeof import('xlsx-js-style'); rows: Record<string, unknown>[] } | null> {
    if (file.size > 20 * 1024 * 1024) throw new Error('Le fichier dépasse la taille maximale de 20 Mo.');
    const xlsx = window.XLSX;
    const buffer = await file.arrayBuffer();
    if (generation !== this.importGeneration) return null;
    const workbook = xlsx.read(buffer, { type: 'array', cellDates: true, raw: true });
    const masterSheet = workbook.Sheets['Bonds_Master'];
    const firstSheet = masterSheet ?? workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error('Le fichier ne contient aucune feuille.');
    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: null });
    if (!rows.length) throw new Error('Aucune ligne trouvée dans la première feuille.');
    if (masterSheet) this.mergeBondWorkbookSheets(rows, workbook.Sheets, xlsx);
    return { xlsx, rows };
  }

  private mergeBondWorkbookSheets(
    rows: Record<string, unknown>[],
    sheets: Record<string, import('xlsx-js-style').WorkSheet>,
    xlsx: typeof import('xlsx-js-style')
  ): void {
    const bondsById = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const bondId = this.importBondId(row);
      if (bondId) bondsById.set(bondId, row);
    }
    for (const sheetName of ['Pricing_Engine', 'Liquidity', 'FRTB_SA', 'ESG']) {
      this.mergeBondDetailSheet(bondsById, sheets[sheetName], xlsx);
    }
    this.mergeBondNgfsSheet(bondsById, sheets['NGFS'], xlsx);
  }

  private mergeBondDetailSheet(
    bondsById: Map<string, Record<string, unknown>>,
    sheet: import('xlsx-js-style').WorkSheet | undefined,
    xlsx: typeof import('xlsx-js-style')
  ): void {
    if (!sheet) return;
    const detailRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
    for (const detailRow of detailRows) {
      const bond = bondsById.get(this.importBondId(detailRow));
      if (bond) Object.assign(bond, detailRow);
    }
  }

  private mergeBondNgfsSheet(
    bondsById: Map<string, Record<string, unknown>>,
    sheet: import('xlsx-js-style').WorkSheet | undefined,
    xlsx: typeof import('xlsx-js-style')
  ): void {
    if (!sheet) return;
    const impactsByBond = new Map<string, NonNullable<BondComparable['ngfsScenarioImpacts']>>();
    const ngfsRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
    for (const ngfsRow of ngfsRows) {
      const bondId = this.importBondId(ngfsRow);
      const scenario = typeof ngfsRow['Scenario'] === 'string' ? ngfsRow['Scenario'].trim() : '';
      if (!bondId || !scenario || !bondsById.has(bondId)) continue;
      const impacts = impactsByBond.get(bondId) ?? [];
      impacts.push({
        scenario,
        spreadShockBps: this.importNumber(ngfsRow['SpreadShockBps']),
        impact: this.importNumber(ngfsRow['Impact']),
        impactPercent: this.importNumber(ngfsRow['ImpactPercent']),
        dataStatus: typeof ngfsRow['DataStatus'] === 'string' ? ngfsRow['DataStatus'] : undefined
      });
      impactsByBond.set(bondId, impacts);
    }
    for (const [bondId, impacts] of impactsByBond) {
      const bond = bondsById.get(bondId);
      if (bond) bond['ngfsScenarioImpacts'] = impacts;
    }
  }

  private importBondId(row: Record<string, unknown>): string {
    const value = row['BondId'] ?? row['securityId'] ?? row['SecurityId'];
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return this.normalizeKey(String(value));
  }

  private importNumber(value: unknown): number | undefined {
    if (typeof value !== 'number' && typeof value !== 'string') return undefined;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private applyImportedRows(
    rows: Record<string, unknown>[],
    xlsx: typeof import('xlsx-js-style'),
    mode: 'light' | 'full'
  ): void {
    if (mode === 'full') {
      this.validateOptionHeaders(rows[0]);
      this.fullOptions = rows.map((row, index) => this.toOptionImport(row, index, xlsx));
      return;
    }
    this.panel = rows.map((row, index) => this.toComparable(row, index, xlsx));
    this.syncTargetMetadataFromPanel();
  }

  addZeroCurvePoint(): void {
    this.zeroCurvePoints = [...this.zeroCurvePoints, { timeYears: null, zeroRatePercent: null }];
    this.invalidateResult();
    this.persistState();
  }

  removeZeroCurvePoint(index: number): void {
    this.zeroCurvePoints = this.zeroCurvePoints.filter((_, pointIndex) => pointIndex !== index);
    this.invalidateResult();
    this.persistState();
  }

  private buildZeroCurveRequest(): BondComparablesRequest['zeroCurve'] | undefined {
    const enteredPoints = this.zeroCurvePoints.filter(point =>
      point.timeYears != null || point.zeroRatePercent != null
    );
    if (!enteredPoints.length) return null;

    if (enteredPoints.length < 2 || enteredPoints.some(point =>
      point.timeYears == null || !Number.isFinite(point.timeYears) || point.timeYears <= 0 ||
      point.zeroRatePercent == null || !Number.isFinite(point.zeroRatePercent)
    )) {
      this.error = 'Renseignez au moins deux points complets de courbe zéro, avec une maturité positive et un taux en pourcentage.';
      return undefined;
    }

    const points = enteredPoints
      .map(point => ({ timeYears: point.timeYears as number, zeroRate: (point.zeroRatePercent as number) / 100 }))
      .sort((left, right) => left.timeYears - right.timeYears);
    if (points.some((point, index) => index > 0 && point.timeYears === points[index - 1].timeYears)) {
      this.error = 'Chaque maturité de la courbe zéro doit être unique.';
      return undefined;
    }

    return {
      dayCount: this.target.dayCount,
      timesYears: points.map(point => point.timeYears),
      zeroRates: points.map(point => point.zeroRate)
    };
  }

  price(): void {
    if (this.isLoading) return;
    this.error = '';
    const validCouponFrequency = [1, 2, 3, 4, 6, 12].includes(Number(this.target.couponFrequency));
    if (!this.target.securityId.trim() || !this.target.currency.trim() ||
        !Number.isFinite(Number(this.target.faceValue)) || Number(this.target.faceValue) <= 0 ||
        !Number.isFinite(Number(this.target.couponRate)) || Number(this.target.couponRate) < 0 ||
        !validCouponFrequency || !this.target.maturityDate || !this.target.settlementDate || !this.target.dayCount) {
      this.error = 'Complétez l’identifiant, la devise, le nominal, le coupon, la fréquence, l’échéance, le règlement et la convention de jours.';
      return;
    }
    if (!this.panel.length) {
      this.error = 'Importez un panel d’obligations avant de lancer le pricing.';
      return;
    }
    const zeroCurve = this.buildZeroCurveRequest();
    if (zeroCurve === undefined) return;

    this.isLoading = true;
    this.cdr.detectChanges();
    this.comparablesService.price({
      target: {
        securityId: this.target.securityId,
        name: this.target.name,
        currency: this.target.currency,
        faceValue: this.target.faceValue,
        couponRate: Number(this.target.couponRate) / 100,
        couponFrequency: this.target.couponFrequency,
        issueDate: this.target.issueDate || null,
        maturityDate: this.target.maturityDate,
        settlementDate: this.target.settlementDate,
        dayCount: this.target.dayCount,
        issuer: this.target.issuer?.trim() || null,
        rating: this.target.rating?.trim() || null,
        sector: this.target.sector?.trim() || null,
        seniority: this.target.seniority?.trim() || null
      },
      panel: this.panel.map(bond => this.toPricingBond(bond)),
      maturityToleranceMonths: Number(this.maturityToleranceMonths),
      zeroCurve
    }).pipe(finalize(() => {
      this.isLoading = false;
      this.cdr.detectChanges();
    })).subscribe({
      next: result => {
        this.result = result;
        this.lastCalculatedAt = new Date();
        this.persistState();
        this.pricingService.setApiOnline(true);
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.pricingService.setApiOnline(error instanceof HttpErrorResponse && error.status !== 0);
        const serverMessage = typeof error.error?.message === 'string' ? error.error.message : '';
        if (error.status === 0) {
          this.error = 'API inaccessible. Vérifiez que le backend répond sur le port 9092.';
        } else if (error.status === 403) {
          this.error = 'Accès refusé par le backend (403). Vérifiez l’origine CORS autorisée.';
        } else if (serverMessage.startsWith('No eligible comparable bonds in the panel')) {
          this.error = this.noEligibleComparablesMessage(serverMessage);
        } else {
          this.error = serverMessage || 'Le calcul du panel a échoué. Vérifiez les données importées.';
        }
        this.cdr.detectChanges();
      }
    });
  }

  private noEligibleComparablesMessage(serverMessage: string): string {
    const details = serverMessage.match(/\(exclusions: (.*)\)$/)?.[1];
    const labels: Record<string, string> = {
      'Missing bond data': 'données de l’obligation manquantes',
      'Missing security identifier': 'identifiant manquant',
      'Target bond cannot be its own comparable': 'la cible elle-même',
      'Currency differs from target': 'devise différente de la cible',
      'Invalid maturity date': 'échéance invalide ou antérieure au règlement',
      'Invalid yield to maturity': 'YTM absent ou invalide',
      'Missing market data source': 'source de marché manquante',
      'Missing market data as-of date': 'date de cotation manquante',
      'Invalid market data as-of date': 'date de cotation invalide',
      'Market data as-of date is after settlement': 'date de cotation postérieure au règlement',
      'Market data is stale': 'date de cotation trop ancienne',
      'Maturity outside configured tolerance': 'échéance hors tolérance'
    };
    const exclusions = details && details !== 'none'
      ? details.split('; ').map(detail => {
        const match = detail.match(/^(.*) \((\d+)\)$/);
        return match ? `${labels[match[1]] ?? match[1]} : ${match[2]}` : detail;
      })
      : [];

    if (!exclusions.length) {
      return 'Aucun comparable admissible. Vérifiez que le panel contient un titre distinct de la cible, dans la même devise et dans la tolérance d’échéance, avec un YTM, une source et une date de cotation valides.';
    }
    return `Aucun comparable admissible. Motifs d’exclusion (nombre de titres) : ${exclusions.join('; ')}. Vérifiez notamment la source et la date de cotation, la devise et la tolérance d’échéance.`;
  }

  get panelRows(): BondComparableRow[] {
    if (this.result) {
      const importedBonds = new Map(this.panel.map(bond => [bond.securityId, bond]));
      return this.result.panel.map(item => {
        const importedBond = importedBonds.get(item.bond.securityId);
        return {
          ...item.bond,
          issueDate: item.bond.issueDate ?? importedBond?.issueDate,
          settlementDate: item.bond.settlementDate ?? importedBond?.settlementDate,
          couponRate: item.bond.couponRate ?? importedBond?.couponRate,
          couponFrequency: item.bond.couponFrequency ?? importedBond?.couponFrequency,
          couponDataStatus: item.bond.couponDataStatus ?? importedBond?.couponDataStatus,
          cleanPrice: item.bond.cleanPrice ?? importedBond?.cleanPrice,
          cleanPriceDataStatus: item.bond.cleanPriceDataStatus ?? importedBond?.cleanPriceDataStatus,
          liquidityScore: item.bond.liquidityScore ?? importedBond?.liquidityScore,
          liquidityDataStatus: item.bond.liquidityDataStatus ?? importedBond?.liquidityDataStatus,
          eligible: item.eligible,
          selected: item.selected,
          exclusionReason: item.exclusionReason,
          rank: item.rank,
          rankingReasons: item.rankingReasons
        };
      });
    }
    return this.panel.map(bond => ({ ...bond, eligible: null, selected: false, exclusionReason: null }));
  }

  get highestYtmComparable(): BondComparable | null {
    const eligible = this.result?.panel.filter(item => item.eligible) ?? [];
    if (!eligible.length) return null;
    return eligible.reduce((highest, item) => {
      return item.bond.yieldToMaturity > highest.bond.yieldToMaturity ? item : highest;
    }, eligible[0]).bond;
  }

  get filteredPanelRows(): BondComparableRow[] {
    return this.panelRows
      .filter(row => !this.eligibilityFilters.size || [...this.eligibilityFilters].some(filter => this.matchesEligibilityFilter(row, filter)))
      .filter(row => (Object.keys(this.filters) as TextFilterColumn[]).every(column => {
        const filter = this.filters[column].trim().toLocaleLowerCase();
        if (column === 'yieldToMaturity') {
          const yieldPercent = row.yieldToMaturity * 100;
          const minimum = this.yieldMinimum === '' ? null : Number(this.yieldMinimum);
          const maximum = this.yieldMaximum === '' ? null : Number(this.yieldMaximum);
          return (minimum === null || yieldPercent >= minimum) && (maximum === null || yieldPercent <= maximum);
        }
        if (column === 'currency') return !filter || row.currency.toLocaleLowerCase() === filter;
        return !filter || this.columnValue(row, column).toLocaleLowerCase().includes(filter);
      }))
      .sort((left, right) => this.compareRows(left, right, this.sortColumn) * this.sortDirection);
  }

  get filteredFullOptions(): OptionImportRecord[] {
    return this.fullOptions
      .filter(option => this.visibleFullOptionDataColumns.every(column => {
        const filter = this.fullOptionFilters[column]?.trim().toLocaleLowerCase();
        return !filter || String(this.fullOptionValue(option, column) ?? '').toLocaleLowerCase().includes(filter);
      }))
      .slice()
      .sort((left, right) => {
        const leftValue = this.fullOptionValue(left, this.fullOptionSortColumn);
        const rightValue = this.fullOptionValue(right, this.fullOptionSortColumn);
        const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true, sensitivity: 'base' });
        return comparison * this.fullOptionSortDirection;
      });
  }

  get visibleBondColumns(): BondColumn[] {
    return this.bondColumnOrder.filter(column => this.bondVisibleColumns.has(column));
  }

  get visibleBondColumnCount(): number {
    return Math.max(1, this.visibleBondColumns.length);
  }

  bondColumnLabel(column: BondColumn): string {
    return this.bondColumnLabels[column];
  }

  moveBondColumn(column: BondColumn, offset: -1 | 1): void {
    const index = this.bondColumnOrder.indexOf(column);
    const targetIndex = index + offset;
    if (index < 0 || targetIndex < 0 || targetIndex >= this.bondColumnOrder.length) return;
    const nextOrder = [...this.bondColumnOrder];
    [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];
    this.bondColumnOrder = nextOrder;
    this.persistState();
  }

  setBondColumnVisibility(column: BondColumn, event: Event): void {
    const nextVisibleColumns = new Set(this.bondVisibleColumns);
    if ((event.target as HTMLInputElement).checked) nextVisibleColumns.add(column);
    else nextVisibleColumns.delete(column);
    this.bondVisibleColumns = nextVisibleColumns;
    this.persistState();
  }

  selectAllBondColumns(): void {
    this.bondVisibleColumns = new Set(this.bondColumnOrder);
    this.persistState();
  }

  deselectAllBondColumns(): void {
    this.bondVisibleColumns = new Set();
    this.persistState();
  }

  applyDefaultBondColumns(): void {
    this.bondColumnOrder = [...this.bondColumns];
    this.bondVisibleColumns = new Set(this.defaultBondColumns);
    this.persistState();
  }

  toggleAlternateBondRows(): void {
    this.alternateBondRows = !this.alternateBondRows;
    this.persistState();
  }

  get groupedPanelRows(): BondGroup[] {
    const groups = new Map<string, BondGroup>();
    for (const row of this.filteredPanelRows) {
      const values = this.bondGroupColumns.map(column => this.columnValue(row, column) || '—');
      const key = JSON.stringify(values);
      const group = groups.get(key) ?? {
        key,
        label: this.bondGroupColumns.map((column, index) => `${this.bondColumnLabel(column)} : ${values[index]}`).join(' · '),
        rows: []
      };
      group.rows.push(row);
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  startBondColumnDrag(column: BondColumn, event: DragEvent): void {
    event.dataTransfer?.setData('text/plain', `bond-column:${column}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  startBondGroupDrag(column: BondColumn, event: DragEvent): void {
    event.dataTransfer?.setData('text/plain', `bond-group:${column}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  allowBondColumnDrop(event: DragEvent): void {
    event.preventDefault();
    this.isBondGroupingDragOver = true;
    if (event.dataTransfer) event.dataTransfer.dropEffect = event.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy';
  }

  dropBondColumn(event: DragEvent): void {
    event.preventDefault();
    this.isBondGroupingDragOver = false;
    const payload = event.dataTransfer?.getData('text/plain') ?? '';
    const isGroupedColumn = payload.startsWith('bond-group:');
    const column = payload.replace(/^bond-(column|group):/, '') as BondColumn;
    if (!this.bondColumns.includes(column)) return;
    if (isGroupedColumn) {
      this.bondGroupColumns = [...this.bondGroupColumns.filter(groupColumn => groupColumn !== column), column];
    } else if (!this.bondGroupColumns.includes(column)) {
      this.bondGroupColumns = [...this.bondGroupColumns, column];
    }
    this.persistState();
  }

  dropBondGroupColumn(event: DragEvent, targetColumn: BondColumn): void {
    event.preventDefault();
    event.stopPropagation();
    const payload = event.dataTransfer?.getData('text/plain') ?? '';
    const column = payload.replace(/^bond-(column|group):/, '') as BondColumn;
    if (!this.bondColumns.includes(column) || column === targetColumn) return;
    const nextColumns = this.bondGroupColumns.filter(groupColumn => groupColumn !== column);
    const targetIndex = nextColumns.indexOf(targetColumn);
    if (targetIndex === -1) return;
    nextColumns.splice(targetIndex, 0, column);
    this.bondGroupColumns = nextColumns;
    this.persistState();
  }

  isBondGroupCollapsed(key: string): boolean {
    return this.collapsedBondGroups.has(key);
  }

  toggleBondGroup(key: string): void {
    const nextCollapsedGroups = new Set(this.collapsedBondGroups);
    if (nextCollapsedGroups.has(key)) nextCollapsedGroups.delete(key);
    else nextCollapsedGroups.add(key);
    this.collapsedBondGroups = nextCollapsedGroups;
  }

  collapseAllBondGroups(): void {
    this.collapsedBondGroups = new Set(this.groupedPanelRows.map(group => group.key));
  }

  expandAllBondGroups(): void {
    this.collapsedBondGroups = new Set();
  }

  removeBondGroupColumn(column: BondColumn): void {
    this.bondGroupColumns = this.bondGroupColumns.filter(groupColumn => groupColumn !== column);
    this.persistState();
  }

  clearBondGrouping(): void {
    this.bondGroupColumns = [];
    this.persistState();
  }

  get visibleFullOptionDisplayColumns(): FullOptionDisplayColumn[] {
    return this.fullOptionColumnOrder.filter(column => this.fullOptionVisibleColumns.has(column));
  }

  get visibleFullOptionDataColumns(): FullOptionColumn[] {
    return this.visibleFullOptionDisplayColumns.filter((column): column is FullOptionColumn => column !== 'graphs');
  }

  get visibleFullOptionColumnCount(): number {
    return Math.max(1, this.visibleFullOptionDisplayColumns.length);
  }

  fullOptionDisplayLabel(column: FullOptionDisplayColumn): string {
    return column === 'graphs' ? 'Graphiques' : this.fullOptionLabels[column];
  }

  moveFullOptionColumn(column: FullOptionDisplayColumn, offset: -1 | 1): void {
    const index = this.fullOptionColumnOrder.indexOf(column);
    const targetIndex = index + offset;
    if (index < 0 || targetIndex < 0 || targetIndex >= this.fullOptionColumnOrder.length) return;
    const nextOrder = [...this.fullOptionColumnOrder];
    [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];
    this.fullOptionColumnOrder = nextOrder;
    this.persistState();
  }

  setFullOptionColumnVisibility(column: FullOptionDisplayColumn, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const nextVisibleColumns = new Set(this.fullOptionVisibleColumns);
    if (checked) nextVisibleColumns.add(column);
    else nextVisibleColumns.delete(column);
    this.fullOptionVisibleColumns = nextVisibleColumns;
    this.persistState();
  }

  selectAllFullOptionColumns(): void {
    this.fullOptionVisibleColumns = new Set(this.fullOptionColumnOrder);
    this.persistState();
  }

  deselectAllFullOptionColumns(): void {
    this.fullOptionVisibleColumns = new Set();
    this.persistState();
  }

  toggleAlternateFullOptionRows(): void {
    this.alternateFullOptionRows = !this.alternateFullOptionRows;
    this.persistState();
  }

  applyDefaultFullOptionColumns(): void {
    const defaultOrder: FullOptionDisplayColumn[] = [...this.fullOptionColumns, 'graphs'];
    this.fullOptionColumnOrder = defaultOrder;
    this.fullOptionVisibleColumns = new Set([...defaultOrder.slice(0, 10), ...defaultOrder.slice(-3)]);
    this.persistState();
  }

  get groupedFullOptions(): FullOptionGroup[] {
    const groups = new Map<string, FullOptionGroup>();
    for (const option of this.filteredFullOptions) {
      const values = this.fullOptionGroupColumns.map(column => String(this.fullOptionValue(option, column) ?? '—'));
      const key = JSON.stringify(values);
      const group = groups.get(key) ?? {
        key,
        label: this.fullOptionGroupColumns.map((column, index) => `${this.fullOptionLabels[column]} : ${values[index]}`).join(' · '),
        rows: []
      };
      group.rows.push(option);
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  startFullOptionColumnDrag(column: FullOptionColumn, event: DragEvent): void {
    event.dataTransfer?.setData('text/plain', `column:${column}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  startFullOptionGroupDrag(column: FullOptionColumn, event: DragEvent): void {
    event.dataTransfer?.setData('text/plain', `group:${column}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  allowFullOptionColumnDrop(event: DragEvent): void {
    event.preventDefault();
    this.isFullOptionGroupingDragOver = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = event.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy';
    }
  }

  dropFullOptionColumn(event: DragEvent): void {
    event.preventDefault();
    this.isFullOptionGroupingDragOver = false;
    const payload = event.dataTransfer?.getData('text/plain') ?? '';
    const isGroupedColumn = payload.startsWith('group:');
    const column = payload.replace(/^(column|group):/, '') as FullOptionColumn;
    if (!this.fullOptionColumns.includes(column)) return;
    if (isGroupedColumn) {
      this.fullOptionGroupColumns = [...this.fullOptionGroupColumns.filter(groupColumn => groupColumn !== column), column];
      this.persistState();
      return;
    }
    if (this.fullOptionGroupColumns.includes(column)) return;
    this.fullOptionGroupColumns = [...this.fullOptionGroupColumns, column];
    this.persistState();
  }

  dropFullOptionGroupColumn(event: DragEvent, targetColumn: FullOptionColumn): void {
    event.preventDefault();
    event.stopPropagation();
    const payload = event.dataTransfer?.getData('text/plain') ?? '';
    const column = payload.replace(/^(column|group):/, '') as FullOptionColumn;
    if (!this.fullOptionColumns.includes(column) || column === targetColumn) return;

    const nextColumns = this.fullOptionGroupColumns.filter(groupColumn => groupColumn !== column);
    const targetIndex = nextColumns.indexOf(targetColumn);
    if (targetIndex === -1) return;
    nextColumns.splice(targetIndex, 0, column);
    this.fullOptionGroupColumns = nextColumns;
    this.persistState();
  }

  isFullOptionGroupCollapsed(key: string): boolean {
    return this.collapsedFullOptionGroups.has(key);
  }

  toggleFullOptionGroup(key: string): void {
    const nextCollapsedGroups = new Set(this.collapsedFullOptionGroups);
    if (nextCollapsedGroups.has(key)) nextCollapsedGroups.delete(key);
    else nextCollapsedGroups.add(key);
    this.collapsedFullOptionGroups = nextCollapsedGroups;
  }

  collapseAllFullOptionGroups(): void {
    this.collapsedFullOptionGroups = new Set(this.groupedFullOptions.map(group => group.key));
  }

  expandAllFullOptionGroups(): void {
    this.collapsedFullOptionGroups = new Set();
  }

  removeFullOptionGroupColumn(column: FullOptionColumn): void {
    this.fullOptionGroupColumns = this.fullOptionGroupColumns.filter(groupColumn => groupColumn !== column);
    this.persistState();
  }

  clearFullOptionGrouping(): void {
    this.fullOptionGroupColumns = [];
    this.persistState();
  }

  sortFullOptionsBy(column: FullOptionColumn): void {
    if (this.fullOptionSortColumn === column) {
      this.fullOptionSortDirection = this.fullOptionSortDirection === 1 ? -1 : 1;
    } else {
      this.fullOptionSortColumn = column;
      this.fullOptionSortDirection = 1;
    }
    this.persistState();
  }

  fullOptionSortIndicator(column: FullOptionColumn): string {
    if (this.fullOptionSortColumn !== column) return '↕';
    return this.fullOptionSortDirection === 1 ? '↑' : '↓';
  }

  clearFullOptionFilters(): void {
    this.fullOptionFilters = {};
    this.persistState();
  }

  fullOptionCellValue(option: OptionImportRecord, column: FullOptionColumn): string | number | boolean {
    if (column === 'eligible') {
      const eligible = this.fullOptionEligible(option);
      if (eligible === null) return 'À analyser';
      return eligible ? 'Oui' : 'Non';
    }
    return option[column] ?? '—';
  }

  private fullOptionValue(option: OptionImportRecord, column: FullOptionColumn): FullOptionValue {
    if (column === 'eligible') return this.fullOptionCellValue(option, column);
    return option[column as keyof OptionImportRecord];
  }

  private fullOptionEligible(option: OptionImportRecord): boolean | null {
    if (!this.panel.length) return null;
    if (!this.target.securityId || !this.target.currency || !this.target.maturityDate || !this.target.settlementDate) return null;
    if (option.underlyingType !== 'BOND') return false;

    const underlyingId = this.normalizeKey(option.underlyingSecurityId);
    const targetId = this.normalizeKey(this.target.securityId);
    if (underlyingId === targetId) return false;

    const bond = this.panel.find(candidate => this.normalizeKey(candidate.securityId) === underlyingId);
    if (!bond || bond.currency.trim().toUpperCase() !== this.target.currency.trim().toUpperCase()) return false;
    if (!bond.maturityDate || bond.maturityDate <= this.target.settlementDate) return false;
    if (!Number.isFinite(bond.yieldToMaturity) || bond.yieldToMaturity <= -Number(this.target.couponFrequency)) return false;

    const normalizedTargetName = this.normalizeKey(this.target.name);
    const sameName = normalizedTargetName !== '' &&
      normalizedTargetName === this.normalizeKey(bond.name) &&
      bond.maturityDate === this.target.maturityDate &&
      (bond.couponRate == null || Math.abs(Number(this.target.couponRate) / 100 - bond.couponRate) < 1e-8);
    if (sameName) return false;

    const targetMonths = this.monthsBetween(this.target.settlementDate, this.target.maturityDate);
    const bondMonths = this.monthsBetween(this.target.settlementDate, bond.maturityDate);
    return targetMonths !== null && bondMonths !== null && targetMonths >= 0 && bondMonths >= 0 &&
      Math.abs(targetMonths - bondMonths) <= Number(this.maturityToleranceMonths);
  }

  private monthsBetween(startDate: string, endDate: string): number | null {
    const start = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
    const end = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDate);
    if (!start || !end) return null;
    const [startYear, startMonth, startDay] = start.slice(1).map(Number);
    const [endYear, endMonth, endDay] = end.slice(1).map(Number);
    const wholeMonths = (endYear - startYear) * 12 + endMonth - startMonth;
    return wholeMonths - (endDay < startDay ? 1 : 0);
  }

  calculateFullOptionPrices(): void {
    const rows = this.filteredFullOptions.map(option => ({ option, index: this.fullOptions.indexOf(option) }));
    if (!rows.length || this.isFullOptionPricing) return;

    const validRows: Array<{ option: OptionImportRecord; index: number; payload: Record<string, unknown> }> = [];
    const failedRows: Array<{ index: number; price: number | null; status: string }> = [];
    for (const row of rows) {
      try {
        validRows.push({ ...row, payload: this.fullOptionPricingPayload(row.option) });
      } catch (error) {
        failedRows.push({
          index: row.index,
          price: null,
          status: error instanceof Error ? error.message : 'Échec du calcul'
        });
      }
    }

    const batches: typeof validRows[] = [];
    for (let index = 0; index < validRows.length; index += 100) {
      batches.push(validRows.slice(index, index + 100));
    }

    this.isFullOptionPricing = true;
    this.fullOptionPricingSummary = '';
    this.fullOptionPricingProgress = failedRows.length;
    if (failedRows.length) this.applyFullOptionPricingResults(failedRows);
    from(batches).pipe(
      mergeMap(batch => this.pricingService.submitPricingBatch(batch.map(row => row.payload)).pipe(
        map(responses => this.fullOptionBatchResults(batch, responses)),
        catchError(error => of(batch.map(row => ({
          index: row.index,
          price: null,
          status: this.fullOptionBatchErrorMessage(error)
        }))))
      ), 4),
      tap(results => {
        this.applyFullOptionPricingResults(results);
        this.fullOptionPricingProgress += results.length;
      }),
      toArray(),
      finalize(() => {
        this.isFullOptionPricing = false;
        this.persistState();
        this.cdr.detectChanges();
      })
    ).subscribe(batchResults => {
      const results = [...failedRows, ...batchResults.flat()];
      const calculated = results.filter(result => result.price !== null).length;
      this.fullOptionPricingSummary = `${calculated} / ${rows.length} prix calculés`;
    });
  }

  private fullOptionBatchResults(
    batch: Array<{ option: OptionImportRecord; index: number; payload: Record<string, unknown> }>,
    responses: PricingBatchItemResult[]
  ): Array<{ index: number; price: number | null; status: string }> {
    const responseById = new Map(responses.map(response => [response.request_id, response]));
    return batch.map(row => {
      const response = responseById.get(row.option.optionId);
      const price = response?.response?.result?.['price'];
      return typeof price === 'number' && Number.isFinite(price)
        ? { index: row.index, price, status: 'Calculé' }
        : { index: row.index, price: null, status: response?.error || 'Prix absent de la réponse de pricing' };
    });
  }

  private fullOptionBatchErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') return error.error.message;
    if (error instanceof Error) return error.message;
    return 'Échec du lot de pricing';
  }

  private applyFullOptionPricingResults(results: Array<{ index: number; price: number | null; status: string }>): void {
    const updated = [...this.fullOptions];
    for (const result of results) {
      updated[result.index] = {
        ...updated[result.index],
        calculatedPremiumPerUnit: result.price,
        pricingStatus: result.status
      };
    }
    this.fullOptions = updated;
  }

  async exportFullOptions(format: LightExportFormat): Promise<void> {
    if (!this.filteredFullOptions.length || this.isFullOptionsExporting) return;

    this.isFullOptionsExporting = true;
    this.fullOptionsExportError = '';
    this.fullOptionsExportSuccess = '';
    try {
      if (format === 'csv') this.downloadFullOptionsCsv();
      if (format === 'xlsx') this.downloadFullOptionsXlsx();
      if (format === 'pdf') await this.downloadFullOptionsPdf();
      this.fullOptionsExportSuccess = `Le fichier ${format.toUpperCase()} a été téléchargé.`;
    } catch {
      this.fullOptionsExportError = `L’export ${format.toUpperCase()} a échoué. Vérifiez le navigateur puis réessayez.`;
    } finally {
      this.isFullOptionsExporting = false;
      this.cdr.detectChanges();
    }
  }

  private fullOptionsExportFileName(extension: LightExportFormat): string {
    const fileDate = new Date().toISOString().slice(0, 10);
    return `comparables-full-${fileDate}.${extension}`;
  }

  private downloadFullOptionsXlsx(): void {
    const XLSX = window.XLSX;
    const worksheet = XLSX.utils.json_to_sheet(this.fullOptionsExportRows(), { header: [...this.fullOptionColumns] });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comparables full');
    XLSX.writeFile(workbook, this.fullOptionsExportFileName('xlsx'), { bookType: 'xlsx' });
  }

  private downloadFullOptionsCsv(): void {
    const XLSX = window.XLSX;
    const worksheet = XLSX.utils.json_to_sheet(this.fullOptionsExportRows(), { header: [...this.fullOptionColumns] });
    const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: ';' });
    this.downloadBlob(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), this.fullOptionsExportFileName('csv'));
  }

  private async downloadFullOptionsPdf(): Promise<void> {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
    document.setFontSize(14);
    document.text('Comparables full', 10, 12);
    document.setFontSize(8);
    document.text(`${this.filteredFullOptions.length} options exportees`, 10, 18);
    autoTable(document, {
      startY: 22,
      head: [[...this.fullOptionColumns]],
      body: this.filteredFullOptions.map(option => this.fullOptionColumns.map(column => String(this.fullOptionValue(option, column) ?? ''))),
      styles: { fontSize: 5, cellPadding: 1.2, overflow: 'linebreak' },
      headStyles: { fillColor: [35, 75, 56], fontSize: 5 },
      horizontalPageBreak: true,
      horizontalPageBreakRepeat: 0,
      margin: { left: 8, right: 8, top: 22, bottom: 10 }
    });
    document.save(this.fullOptionsExportFileName('pdf'));
  }

  private fullOptionsExportRows(): Record<string, unknown>[] {
    return this.filteredFullOptions.map(option => Object.fromEntries(
      this.fullOptionColumns.map(column => [column, this.fullOptionValue(option, column)])
    ));
  }

  private fullOptionPricingPayload(option: OptionImportRecord): Record<string, unknown> {
    if (option.exerciseStyle === 'BERMUDAN') {
      throw new Error('Calendrier d’exercice Bermudan absent des données importées');
    }
    const valuationTime = Date.parse(`${option.valuationDate}T00:00:00Z`);
    const expirationTime = Date.parse(`${option.expirationDate}T00:00:00Z`);
    const maturityYears = (expirationTime - valuationTime) / (365 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(maturityYears) || maturityYears <= 0) {
      throw new Error('Dates de valorisation ou d’expiration invalides');
    }

    const payload = this.pricingService.buildPayload('EQTY_OPT', {
      request_id: option.optionId,
      security_id: option.underlyingSecurityId,
      security_name: option.underlyingSecurityId,
      curve_name: `${option.currency}-RFR`,
      market_data_source: option.dataSource,
      pricing_model: option.exerciseStyle === 'EUROPEAN' ? 'BLACK_SCHOLES' : 'BINOMIAL',
      underlying_spot: option.underlyingSpot,
      risk_free_rate: option.riskFreeRate * 100,
      implied_volatility: option.volatility * 100,
      dividend_yield: option.dividendYield * 100,
      strike: option.strikePrice,
      maturity_years: maturityYears,
      option_type: option.optionType,
      exercise_style: option.exerciseStyle
    });
    return payload;
  }

  sortBy(column: BondColumn): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 1 ? -1 : 1;
    } else {
      this.sortColumn = column;
      this.sortDirection = column === 'yieldToMaturity' ? -1 : 1;
    }
    this.persistState();
  }

  sortIndicator(column: BondColumn): string {
    if (this.sortColumn !== column) return '↕';
    return this.sortDirection === 1 ? '↑' : '↓';
  }

  sourceLabel(row: BondComparable): string {
    const source = row.source ?? '';
    return source.replace(/\s*[\/|]\s*\d{4}-\d{2}-\d{2}$/, '').trim() || source;
  }

  sourceDate(row: BondComparable): string {
    return this.sourceDateValue(row) || 'Date inconnue';
  }

  private sourceDateValue(row: BondComparable): string {
    return row.asOf ?? row.source?.match(/(?:^|\s[\/|]\s*)(\d{4}-\d{2}-\d{2})$/)?.[1] ?? '';
  }

  clearFilters(): void {
    for (const column of Object.keys(this.filters) as TextFilterColumn[]) this.filters[column] = '';
    this.eligibilityFilters = new Set();
    this.yieldMinimum = '';
    this.yieldMaximum = '';
    this.persistState();
  }

  toggleEligibilityFilter(value: EligibilityFilter, event: Event): void {
    const nextFilters = new Set(this.eligibilityFilters);
    if ((event.target as HTMLInputElement).checked) nextFilters.add(value);
    else nextFilters.delete(value);
    this.eligibilityFilters = nextFilters;
    this.persistState();
  }

  get eligibilityFilterLabel(): string {
    const count = this.eligibilityFilters.size;
    if (count === 0) return 'Toutes';
    if (count === 1) return '1 sélectionné';
    return `${count} sélectionnés`;
  }

  invalidateResult(): void {
    this.result = null;
    this.lastCalculatedAt = null;
    this.persistState();
  }

  onFormSubmit(event: Event): void {
    event.preventDefault();
    this.price();
  }

  async exportLightOptions(format: LightExportFormat): Promise<void> {
    if (!this.filteredPanelRows.length || this.isExporting) return;

    this.isExporting = true;
    this.exportError = '';
    this.exportSuccess = '';
    try {
      if (format === 'xlsx') this.downloadLightXlsx();
      if (format === 'csv') this.downloadLightCsv();
      if (format === 'pdf') await this.downloadLightPdf();
      this.exportSuccess = `Le fichier ${format.toUpperCase()} a été téléchargé.`;
    } catch {
      this.exportError = `L’export ${format.toUpperCase()} a échoué. Réessayez ou vérifiez le navigateur.`;
    } finally {
      this.isExporting = false;
      this.cdr.detectChanges();
    }
  }

  private exportFileName(extension: LightExportFormat): string {
    const targetId = this.target.securityId?.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'panel';
    const fileDate = new Date().toISOString().slice(0, 10);
    return `bond-comparables-${targetId}-${fileDate}.${extension}`;
  }

  private downloadLightXlsx(): void {
    const XLSX = window.XLSX;
    const workbook = XLSX.utils.book_new();
    this.appendPanelSheet(XLSX, workbook);
    this.appendPricingSheet(XLSX, workbook);
    XLSX.writeFile(workbook, this.exportFileName('xlsx'));
  }

  private downloadLightCsv(): void {
    const XLSX = window.XLSX;
    const worksheet = XLSX.utils.json_to_sheet(this.filteredPanelRows.map(row => ({
      Identifiant: row.securityId,
      Nom: row.name,
      Emetteur: row.issuer ?? '',
      Devise: row.currency,
      Emission: row.issueDate ?? '',
      Reglement: row.settlementDate ?? this.target.settlementDate,
      Echeance: row.maturityDate,
      Notation: row.rating ?? '',
      YTM: `${(row.yieldToMaturity * 100).toFixed(3)}%`,
      PrixMarche: row.marketPrice ?? '',
      Source: this.sourceLabel(row),
      DateDonnees: this.sourceDateValue(row),
      Eligible: row.eligible ?? '',
      Retenu: row.selected,
      MotifExclusion: row.exclusionReason ?? ''
    })));
    const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: ';' });
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    this.downloadBlob(blob, this.exportFileName('csv'));
  }

  private async downloadLightPdf(): Promise<void> {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    document.setFontSize(15);
    document.text('Comparables obligataires', 12, 14);
    document.setFontSize(9);
    document.text(`Cible : ${this.target.securityId || 'Panel'} | Reglement : ${this.target.settlementDate || '-'}`, 12, 20);
    autoTable(document, {
      startY: 25,
      head: [['Obligation', 'Nom', 'Emetteur', 'Devise', 'Emission', 'Reglement', 'Echeance', 'Notation', 'YTM', 'Source', 'Date donnees']],
      body: this.filteredPanelRows.map(row => [
        row.securityId, row.name, row.issuer ?? '', row.currency, row.issueDate ?? '', row.settlementDate ?? this.target.settlementDate,
        row.maturityDate, row.rating ?? '', `${(row.yieldToMaturity * 100).toFixed(3)}%`, this.sourceLabel(row), this.sourceDateValue(row)
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [35, 75, 56] },
      margin: { left: 10, right: 10 }
    });
    document.save(this.exportFileName('pdf'));
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private appendPanelSheet(xlsx: typeof import('xlsx-js-style'), workbook: import('xlsx-js-style').WorkBook): void {
    const rows = this.filteredPanelRows.map(row => ({
        Identifiant: row.securityId,
        Nom: row.name,
        Emetteur: row.issuer ?? '',
        Devise: row.currency,
        Emission: row.issueDate ? new Date(`${row.issueDate}T00:00:00`) : '',
        Reglement: (row.settlementDate ?? this.target.settlementDate) ? new Date(`${row.settlementDate ?? this.target.settlementDate}T00:00:00`) : '',
        Echeance: new Date(`${row.maturityDate}T00:00:00`),
        Notation: row.rating ?? '',
        YTM: row.yieldToMaturity,
        PrixMarche: row.marketPrice ?? '',
        Source: this.sourceLabel(row),
        DateDonnees: this.sourceDateValue(row) ? new Date(`${this.sourceDateValue(row)}T00:00:00`) : '',
        Eligible: row.eligible ?? '',
        Retenu: row.selected,
        MotifExclusion: row.exclusionReason ?? ''
    }));
    const sheet = xlsx.utils.json_to_sheet(rows);
    sheet['!cols'] = [
      { wch: 24 }, { wch: 30 }, { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 38 }
    ];
    this.stylePanelSheet(xlsx, sheet);
    xlsx.utils.book_append_sheet(workbook, sheet, 'Panel');
  }

  private stylePanelSheet(xlsx: typeof import('xlsx-js-style'), sheet: import('xlsx-js-style').WorkSheet): void {
    const range = xlsx.utils.decode_range(sheet['!ref'] ?? 'A1');
    for (let column = 0; column <= range.e.c; column++) {
      const header = sheet[xlsx.utils.encode_cell({ r: 0, c: column })];
      if (header) header.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '234B38' } } };
    }
    for (let row = 1; row <= range.e.r; row++) {
      const yieldCell = sheet[xlsx.utils.encode_cell({ r: row, c: 8 })];
      if (yieldCell) yieldCell.z = '0.00%';
      const marketPriceCell = sheet[xlsx.utils.encode_cell({ r: row, c: 9 })];
      if (marketPriceCell && typeof marketPriceCell.v === 'number') marketPriceCell.z = '0.0000';
      for (const column of [4, 5, 6, 11]) {
        const dateCell = sheet[xlsx.utils.encode_cell({ r: row, c: column })];
        if (dateCell?.t === 'd') dateCell.z = 'dd/mm/yyyy';
      }
      const asOfCell = sheet[xlsx.utils.encode_cell({ r: row, c: 11 })];
      if (asOfCell?.t === 'd') asOfCell.z = 'dd/mm/yyyy';
    }
  }

  private appendPricingSheet(xlsx: typeof import('xlsx-js-style'), workbook: import('xlsx-js-style').WorkBook): void {
    if (!this.result) return;
    const summary = [{
      Cible: this.target.securityId,
      Devise: this.result.currency,
      ComparableRetenu: this.result.bestYieldSecurityId,
      YTMApplique: this.result.appliedYield,
      PrixClean: this.result.valuation.cleanPrice,
      PrixDirty: this.result.valuation.dirtyPrice,
      InteretsCourus: this.result.valuation.accruedInterest,
      JoursCourus: this.result.valuation.accruedDays,
      DayCount: this.result.valuation.dayCount,
      ToleranceEcheanceMois: this.result.maturityToleranceMonths,
      EcheanceCible: new Date(`${this.target.maturityDate}T00:00:00`),
      DateReglement: new Date(`${this.target.settlementDate}T00:00:00`),
      DateCalcul: this.lastCalculatedAt ?? ''
    }];
    const sheet = xlsx.utils.json_to_sheet(summary);
    sheet['!cols'] = [
      { wch: 24 }, { wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 },
      { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 20 }
    ];
    for (const [cell, format] of [
      ['D2', '0.00%'], ['E2', '0.0000'], ['F2', '0.0000'], ['G2', '0.0000'],
      ['K2', 'dd/mm/yyyy'], ['L2', 'dd/mm/yyyy'], ['M2', 'dd/mm/yyyy hh:mm']
    ] as const) {
      if (sheet[cell]) sheet[cell].z = format;
    }
    xlsx.utils.book_append_sheet(workbook, sheet, 'Pricing');
  }

  get currencies(): string[] {
    return [...new Set([
      ...this.commonCurrencies,
      this.target.currency.trim().toUpperCase(),
      ...this.panel.map(bond => bond.currency.trim().toUpperCase())
    ].filter(Boolean))].sort((left, right) => left.localeCompare(right));
  }

  selectTarget(securityId: string): void {
    const bond = this.panel.find(item => item.securityId === securityId);
    if (!bond) return;

    if (!this.selectedBondIdsForCompare.has(securityId)) {
      if (this.selectedBondIdsForCompare.size >= 5) {
        const first = this.selectedBondIdsForCompare.values().next().value;
        if (first) this.selectedBondIdsForCompare.delete(first);
      }
      this.selectedBondIdsForCompare.add(securityId);
    }

    this.applyTargetBondToPricingForms(bond);

    this.target = {
      ...this.target,
      securityId: bond.securityId,
      name: bond.name || bond.securityId,
      currency: bond.currency.toUpperCase(),
      issueDate: bond.issueDate ?? '',
      maturityDate: bond.maturityDate,
      settlementDate: bond.settlementDate ?? currentLocalDate(),
      faceValue: bond.faceValue ?? this.target.faceValue,
      couponRate: bond.couponRate == null ? this.target.couponRate : this.normalizePercent(bond.couponRate),
      couponFrequency: bond.couponFrequency ?? this.target.couponFrequency,
      issuer: bond.issuer ?? '',
      rating: bond.rating ?? '',
      sector: bond.sector ?? '',
      seniority: bond.seniority ?? ''
    };
    this.result = null;
    this.lastCalculatedAt = null;
    this.error = '';
    this.persistState();
    if (this.activeMode === 'basic') this.calculateBasic();
    else if (this.activeMode === 'advanced') this.calculateAdvanced();
  }

  private applyTargetBondToPricingForms(bond: BondComparable): void {
    const faceValue = bond.faceValue ?? this.target.faceValue;
    const couponRate = bond.couponRate == null ? null : this.normalizePercent(bond.couponRate);
    const yieldToMaturity = Number.isFinite(bond.yieldToMaturity) ? this.normalizePercent(bond.yieldToMaturity) : null;
    const maturityTime = Date.parse(`${bond.maturityDate}T00:00:00Z`);
    const todayTime = Date.parse(`${currentLocalDate()}T00:00:00Z`);
    const maturityYears = Number.isFinite(maturityTime) && maturityTime > todayTime
      ? (maturityTime - todayTime) / (365.25 * 24 * 60 * 60 * 1000)
      : null;

    this.directCurrency = bond.currency.toUpperCase();
    this.basicForm.faceValue = faceValue;
    if (couponRate !== null) {
      this.basicForm.couponValue = couponRate;
      this.basicForm.couponUnit = 'PERCENT';
    }
    if (bond.couponFrequency != null) this.basicForm.couponFrequency = bond.couponFrequency;
    if (yieldToMaturity !== null) this.basicForm.ytm = yieldToMaturity;
    if (maturityYears !== null) this.basicForm.termYears = maturityYears;

    this.advancedForm.faceValue = faceValue;
    if (couponRate !== null) this.advancedForm.couponRate = couponRate;
    if (bond.couponFrequency != null) this.advancedForm.couponFrequency = bond.couponFrequency;
    if (bond.issueDate) this.advancedForm.issueDate = bond.issueDate;
    this.advancedForm.maturityDate = bond.maturityDate;
    this.advancedForm.settlementDate = bond.settlementDate ?? currentLocalDate();
    if (yieldToMaturity !== null) this.advancedForm.ytm = yieldToMaturity;
  }

  private normalizePercent(value: number): number {
    return Math.abs(value) <= 1 ? value * 100 : value;
  }

  private toPricingBond(bond: BondComparable): BondComparable {
    const pricingBond = { ...bond };
    delete pricingBond.settlementDate;
    return pricingBond;
  }

  private restoreState(): void {
    try {
      const serialized = localStorage.getItem(this.storageKey);
      if (!serialized) return;

      const state = JSON.parse(serialized) as Partial<PersistedBondComparablesState>;
      if (state.version !== 1) return;
      this.restoreTargetAndPanel(state);
      this.restorePricingResult(state);
      this.restoreFilters(state);
      this.restoreSorting(state);
    } catch {
      this.result = null;
      this.lastCalculatedAt = null;
    }
  }

  private restoreTargetAndPanel(state: Partial<PersistedBondComparablesState>): void {
    if (state.target && typeof state.target === 'object') this.target = { ...this.target, ...state.target };
    if (Array.isArray(state.panel)) this.panel = state.panel;
    if (Array.isArray(state.zeroCurvePoints)) this.zeroCurvePoints = state.zeroCurvePoints;
    this.syncTargetMetadataFromPanel();
    if (Array.isArray(state.fullOptions)) this.fullOptions = state.fullOptions;
    if (typeof state.maturityToleranceMonths === 'number' && Number.isFinite(state.maturityToleranceMonths)) {
      this.maturityToleranceMonths = state.maturityToleranceMonths;
    }
  }

  private syncTargetMetadataFromPanel(): void {
    const bond = this.targetPanelBond;
    if (!bond) return;

    this.target = {
      ...this.target,
      issuer: this.target.issuer?.trim() || bond.issuer || '',
      rating: this.target.rating?.trim() || bond.rating || '',
      sector: this.target.sector?.trim() || bond.sector || '',
      seniority: this.target.seniority?.trim() || bond.seniority || ''
    };
  }

  formatCalendarDate(value: string | null | undefined): string {
    if (!value) return '—';
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    return match?.[1] ?? value;
  }

  private restorePricingResult(state: Partial<PersistedBondComparablesState>): void {
    const valuation = state.result?.valuation;
    const metrics = valuation && [
      valuation.ytm,
      valuation.macaulayDuration,
      valuation.modifiedDuration,
      valuation.convexity,
      valuation.dv01
    ];
    if (state.result && Array.isArray(state.result.panel) && metrics?.every(Number.isFinite)) {
      this.result = state.result;
    } else {
      this.result = null;
      this.lastCalculatedAt = null;
      return;
    }
    if (typeof state.lastCalculatedAt !== 'string') return;

    const calculatedAt = new Date(state.lastCalculatedAt);
    this.lastCalculatedAt = Number.isNaN(calculatedAt.getTime()) ? null : calculatedAt;
  }

  private restoreFilters(state: Partial<PersistedBondComparablesState>): void {
    this.restoreTextFilters(state);
    if (Array.isArray(state.eligibilityFilters)) {
      this.eligibilityFilters = new Set(state.eligibilityFilters.filter(value =>
        this.eligibilityOptions.some(option => option.value === value)
      ));
    }
    this.restoreYieldFilters(state);
    this.restoreBondTablePreferences(state);
    this.restoreFullOptionFilters(state);
    this.restoreFullOptionGrouping(state);
    this.restoreFullOptionColumnPreferences(state);
  }

  private restoreTextFilters(state: Partial<PersistedBondComparablesState>): void {
    if (!state.filters || typeof state.filters !== 'object') return;
    for (const column of Object.keys(this.filters) as TextFilterColumn[]) {
      if (typeof state.filters[column] === 'string') this.filters[column] = state.filters[column];
    }
  }

  private restoreYieldFilters(state: Partial<PersistedBondComparablesState>): void {
    if (typeof state.yieldMinimum === 'string') this.yieldMinimum = state.yieldMinimum;
    if (typeof state.yieldMaximum === 'string') this.yieldMaximum = state.yieldMaximum;
  }

  private restoreFullOptionFilters(state: Partial<PersistedBondComparablesState>): void {
    if (!state.fullOptionFilters || typeof state.fullOptionFilters !== 'object') return;
    for (const column of this.fullOptionColumns) {
      const value = state.fullOptionFilters[column];
      if (typeof value === 'string') this.fullOptionFilters[column] = value;
    }
  }

  private restoreFullOptionGrouping(state: Partial<PersistedBondComparablesState>): void {
    if (Array.isArray(state.fullOptionGroupColumns)) {
      this.fullOptionGroupColumns = [...new Set(state.fullOptionGroupColumns.filter(column =>
        this.fullOptionColumns.includes(column)
      ))];
    }
  }

  private restoreFullOptionColumnPreferences(state: Partial<PersistedBondComparablesState>): void {
    if (typeof state.alternateFullOptionRows === 'boolean') {
      this.alternateFullOptionRows = state.alternateFullOptionRows;
    }
    if (Array.isArray(state.fullOptionColumnOrder)) {
      const restoredOrder = [...new Set(state.fullOptionColumnOrder.filter(column => this.isFullOptionDisplayColumn(column)))];
      this.fullOptionColumnOrder = [...restoredOrder, ...this.fullOptionColumnOrder.filter(column => !restoredOrder.includes(column))];
    }
    if (Array.isArray(state.fullOptionVisibleColumns)) {
      const visibleColumns = state.fullOptionVisibleColumns.filter(column => this.isFullOptionDisplayColumn(column));
      if (!state.fullOptionVisibleColumns.includes('eligible')) visibleColumns.push('eligible');
      this.fullOptionVisibleColumns = new Set(visibleColumns);
    }
  }

  private restoreBondTablePreferences(state: Partial<PersistedBondComparablesState>): void {
    if (Array.isArray(state.bondGroupColumns)) {
      this.bondGroupColumns = [...new Set(state.bondGroupColumns.filter(column => this.bondColumns.includes(column)))];
    }
    if (typeof state.alternateBondRows === 'boolean') this.alternateBondRows = state.alternateBondRows;
    if (Array.isArray(state.bondColumnOrder)) {
      const restoredOrder = [...new Set(state.bondColumnOrder.filter(column => this.bondColumns.includes(column)))];
      this.bondColumnOrder = [...restoredOrder, ...this.bondColumnOrder.filter(column => !restoredOrder.includes(column))];
    }
    if (Array.isArray(state.bondVisibleColumns)) {
      this.bondVisibleColumns = new Set(state.bondVisibleColumns.filter(column => this.bondColumns.includes(column)));
    }
  }

  private isFullOptionDisplayColumn(value: unknown): value is FullOptionDisplayColumn {
    return value === 'graphs' || (typeof value === 'string' && this.fullOptionColumns.includes(value as FullOptionColumn));
  }

  private restoreSorting(state: Partial<PersistedBondComparablesState>): void {
    const columns = this.bondColumns;
    if (columns.includes(state.sortColumn as BondColumn)) this.sortColumn = state.sortColumn as BondColumn;
    if (state.sortDirection === 1 || state.sortDirection === -1) this.sortDirection = state.sortDirection;
    if (this.fullOptionColumns.includes(state.fullOptionSortColumn as FullOptionColumn)) {
      this.fullOptionSortColumn = state.fullOptionSortColumn as FullOptionColumn;
    }
    if (state.fullOptionSortDirection === 1 || state.fullOptionSortDirection === -1) {
      this.fullOptionSortDirection = state.fullOptionSortDirection;
    }
  }

  persistState(): void {
    const state: PersistedBondComparablesState = {
      version: 1,
      target: this.target,
      panel: this.panel,
      fullOptions: this.fullOptions,
      result: this.result,
      lastCalculatedAt: this.lastCalculatedAt?.toISOString() ?? null,
      zeroCurvePoints: this.zeroCurvePoints,
      maturityToleranceMonths: this.maturityToleranceMonths,
      filters: this.filters,
      eligibilityFilters: [...this.eligibilityFilters],
      yieldMinimum: this.yieldMinimum,
      yieldMaximum: this.yieldMaximum,
      sortColumn: this.sortColumn,
      sortDirection: this.sortDirection,
      fullOptionFilters: this.fullOptionFilters,
      fullOptionSortColumn: this.fullOptionSortColumn,
      fullOptionSortDirection: this.fullOptionSortDirection,
      fullOptionGroupColumns: this.fullOptionGroupColumns,
      fullOptionColumnOrder: this.fullOptionColumnOrder,
      fullOptionVisibleColumns: [...this.fullOptionVisibleColumns],
      alternateFullOptionRows: this.alternateFullOptionRows,
      bondGroupColumns: this.bondGroupColumns,
      bondColumnOrder: this.bondColumnOrder,
      bondVisibleColumns: [...this.bondVisibleColumns],
      alternateBondRows: this.alternateBondRows
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch {
      return;
    }
  }

  private toComparable(row: Record<string, unknown>, index: number, xlsx: typeof import('xlsx-js-style')): BondComparable {
    const values = new Map(Object.entries(row).map(([key, value]) => [this.normalizeKey(key), value]));
    const asText = (value: unknown): string => {
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return '';
    };
    const text = (...keys: string[]): string => {
      for (const key of keys) {
        const value = asText(values.get(this.normalizeKey(key)));
        if (value) return value;
      }
      return '';
    };
    const requiredText = (label: string, ...keys: string[]): string => {
      const value = text(...keys);
      if (!value) throw new Error(`Ligne ${index + 2} : colonne ${label} manquante.`);
      return value;
    };
    const hasDateValue = (...keys: string[]): boolean => keys.some(key => {
      const value = values.get(this.normalizeKey(key));
      return value !== null && value !== undefined && !(typeof value === 'string' && !value.trim());
    });
    const rate = (label: string, ...keys: string[]): number => {
      const value = text(...keys);
      if (!value) throw new Error(`Ligne ${index + 2} : colonne ${label} manquante.`);
      const hasPercent = value.endsWith('%');
      const parsed = Number(value.replace(/%$/, '').replace(',', '.'));
      if (!Number.isFinite(parsed)) throw new Error(`Ligne ${index + 2} : ${label} doit être un nombre.`);
      return hasPercent || Math.abs(parsed) > 1 ? parsed / 100 : parsed;
    };
    const dateValue = (label: string, ...keys: string[]): string => {
      const raw = keys.map(key => values.get(this.normalizeKey(key))).find(value => value !== null && value !== undefined);
      if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`;
      }
      if (typeof raw === 'number') {
        const date = xlsx.SSF.parse_date_code(raw);
        if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
      const value = asText(raw);
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      const europeanDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
      if (europeanDate) {
        return `${europeanDate[3]}-${europeanDate[2].padStart(2, '0')}-${europeanDate[1].padStart(2, '0')}`;
      }
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      throw new Error(`Ligne ${index + 2} : ${label} invalide, format attendu AAAA-MM-JJ.`);
    };
    const issueDate = hasDateValue('emissionDate', 'issueDate')
      ? dateValue('date d’émission', 'emissionDate', 'issueDate')
      : undefined;
    const settlementDate = hasDateValue('settlementDate', 'dateSettlement', 'date de règlement')
      ? dateValue('date de règlement', 'settlementDate', 'dateSettlement', 'date de règlement')
      : undefined;
    const sourceText = text('source');
    const sourceDate = sourceText.match(/\s*[\/|]\s*(\d{4}-\d{2}-\d{2})$/);
    const optionalNumber = (...keys: string[]): number | undefined => {
      const value = text(...keys);
      if (!value) return undefined;
      const normalizedValue = value.trim().toLowerCase().replace(',', '.');
      const suffixes = ['bps', 'bp', '%', 'eur', 'usd', '€'];
      const suffix = suffixes.find(candidate => normalizedValue.endsWith(candidate));
      const numericValue = suffix
        ? normalizedValue.slice(0, -suffix.length).trim().replaceAll(' ', '')
        : normalizedValue.replaceAll(' ', '');
      const parsed = Number(numericValue);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const couponFrequencyText = this.normalizeKey(text(
      'couponFrequency', 'frequency', 'couponsPerYear', 'coupons par an', 'fréquence coupon', 'fréquence des coupons'
    ));
    const frequencyByLabel: Record<string, number> = {
      annuel: 1, annuelle: 1, annual: 1, annually: 1,
      semestriel: 2, semestrielle: 2, semiannual: 2, semiannually: 2,
      trimestriel: 4, trimestrielle: 4, quarterly: 4,
      mensuel: 12, mensuelle: 12, monthly: 12
    };
    const couponFrequency = optionalNumber(
      'couponFrequency', 'frequency', 'couponsPerYear', 'coupons par an', 'fréquence coupon', 'fréquence des coupons'
    ) ?? frequencyByLabel[couponFrequencyText];
    const liquidityValue = this.normalizeKey(text('liquidity', 'liquidityClass', 'classeLiquidite', 'liquidite'));
    let liquidity: BondComparable['liquidity'];
    if (['elevee', 'high'].includes(liquidityValue)) liquidity = 'Élevée';
    else if (['moyenne', 'medium'].includes(liquidityValue)) liquidity = 'Moyenne';
    else if (['faible', 'low'].includes(liquidityValue)) liquidity = 'Faible';
    const greenBondValue = this.normalizeKey(text('isGreenBond', 'greenBond', 'obligationVerte'));
    let isGreenBond: boolean | undefined;
    if (['true', 'yes', 'oui', '1'].includes(greenBondValue)) isGreenBond = true;
    else if (['false', 'no', 'non', '0'].includes(greenBondValue)) isGreenBond = false;
    const faceValue = optionalNumber('faceValue', 'nominal') ?? 100;
    const rawCleanPrice = optionalNumber('cleanPrice', 'cleanPriceDCF', 'prix clean');
    const cleanPrice = rawCleanPrice == null
      ? undefined
      : rawCleanPrice / (faceValue > 1000 ? faceValue : 100) * 100;
    const rawZSpread = optionalNumber('zSpread');
    let rawZSpreadBps: number | undefined;
    if (rawZSpread != null) rawZSpreadBps = Math.abs(rawZSpread) <= 1 ? rawZSpread * 10000 : rawZSpread;
    const zSpread = optionalNumber('zSpreadBps', 'z-spread (bp)', 'z-spread en pb') ?? rawZSpreadBps;
    const spreadBps = optionalNumber('spreadBps', 'spread (bp)', 'spread en pb');
    const esgAgencyScores = ['MSCI', 'Sustainalytics', 'ISS', 'SP_ESG', 'Moodys_ESG']
      .map(provider => optionalNumber(provider))
      .filter((score): score is number => score != null);
    const esgScore = optionalNumber('esgScore', 'scoreESG', 'score ESG')
      ?? (esgAgencyScores.length
        ? esgAgencyScores.reduce((total, score) => total + score, 0) / esgAgencyScores.length
        : undefined);
    const rawNgfsImpacts = values.get(this.normalizeKey('ngfsScenarioImpacts'));
    let parsedNgfsImpacts: unknown = rawNgfsImpacts;
    if (typeof rawNgfsImpacts === 'string') {
      try {
        parsedNgfsImpacts = JSON.parse(rawNgfsImpacts);
      } catch {
        parsedNgfsImpacts = undefined;
      }
    }
    const ngfsScenarioImpacts = Array.isArray(parsedNgfsImpacts)
      ? parsedNgfsImpacts.flatMap((value: unknown) => {
        if (!value || typeof value !== 'object') return [];
        const impact = value as Record<string, unknown>;
        const scenario = typeof impact['scenario'] === 'string' ? impact['scenario'].trim() : '';
        const impactPercent = this.importNumber(impact['impactPercent']);
        if (!scenario || impactPercent === undefined) return [];
        return [{
          scenario,
          impactPercent,
          spreadShockBps: this.importNumber(impact['spreadShockBps']),
          impact: this.importNumber(impact['impact']),
          dataStatus: typeof impact['dataStatus'] === 'string' ? impact['dataStatus'] : undefined
        }];
      })
      : undefined;

    const securityId = requiredText('securityId', 'securityId', 'bondId', 'isin', 'symbol', 'ticker');
    return {
      securityId,
      name: text('name', 'securityName', 'description', 'bondId') || securityId,
      issuer: text('issuer') || undefined,
      currency: requiredText('currency', 'currency', 'ccy').toUpperCase(),
      issueDate,
      settlementDate,
      maturityDate: dateValue('échéance', 'maturityDate', 'maturity', 'maturité', 'date d’échéance'),
      yieldToMaturity: rate(
        'YTM', 'yieldToMaturity', 'ytm', 'yield', 'rendement', 'rendement actuariel', 'rendement à l’échéance', 'taux actuariel'
      ),
      faceValue,
      couponFrequency: couponFrequency ?? optionalNumber('paymentFrequency'),
      couponRate: optionalNumber('couponRate', 'coupon', 'annualCouponRate', 'coupon annuel', 'taux du coupon') == null
        ? undefined
        : rate('coupon annuel', 'couponRate', 'coupon', 'annualCouponRate', 'coupon annuel', 'taux du coupon'),
      couponDataStatus: text('couponDataStatus') || undefined,
      marketPrice: optionalNumber('marketPrice', 'price', 'prix de marché', 'prix marché'),
      cleanPrice,
      cleanPriceDataStatus: text('cleanPriceDataStatus') || undefined,
      spreadBps,
      zSpread,
      spreadDataStatus: text('spreadDataStatus', 'spreadStatus') || undefined,
      assetSwapSpreadBps: optionalNumber('assetSwapSpreadBps', 'assetSwapSpread', 'aswBps'),
      assetSwapSpreadDataStatus: text('assetSwapSpreadDataStatus', 'aswDataStatus') || undefined,
      cdsSpreadBps: optionalNumber('cdsSpreadBps', 'cdsSpread'),
      cdsSpreadDataStatus: text('cdsSpreadDataStatus') || undefined,
      gSpreadBps: optionalNumber('gSpreadBps', 'gSpread'),
      gSpreadDataStatus: text('gSpreadDataStatus') || undefined,
      iSpreadBps: optionalNumber('iSpreadBps', 'iSpread'),
      iSpreadDataStatus: text('iSpreadDataStatus') || undefined,
      nominalSpreadBps: optionalNumber('nominalSpreadBps', 'nominalSpread'),
      nominalSpreadDataStatus: text('nominalSpreadDataStatus') || undefined,
      oasBps: optionalNumber('oasBps', 'optionAdjustedSpreadBps', 'optionAdjustedSpread'),
      oasDataStatus: text('oasDataStatus', 'optionAdjustedSpreadDataStatus') || undefined,
      tedSpreadBps: optionalNumber('tedSpreadBps', 'tedSpread'),
      tedSpreadDataStatus: text('tedSpreadDataStatus') || undefined,
      zSpreadDataStatus: text('zSpreadDataStatus') || undefined,
      rating: text('rating') || undefined,
      sector: text('sector', 'secteur', 'secteur d’activité', 'industry', 'industry sector', 'issuerType') || undefined,
      seniority: text('seniority', 'debtSeniority', 'seniorityRank', 'seniorityLevel', 'rang de séniorité', 'rang de subordination', 'subordination') || undefined,
      seniorityDataStatus: text('seniorityDataStatus') || undefined,
      liquidity,
      bid: optionalNumber('bid'),
      ask: optionalNumber('ask'),
      bidAskSpread: optionalNumber('bidAskSpread', 'bidAskSpreadBps'),
      volume: optionalNumber('volume'),
      traceVolume: optionalNumber('traceVolume'),
      liquidityScore: optionalNumber('liquidityScore'),
      liquidityDataStatus: text('liquidityDataStatus') || undefined,
      turnoverRatio: optionalNumber('turnoverRatio'),
      frtbCapital: optionalNumber('frtbCapital', 'capital', 'totalCapital'),
      frtbDisclaimer: text('frtbDisclaimer', 'disclaimer') || undefined,
      esgScore,
      esgDataStatus: text('esgDataStatus', 'dataStatus') || undefined,
      ngfsScenarioImpacts,
      isGreenBond,
      source: sourceText.replace(/\s*[\/|]\s*\d{4}-\d{2}-\d{2}$/, '').trim() || sourceText || 'Import utilisateur',
      asOf: text('asOf', 'quoteDate', 'date') || sourceDate?.[1] || undefined
    };
  }

  private validateOptionHeaders(row: Record<string, unknown>): void {
    const headers = new Set(Object.keys(row).map(value => this.normalizeKey(value)));
    const missing = OPTION_IMPORT_COLUMNS.filter(column => !headers.has(this.normalizeKey(column)));
    if (missing.length) {
      throw new Error(`Import Full : colonnes manquantes : ${missing.join(', ')}.`);
    }
  }

  private toOptionImport(
    row: Record<string, unknown>,
    index: number,
    xlsx: typeof import('xlsx-js-style')
  ): OptionImportRecord {
    const values = new Map(Object.entries(row).map(([key, value]) => [this.normalizeKey(key), value]));
    const raw = (column: OptionImportColumn): unknown => values.get(this.normalizeKey(column));
    const text = (column: OptionImportColumn): string => {
      const value = raw(column);
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number' || typeof value === 'boolean') return `${value}`;
      return '';
    };
    const requiredText = (column: OptionImportColumn): string => {
      const value = text(column);
      if (!value) throw new Error(`Ligne ${index + 2} : ${column} est obligatoire.`);
      return value;
    };
    const number = (column: OptionImportColumn, options: { optional?: boolean; percentage?: boolean } = {}): number | null => {
      const value = text(column);
      if (!value && options.optional) return null;
      if (!value) throw new Error(`Ligne ${index + 2} : ${column} est obligatoire.`);
      const hasPercent = value.endsWith('%');
      let normalized = (value.endsWith('%') ? value.slice(0, -1) : value).replaceAll(/\s/g, '');
      if (normalized.includes(',') && normalized.includes('.')) {
        normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
          ? normalized.replaceAll('.', '').replaceAll(',', '.')
          : normalized.replaceAll(',', '');
      } else {
        normalized = normalized.replaceAll(',', '.');
      }
      let parsed = Number(normalized);
      if (!Number.isFinite(parsed)) throw new Error(`Ligne ${index + 2} : ${column} doit être numérique.`);
      if (options.percentage && (hasPercent || Math.abs(parsed) > 1)) parsed /= 100;
      return parsed;
    };
    const date = (column: 'valuationDate' | 'expirationDate'): string => {
      const value = raw(column);
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
      }
      if (typeof value === 'number') {
        const parsed = xlsx.SSF.parse_date_code(value);
        if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      }
      const rawDate = text(column);
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
      const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(rawDate);
      if (dayFirst) return `${dayFirst[3]}-${dayFirst[2].padStart(2, '0')}-${dayFirst[1].padStart(2, '0')}`;
      throw new Error(`Ligne ${index + 2} : ${column} doit être une date AAAA-MM-JJ ou JJ/MM/AAAA.`);
    };
    const optionType = requiredText('optionType').toUpperCase();
    if (optionType !== 'CALL' && optionType !== 'PUT') {
      throw new Error(`Ligne ${index + 2} : optionType doit être CALL ou PUT.`);
    }
    const exerciseValue = requiredText('exerciseStyle')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
    const exerciseStyle = this.parseExerciseStyle(exerciseValue);
    if (!exerciseStyle) throw new Error(`Ligne ${index + 2} : exerciseStyle doit être European, American ou Bermudan.`);
    const positionValue = requiredText('position').toUpperCase();
    if (positionValue !== 'LONG' && positionValue !== 'SHORT') {
      throw new Error(`Ligne ${index + 2} : position doit être LONG ou SHORT.`);
    }

    const valuationDate = date('valuationDate');
    const expirationDate = date('expirationDate');
    if (expirationDate <= valuationDate) {
      throw new Error(`Ligne ${index + 2} : expirationDate doit être postérieure à valuationDate.`);
    }
    const underlyingSpot = number('underlyingSpot') as number;
    const strikePrice = number('strikePrice') as number;
    const quantity = number('quantity') as number;
    const nominal = number('nominal') as number;
    if (underlyingSpot <= 0 || strikePrice <= 0 || quantity <= 0 || nominal <= 0) {
      throw new Error(`Ligne ${index + 2} : spot, strike, quantité et nominal doivent être positifs.`);
    }

    return {
      optionId: requiredText('optionId'),
      optionType,
      underlyingType: requiredText('underlyingType').toUpperCase(),
      underlyingSecurityId: requiredText('underlyingSecurityId'),
      currency: requiredText('currency').toUpperCase(),
      valuationDate,
      underlyingSpot,
      strikePrice,
      expirationDate,
      premiumPerUnit: number('premiumPerUnit') as number,
      exerciseStyle,
      quantity,
      nominal,
      position: positionValue,
      intrinsicValuePerUnit: number('intrinsicValuePerUnit') as number,
      timeValuePerUnit: number('timeValuePerUnit') as number,
      moneyness: requiredText('moneyness').toUpperCase(),
      volatility: number('volatility', { percentage: true }) as number,
      riskFreeRate: number('riskFreeRate', { percentage: true }) as number,
      dividendYield: number('dividendYield', { percentage: true }) as number,
      delta: number('delta') as number,
      gamma: number('gamma') as number,
      vegaPer1PctVol: number('vegaPer1PctVol') as number,
      thetaPerDay: number('thetaPerDay') as number,
      rhoPer1PctRate: number('rhoPer1PctRate') as number,
      underlyingYieldToMaturity: number('underlyingYieldToMaturity', { optional: true, percentage: true }),
      dataSource: requiredText('dataSource')
    };
  }

  private parseExerciseStyle(value: string): 'EUROPEAN' | 'AMERICAN' | 'BERMUDAN' | null {
    switch (value) {
      case 'EUROPEEN':
      case 'EUROPEAN':
        return 'EUROPEAN';
      case 'AMERICAIN':
      case 'AMERICAN':
        return 'AMERICAN';
      case 'BERMUDEN':
      case 'BERMUDEEN':
      case 'BERMUDAN':
        return 'BERMUDAN';
      default:
        return null;
    }
  }

  private normalizeKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private columnValue(row: BondComparableRow, column: BondColumn): string {
    if (column === 'securityId') return `${row.securityId} ${row.name}`;
    if (column === 'settlementDate') return row.settlementDate ?? this.target.settlementDate;
    if (column === 'yieldToMaturity') return `${row.yieldToMaturity} ${row.yieldToMaturity * 100}`;
    if (column === 'couponRate') return row.couponRate == null ? '' : `${row.couponRate} ${row.couponRate * 100}`;
    if (column === 'source') return `${row.source ?? ''} ${row.asOf ?? ''}`;
    if (column === 'eligibility') {
      if (row.selected) return 'meilleur ytm';
      if (row.eligible === false) return row.exclusionReason ?? 'exclu';
      return row.eligible ? 'comparable' : 'a analyser';
    }
    const value = row[column];
    return value == null ? '' : String(value);
  }

  private matchesEligibilityFilter(row: BondComparableRow, filter: EligibilityFilter): boolean {
    switch (filter) {
      case 'best': return row.selected;
      case 'eligible': return row.eligible === true;
      case 'excluded': return row.eligible === false;
      case 'pending': return row.eligible === null;
    }
  }

  private compareRows(left: BondComparableRow, right: BondComparableRow, column: BondColumn): number {
    if (column === 'eligibility') {
      const statusOrder = (row: BondComparableRow): number => {
        if (row.selected) return 0;
        if (row.eligible === true) return 1;
        return row.eligible === null ? 2 : 3;
      };
      const statusDifference = statusOrder(left) - statusOrder(right);
      if (statusDifference !== 0) return statusDifference;
      if (left.rank != null && right.rank != null) return left.rank - right.rank;
      if (left.eligible === false && right.eligible === false) {
        return (left.exclusionReason ?? '').localeCompare(right.exclusionReason ?? '', undefined, { sensitivity: 'base' });
      }
      return 0;
    }

    const leftValue = column === 'settlementDate' ? this.columnValue(left, column) : left[column];
    const rightValue = column === 'settlementDate' ? this.columnValue(right, column) : right[column];
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return leftValue - rightValue;
    return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true, sensitivity: 'base' });
  }
}