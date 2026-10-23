import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { BondComparable, BondComparablesResponse } from '../../../../models/bond-comparables.model';
import { BondComparablesService } from '../../../../services/bond-comparables.service';

interface BondComparableRow extends BondComparable {
  eligible: boolean | null;
  selected: boolean;
  exclusionReason: string | null;
}

@Component({
  selector: 'app-bond-comparables',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bond-comparables.component.html',
  styleUrls: ['./bond-comparables.component.scss']
})
export class BondComparablesComponent {
  private readonly commonCurrencies = ['AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'JPY', 'USD'];
  private importGeneration = 0;

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
  error = '';
  importError = '';
  isLoading = false;
  isImporting = false;

  constructor(
    private readonly comparablesService: BondComparablesService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const generation = ++this.importGeneration;
    this.isImporting = true;
    this.importError = '';
    this.result = null;
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
        this.cdr.detectChanges();
      }
    }
  }

  price(): void {
    if (this.isLoading) return;
    this.error = '';
    this.result = null;
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
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        const serverMessage = typeof error.error?.message === 'string' ? error.error.message : '';
        if (error.status === 0) {
          this.error = 'API inaccessible. Vérifiez que le backend répond sur le port 9092.';
        } else if (error.status === 403) {
          this.error = 'Accès refusé par le backend (403). Vérifiez l’origine CORS autorisée.';
        } else if (serverMessage === 'No eligible comparable bonds in the panel') {
          this.error = 'Aucun comparable éligible : vérifiez la devise et la tolérance d’échéance du panel.';
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
    this.error = '';
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
}