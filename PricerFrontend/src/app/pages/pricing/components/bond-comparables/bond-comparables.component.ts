import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, finalize } from 'rxjs';
import { BondComparable, BondComparablesRequest, BondComparablesResponse } from '../../../../models/bond-comparables.model';
import { BondComparablesService } from '../../../../services/bond-comparables.service';
import { PricingService } from '../../../../services/pricing.service';

interface BondComparableRow extends BondComparable {
  eligible: boolean | null;
  selected: boolean;
  exclusionReason: string | null;
}

type BondColumn = 'securityId' | 'issuer' | 'currency' | 'maturityDate' | 'rating' | 'yieldToMaturity' | 'source' | 'eligibility';
type TextFilterColumn = Exclude<BondColumn, 'eligibility'>;
type EligibilityFilter = 'best' | 'eligible' | 'excluded' | 'pending';

interface PersistedBondComparablesState {
  version: 1;
  target: BondComparablesRequest['target'];
  panel: BondComparable[];
  result: BondComparablesResponse | null;
  lastCalculatedAt: string | null;
  maturityToleranceMonths: number;
  filters: Record<TextFilterColumn, string>;
  eligibilityFilters: EligibilityFilter[];
  yieldMinimum: string;
  yieldMaximum: string;
  sortColumn: BondColumn;
  sortDirection: 1 | -1;
}

@Component({
  selector: 'app-bond-comparables',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  target = {
    securityId: '',
    name: '',
    currency: 'EUR',
    faceValue: 100,
    couponRate: 4,
    couponFrequency: 2,
    maturityDate: '',
    settlementDate: new Date().toISOString().slice(0, 10),
    dayCount: '30/360'
  };
  maturityToleranceMonths = 24;
  panel: BondComparable[] = [];
  result: BondComparablesResponse | null = null;
  lastCalculatedAt: Date | null = null;
  error = '';
  importError = '';
  exportSuccess = '';
  isLoading = false;
  isImporting = false;
  isExporting = false;
  exportError = '';
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

  async onFileSelected(event: Event): Promise<void> {
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
      const XLSX = await import('xlsx-js-style');
      if (generation !== this.importGeneration) return;
      const buffer = await file.arrayBuffer();
      if (generation !== this.importGeneration) return;
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('Le fichier ne contient aucune feuille.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: null });
      this.panel = rows.map((row, index) => this.toComparable(row, index, XLSX));
      if (!this.panel.length) throw new Error('Aucune obligation trouvée dans la première feuille.');
    } catch (error) {
      if (generation !== this.importGeneration) return;
      this.panel = [];
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
    if (!this.target.securityId.trim() || !this.target.currency.trim() || !this.target.maturityDate || !this.target.settlementDate) {
      this.error = 'Renseignez l’identifiant, la devise et les dates de l’obligation cible.';
      return;
    }
    if (!this.panel.length) {
      this.error = 'Importez un panel d’obligations avant de lancer le pricing.';
      return;
    }

    this.isLoading = true;
    this.cdr.detectChanges();
    this.comparablesService.price({
      target: { ...this.target, couponRate: Number(this.target.couponRate) / 100 },
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

  async exportXlsx(): Promise<void> {
    if (!this.filteredPanelRows.length || this.isExporting) return;

    this.isExporting = true;
    this.exportError = '';
    this.exportSuccess = '';
    try {
      const XLSX = await import('xlsx-js-style');
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
    if (typeof state.maturityToleranceMonths === 'number' && Number.isFinite(state.maturityToleranceMonths)) {
      this.maturityToleranceMonths = state.maturityToleranceMonths;
    }
  }

  private restorePricingResult(state: Partial<PersistedBondComparablesState>): void {
    if (state.result && Array.isArray(state.result.panel)) this.result = state.result;
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
  }

  private restoreSorting(state: Partial<PersistedBondComparablesState>): void {
    const columns: BondColumn[] = ['securityId', 'issuer', 'currency', 'maturityDate', 'rating', 'yieldToMaturity', 'source', 'eligibility'];
    if (columns.includes(state.sortColumn as BondColumn)) this.sortColumn = state.sortColumn as BondColumn;
    if (state.sortDirection === 1 || state.sortDirection === -1) this.sortDirection = state.sortDirection;
  }

  persistState(): void {
    const state: PersistedBondComparablesState = {
      version: 1,
      target: this.target,
      panel: this.panel,
      result: this.result,
      lastCalculatedAt: this.lastCalculatedAt?.toISOString() ?? null,
      maturityToleranceMonths: this.maturityToleranceMonths,
      filters: this.filters,
      eligibilityFilters: [...this.eligibilityFilters],
      yieldMinimum: this.yieldMinimum,
      yieldMaximum: this.yieldMaximum,
      sortColumn: this.sortColumn,
      sortDirection: this.sortDirection
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