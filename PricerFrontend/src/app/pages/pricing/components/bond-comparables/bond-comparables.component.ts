import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, finalize, from, map, mergeMap, of, tap, throwError, toArray } from 'rxjs';
import {
  BondComparable,
  BondComparablesRequest,
  BondComparablesResponse,
  BondDirectPricingRequest,
  BondDirectPricingResponse
} from '../../../../models/bond-comparables.model';
import { OPTION_IMPORT_COLUMNS, OptionImportColumn, OptionImportRecord } from '../../../../models/option-import.model';
import { BondComparablesService } from '../../../../services/bond-comparables.service';
import { PricingService } from '../../../../services/pricing.service';
import { AiAnalysisComponent } from '../ai-analysis/ai-analysis.component';
import { FullOptionGraphsComponent } from '../full-option-graphs/full-option-graphs.component';

interface BondComparableRow extends BondComparable {
  eligible: boolean | null;
  selected: boolean;
  exclusionReason: string | null;
}

type BondColumn = 'securityId' | 'issuer' | 'currency' | 'maturityDate' | 'rating' | 'yieldToMaturity' | 'source' | 'eligibility';
type TextFilterColumn = Exclude<BondColumn, 'eligibility'>;
type EligibilityFilter = 'best' | 'eligible' | 'excluded' | 'pending';
type BondTargetForm = BondComparablesRequest['target'];
type BondScreenMode = 'basic' | 'advanced' | 'comparables-light' | 'comparables-full' | 'comparables-full-graphs' | 'ai-analysis';
type BondSolveFor = 'PRICE' | 'YTM' | 'TERM';
type FullOptionColumn = typeof OPTION_IMPORT_COLUMNS[number] | 'calculatedPremiumPerUnit' | 'pricingStatus';

interface PersistedBondComparablesState {
  version: 1;
  target: BondTargetForm;
  panel: BondComparable[];
  fullOptions?: OptionImportRecord[];
  result: BondComparablesResponse | null;
  lastCalculatedAt: string | null;
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
}

@Component({
  selector: 'app-bond-comparables',
  standalone: true,
  imports: [CommonModule, FormsModule, AiAnalysisComponent, FullOptionGraphsComponent],
  templateUrl: './bond-comparables.component.html',
  styleUrls: ['./bond-comparables.component.scss']
})
export class BondComparablesComponent {
  private readonly storageKey = 'finance-pricer.bond-comparables.v1';
  readonly apiOnline$: Observable<boolean>;
  private readonly commonCurrencies = ['AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'JPY', 'USD'];
  private importGeneration = 0;
  readonly eligibilityOptions = [
    { value: 'best', label: 'Meilleur YTM' },
    { value: 'eligible', label: 'Comparable' },
    { value: 'excluded', label: 'Exclue' },
    { value: 'pending', label: 'À analyser' }
  ] as const;
  readonly fullOptionColumns: FullOptionColumn[] = [...OPTION_IMPORT_COLUMNS, 'calculatedPremiumPerUnit', 'pricingStatus'];
  fullOptionFilters: Partial<Record<FullOptionColumn, string>> = {};
  fullOptionSortColumn: FullOptionColumn = 'optionId';
  fullOptionSortDirection: 1 | -1 = 1;
  activeMode: BondScreenMode = 'basic';
  directResult: BondDirectPricingResponse | null = null;
  directError = '';
  isDirectPricing = false;
  directCurrency = 'USD';
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
    settlementDate: new Date().toISOString().slice(0, 10),
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
    settlementDate: new Date().toISOString().slice(0, 10),
    dayCount: '30/360'
  };
  maturityToleranceMonths = 24;
  panel: BondComparable[] = [];
  fullOptions: OptionImportRecord[] = [];
  selectedFullOption: OptionImportRecord | null = null;
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
    pricingStatus: 'Statut du pricing'
  };
  result: BondComparablesResponse | null = null;
  lastCalculatedAt: Date | null = null;
  error = '';
  importError = '';
  exportSuccess = '';
  isLoading = false;
  isImporting = false;
  isExporting = false;
  exportError = '';
  isFullOptionsExporting = false;
  fullOptionsExportError = '';
  fullOptionsExportSuccess = '';
  isFullOptionPricing = false;
  fullOptionPricingProgress = 0;
  fullOptionPricingSummary = '';
  filters: Record<TextFilterColumn, string> = {
    securityId: '', issuer: '', currency: '', maturityDate: '', rating: '', yieldToMaturity: '', source: ''
  };
  eligibilityFilters = new Set<EligibilityFilter>();
  yieldMinimum = '';
  yieldMaximum = '';
  sortColumn: BondColumn = 'yieldToMaturity';
  sortDirection: 1 | -1 = -1;

  constructor(
    private readonly comparablesService: BondComparablesService,
    private readonly pricingService: PricingService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.apiOnline$ = this.pricingService.apiOnline$;
    this.restoreState();
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
    this.setMode('comparables-full-graphs');
  }

  calculateBasic(): void {
    const couponRate = this.basicForm.couponUnit === 'AMOUNT'
      ? Number(this.basicForm.couponValue) / Number(this.basicForm.faceValue)
      : Number(this.basicForm.couponValue) / 100;
    const request: BondDirectPricingRequest = {
      solveFor: this.basicForm.solveFor,
      faceValue: Number(this.basicForm.faceValue),
      couponRate,
      couponFrequency: Number(this.basicForm.couponFrequency),
      price: this.basicForm.solveFor === 'PRICE' ? null : Number(this.basicForm.price),
      ytm: this.basicForm.solveFor === 'YTM' ? null : Number(this.basicForm.ytm) / 100,
      termYears: this.basicForm.solveFor === 'TERM' ? null : Number(this.basicForm.termYears)
    };
    this.submitDirect(request);
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
      settlementDate: new Date().toISOString().slice(0, 10), dayCount: '30/360',
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
    this.comparablesService.priceDirectly(request).pipe(finalize(() => {
      this.isDirectPricing = false;
    })).subscribe({
      next: result => {
        this.directResult = result;
        this.pricingService.setApiOnline(true);
      },
      error: (error: HttpErrorResponse) => {
        this.pricingService.setApiOnline(error.status !== 0);
        this.directError = typeof error.error?.message === 'string'
          ? error.error.message
          : 'Le calcul obligataire a échoué. Vérifiez les paramètres puis réessayez.';
      }
    });
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
    const timeoutId = setTimeout(() => {
      if (generation !== this.importGeneration) return;
      this.importGeneration++;
      this.isImporting = false;
      this.importError = 'La lecture dépasse 30 secondes. Vérifiez le fichier puis réessayez.';
      input.value = '';
      this.cdr.detectChanges();
    }, 30000);

    try {
      this.cdr.detectChanges();
      if (file.size > 20 * 1024 * 1024) throw new Error('Le fichier dépasse la taille maximale de 20 Mo.');
      const XLSX = window.XLSX;
      if (generation !== this.importGeneration) return;
      const buffer = await file.arrayBuffer();
      if (generation !== this.importGeneration) return;
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('Le fichier ne contient aucune feuille.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: null });
      if (!rows.length) throw new Error('Aucune ligne trouvée dans la première feuille.');
      if (mode === 'full') {
        this.validateOptionHeaders(rows[0]);
        this.fullOptions = rows.map((row, index) => this.toOptionImport(row, index, XLSX));
      } else {
        this.panel = rows.map((row, index) => this.toComparable(row, index, XLSX));
      }
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

  price(): void {
    if (this.isLoading) return;
    this.error = '';
    if (!this.target.securityId.trim() || !this.target.currency.trim() || !this.target.issueDate || !this.target.maturityDate || !this.target.settlementDate) {
      this.error = 'Renseignez l’identifiant, la devise, la date d’émission et les dates de l’obligation cible.';
      return;
    }
    if (!this.panel.length) {
      this.error = 'Importez un panel d’obligations avant de lancer le pricing.';
      return;
    }

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
        issueDate: this.target.issueDate,
        maturityDate: this.target.maturityDate,
        settlementDate: this.target.settlementDate,
        dayCount: this.target.dayCount
      },
      panel: this.panel,
      maturityToleranceMonths: Number(this.maturityToleranceMonths)
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
        } else if (serverMessage === 'No eligible comparable bonds in the panel') {
          this.error = 'Aucun comparable distinct de la cible : vérifiez la devise et l’échéance, augmentez la tolérance ou importez d’autres obligations.';
        } else {
          this.error = serverMessage || 'Le calcul du panel a échoué. Vérifiez les données importées.';
        }
        this.cdr.detectChanges();
      }
    });
  }

  get panelRows(): BondComparableRow[] {
    if (this.result) {
      return this.result.panel.map(item => ({ ...item.bond, eligible: item.eligible, selected: item.selected, exclusionReason: item.exclusionReason }));
    }
    return this.panel.map(bond => ({ ...bond, eligible: null, selected: false, exclusionReason: null }));
  }

  get filteredPanelRows(): BondComparableRow[] {
    return this.panelRows
      .filter(row => !this.eligibilityFilters.size || this.eligibilityFilters.has(this.eligibilityFilterValue(row)))
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
      .filter(option => this.fullOptionColumns.every(column => {
        const filter = this.fullOptionFilters[column]?.trim().toLocaleLowerCase();
        return !filter || String(option[column] ?? '').toLocaleLowerCase().includes(filter);
      }))
      .slice()
      .sort((left, right) => {
        const leftValue = left[this.fullOptionSortColumn];
        const rightValue = right[this.fullOptionSortColumn];
        const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true, sensitivity: 'base' });
        return comparison * this.fullOptionSortDirection;
      });
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

  calculateFullOptionPrices(): void {
    const rows = this.filteredFullOptions.map(option => ({ option, index: this.fullOptions.indexOf(option) }));
    if (!rows.length || this.isFullOptionPricing) return;

    this.isFullOptionPricing = true;
    this.fullOptionPricingProgress = 0;
    this.fullOptionPricingSummary = '';
    from(rows).pipe(
      mergeMap(({ option, index }) => this.priceFullOption(option).pipe(
        map(price => ({ index, price, status: 'Calculé' })),
        catchError(error => of({
          index,
          price: null,
          status: error instanceof Error ? error.message : 'Échec du calcul'
        }))
      ), 4),
      tap(result => {
        const updated = [...this.fullOptions];
        updated[result.index] = {
          ...updated[result.index],
          calculatedPremiumPerUnit: result.price,
          pricingStatus: result.status
        };
        this.fullOptions = updated;
        this.fullOptionPricingProgress++;
      }),
      toArray(),
      finalize(() => {
        this.isFullOptionPricing = false;
        this.persistState();
        this.cdr.detectChanges();
      })
    ).subscribe(results => {
      const calculated = results.filter(result => result.price !== null).length;
      this.fullOptionPricingSummary = `${calculated} / ${results.length} prix calculés`;
    });
  }

  async exportFullOptionsXls(): Promise<void> {
    if (!this.filteredFullOptions.length || this.isFullOptionsExporting) return;

    this.isFullOptionsExporting = true;
    this.fullOptionsExportError = '';
    this.fullOptionsExportSuccess = '';
    try {
      const XLSX = window.XLSX;
      const worksheet = XLSX.utils.json_to_sheet(this.filteredFullOptions, { header: [...this.fullOptionColumns] });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Comparables full');
      XLSX.writeFile(workbook, `comparables-full-${new Date().toISOString().slice(0, 10)}.xls`, { bookType: 'biff8' });
      this.fullOptionsExportSuccess = 'Le fichier XLS a été téléchargé.';
    } catch {
      this.fullOptionsExportError = 'L’export XLS a échoué. Vérifiez le navigateur puis réessayez.';
    } finally {
      this.isFullOptionsExporting = false;
      this.cdr.detectChanges();
    }
  }

  private priceFullOption(option: OptionImportRecord): Observable<number> {
    if (option.exerciseStyle === 'BERMUDAN') {
      return throwError(() => new Error('Calendrier d’exercice Bermudan absent des données importées'));
    }
    const valuationTime = Date.parse(`${option.valuationDate}T00:00:00Z`);
    const expirationTime = Date.parse(`${option.expirationDate}T00:00:00Z`);
    const maturityYears = (expirationTime - valuationTime) / (365 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(maturityYears) || maturityYears <= 0) {
      return throwError(() => new Error('Dates de valorisation ou d’expiration invalides'));
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
    return this.pricingService.submitPricing('EQTY_OPT', payload).pipe(map(response => {
      const price = response.result?.['price'];
      if (typeof price !== 'number' || !Number.isFinite(price)) throw new Error('Prix absent de la réponse de pricing');
      return price;
    }));
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

  async exportLightOptionsXlsx(): Promise<void> {
    if (!this.filteredPanelRows.length || this.isExporting) return;

    this.isExporting = true;
    this.exportError = '';
    this.exportSuccess = '';
    try {
      const XLSX = window.XLSX;
      const workbook = XLSX.utils.book_new();
      this.appendPanelSheet(XLSX, workbook);
      this.appendPricingSheet(XLSX, workbook);

      const fileDate = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `bond-comparables-${this.target.securityId || 'panel'}-${fileDate}.xlsx`);
      this.exportSuccess = 'Le fichier Excel a été téléchargé.';
    } catch {
      this.exportError = 'L’export Excel a échoué. Réessayez ou vérifiez le navigateur.';
    } finally {
      this.isExporting = false;
      this.cdr.detectChanges();
    }
  }

  private appendPanelSheet(xlsx: typeof import('xlsx-js-style'), workbook: import('xlsx-js-style').WorkBook): void {
    const rows = this.filteredPanelRows.map(row => ({
        Identifiant: row.securityId,
        Nom: row.name,
        Emetteur: row.issuer ?? '',
        Devise: row.currency,
        Echeance: new Date(`${row.maturityDate}T00:00:00`),
        Notation: row.rating ?? '',
        YTM: row.yieldToMaturity,
        PrixMarche: row.marketPrice ?? '',
        Source: row.source ?? '',
        DateDonnees: row.asOf && /^\d{4}-\d{2}-\d{2}$/.test(row.asOf) ? new Date(`${row.asOf}T00:00:00`) : row.asOf ?? '',
        Eligible: row.eligible ?? '',
        Retenu: row.selected,
        MotifExclusion: row.exclusionReason ?? ''
    }));
    const sheet = xlsx.utils.json_to_sheet(rows);
    sheet['!cols'] = [
      { wch: 24 }, { wch: 30 }, { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
      { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 38 }
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
      const yieldCell = sheet[xlsx.utils.encode_cell({ r: row, c: 6 })];
      if (yieldCell) yieldCell.z = '0.00%';
      const marketPriceCell = sheet[xlsx.utils.encode_cell({ r: row, c: 7 })];
      if (marketPriceCell && typeof marketPriceCell.v === 'number') marketPriceCell.z = '0.0000';
      const maturityCell = sheet[xlsx.utils.encode_cell({ r: row, c: 4 })];
      if (maturityCell) maturityCell.z = 'dd/mm/yyyy';
      const asOfCell = sheet[xlsx.utils.encode_cell({ r: row, c: 9 })];
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

    this.target = {
      ...this.target,
      securityId: bond.securityId,
      name: bond.name || bond.securityId,
      currency: bond.currency.toUpperCase(),
      maturityDate: bond.maturityDate,
      faceValue: bond.faceValue ?? this.target.faceValue,
      couponRate: bond.couponRate == null ? this.target.couponRate : bond.couponRate * 100,
      couponFrequency: bond.couponFrequency ?? this.target.couponFrequency
    };
    this.result = null;
    this.lastCalculatedAt = null;
    this.error = '';
    this.persistState();
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
    if (Array.isArray(state.fullOptions)) this.fullOptions = state.fullOptions;
    if (typeof state.maturityToleranceMonths === 'number' && Number.isFinite(state.maturityToleranceMonths)) {
      this.maturityToleranceMonths = state.maturityToleranceMonths;
    }
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
    if (state.filters && typeof state.filters === 'object') {
      for (const column of Object.keys(this.filters) as TextFilterColumn[]) {
        if (typeof state.filters[column] === 'string') this.filters[column] = state.filters[column];
      }
    }
    if (Array.isArray(state.eligibilityFilters)) {
      this.eligibilityFilters = new Set(state.eligibilityFilters.filter(value =>
        this.eligibilityOptions.some(option => option.value === value)
      ));
    }
    if (typeof state.yieldMinimum === 'string') this.yieldMinimum = state.yieldMinimum;
    if (typeof state.yieldMaximum === 'string') this.yieldMaximum = state.yieldMaximum;
    if (state.fullOptionFilters && typeof state.fullOptionFilters === 'object') {
      for (const column of this.fullOptionColumns) {
        const value = state.fullOptionFilters[column];
        if (typeof value === 'string') this.fullOptionFilters[column] = value;
      }
    }
  }

  private restoreSorting(state: Partial<PersistedBondComparablesState>): void {
    const columns: BondColumn[] = ['securityId', 'issuer', 'currency', 'maturityDate', 'rating', 'yieldToMaturity', 'source', 'eligibility'];
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
      maturityToleranceMonths: this.maturityToleranceMonths,
      filters: this.filters,
      eligibilityFilters: [...this.eligibilityFilters],
      yieldMinimum: this.yieldMinimum,
      yieldMaximum: this.yieldMaximum,
      sortColumn: this.sortColumn,
      sortDirection: this.sortDirection,
      fullOptionFilters: this.fullOptionFilters,
      fullOptionSortColumn: this.fullOptionSortColumn,
      fullOptionSortDirection: this.fullOptionSortDirection
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
    const rate = (label: string, ...keys: string[]): number => {
      const value = text(...keys);
      if (!value) throw new Error(`Ligne ${index + 2} : colonne ${label} manquante.`);
      const hasPercent = value.endsWith('%');
      const parsed = Number(value.replace(/%$/, '').replace(',', '.'));
      if (!Number.isFinite(parsed)) throw new Error(`Ligne ${index + 2} : ${label} doit être un nombre.`);
      return hasPercent || Math.abs(parsed) > 1 ? parsed / 100 : parsed;
    };
    const dateValue = (...keys: string[]): string => {
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
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      throw new Error(`Ligne ${index + 2} : échéance invalide, format attendu AAAA-MM-JJ.`);
    };
    const optionalNumber = (...keys: string[]): number | undefined => {
      const value = text(...keys);
      if (!value) return undefined;
      const parsed = Number(value.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const securityId = requiredText('securityId', 'securityId', 'isin', 'symbol', 'ticker');
    return {
      securityId,
      name: text('name', 'securityName', 'description') || securityId,
      issuer: text('issuer') || undefined,
      currency: requiredText('currency', 'currency', 'ccy').toUpperCase(),
      maturityDate: dateValue('maturityDate', 'maturity', 'maturityDate'),
      yieldToMaturity: rate('yieldToMaturity', 'yieldToMaturity', 'ytm'),
      faceValue: optionalNumber('faceValue', 'faceValue', 'nominal'),
      couponFrequency: optionalNumber('couponFrequency', 'couponFrequency', 'frequency'),
      couponRate: optionalNumber('couponRate', 'coupon') == null
        ? undefined
        : rate('couponRate', 'couponRate', 'coupon'),
      marketPrice: optionalNumber('marketPrice', 'price'),
      rating: text('rating') || undefined,
      source: text('source') || 'Import utilisateur',
      asOf: text('asOf', 'quoteDate', 'date') || undefined
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
      return value == null ? '' : String(value).trim();
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
      let normalized = value.replace(/%$/, '').replace(/\s/g, '');
      if (normalized.includes(',') && normalized.includes('.')) {
        normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
          ? normalized.replace(/\./g, '').replace(',', '.')
          : normalized.replace(/,/g, '');
      } else {
        normalized = normalized.replace(',', '.');
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
    const exerciseStyle = exerciseValue === 'EUROPEEN' || exerciseValue === 'EUROPEAN'
      ? 'EUROPEAN'
      : exerciseValue === 'AMERICAIN' || exerciseValue === 'AMERICAN'
        ? 'AMERICAN'
        : exerciseValue === 'BERMUDEN' || exerciseValue === 'BERMUDEEN' || exerciseValue === 'BERMUDAN'
          ? 'BERMUDAN'
          : null;
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

  private normalizeKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private columnValue(row: BondComparableRow, column: BondColumn): string {
    switch (column) {
      case 'securityId': return `${row.securityId} ${row.name}`;
      case 'issuer': return row.issuer ?? '';
      case 'currency': return row.currency;
      case 'maturityDate': return row.maturityDate;
      case 'rating': return row.rating ?? '';
      case 'yieldToMaturity': return `${row.yieldToMaturity} ${row.yieldToMaturity * 100}`;
      case 'source': return `${row.source ?? ''} ${row.asOf ?? ''}`;
      case 'eligibility':
        if (row.selected) return 'meilleur ytm';
        if (row.eligible === false) return row.exclusionReason ?? 'exclu';
        return row.eligible ? 'comparable' : 'a analyser';
    }
  }

  private eligibilityFilterValue(row: BondComparableRow): EligibilityFilter {
    if (row.selected) return 'best';
    if (row.eligible === false) return 'excluded';
    return row.eligible ? 'eligible' : 'pending';
  }

  private compareRows(left: BondComparableRow, right: BondComparableRow, column: BondColumn): number {
    const leftValue = column === 'eligibility' ? this.columnValue(left, column) : left[column];
    const rightValue = column === 'eligibility' ? this.columnValue(right, column) : right[column];
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return leftValue - rightValue;
    return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true, sensitivity: 'base' });
  }
}