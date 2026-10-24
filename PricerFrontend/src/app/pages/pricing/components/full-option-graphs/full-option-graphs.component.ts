import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  ScatterController,
  Tooltip
} from 'chart.js';
import { BondComparable } from '../../../../models/bond-comparables.model';
import { OptionImportRecord } from '../../../../models/option-import.model';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  ScatterController,
  Tooltip
);

interface ChartPoint {
  x: number;
  y: number;
}

interface EstimatedCashFlow {
  date: string;
  coupon: number;
  principal: number;
  presentValue: number;
  timeYears: number;
}

interface EstimatedBondAnalysis {
  bond: BondComparable;
  faceValue: number;
  couponRate: number;
  couponFrequency: number;
  yieldToMaturity: number;
  cashFlows: EstimatedCashFlow[];
  macaulayDuration: number | null;
  modifiedDuration: number | null;
  assumptions: string[];
}

interface BondProjectionTerms {
  faceValue: number;
  couponRate: number;
  couponFrequency: number;
  yieldToMaturity: number;
  assumptions: string[];
}

@Component({
  selector: 'app-full-option-graphs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './full-option-graphs.component.html',
  styleUrls: ['./full-option-graphs.component.scss']
})
export class FullOptionGraphsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) option!: OptionImportRecord;
  @Input() options: OptionImportRecord[] = [];
  @Input() bonds: BondComparable[] = [];
  @ViewChild('marketChart') marketChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('riskChart') riskChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('payoffChart') payoffChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('smileChart') smileChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cashFlowChart') cashFlowChart!: ElementRef<HTMLCanvasElement>;

  smileOptions: OptionImportRecord[] = [];
  bondAnalysis: EstimatedBondAnalysis | null = null;
  bondAnalysisMessage = '';

  private marketChartInstance: Chart<'bar', number[], string> | null = null;
  private riskChartInstance: Chart<'bar', number[], string> | null = null;
  private payoffChartInstance: Chart<'line', ChartPoint[], string> | null = null;
  private smileChartInstance: Chart<'scatter', ChartPoint[], string> | null = null;
  private cashFlowChartInstance: Chart<'bar', number[], string> | null = null;
  private themeObserver?: MutationObserver;

  ngAfterViewInit(): void {
    this.updateCharts();
    this.themeObserver = new MutationObserver(() => this.updateCharts());
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['option'] || changes['options'] || changes['bonds']) {
      this.updateDerivedData();
      if (this.marketChart && this.riskChart && this.payoffChart && this.smileChart && this.cashFlowChart) {
        this.updateCharts();
      }
    }
  }

  ngOnDestroy(): void {
    this.themeObserver?.disconnect();
    this.destroyCharts();
  }

  private updateCharts(): void {
    if (!this.marketChart || !this.riskChart || !this.payoffChart || !this.smileChart || !this.cashFlowChart || !this.option) return;
    this.destroyCharts();
    const isLight = document.body.classList.contains('light-theme') || document.body.classList.contains('pop-theme');
    const textColor = isLight ? '#42544b' : '#b5cad8';
    const gridColor = isLight ? 'rgba(24, 56, 39, 0.12)' : 'rgba(124, 181, 255, 0.16)';
    this.marketChartInstance = this.createChart(
      this.marketChart.nativeElement,
      [
        ['Cours sous-jacent', this.option.underlyingSpot],
        ['Prix d’exercice', this.option.strikePrice],
        ['Prime importée', this.option.premiumPerUnit],
        ['Valeur intrinsèque', this.option.intrinsicValuePerUnit],
        ['Valeur temps', this.option.timeValuePerUnit],
        ['Prime calculée', this.option.calculatedPremiumPerUnit]
      ],
      'Valeur par unité', textColor, gridColor, '#3ae374'
    );
    this.riskChartInstance = this.createChart(
      this.riskChart.nativeElement,
      [
        ['Volatilité', this.option.volatility],
        ['Taux sans risque', this.option.riskFreeRate],
        ['Rendement dividende', this.option.dividendYield],
        ['Delta', this.option.delta],
        ['Gamma', this.option.gamma],
        ['Vega', this.option.vegaPer1PctVol],
        ['Theta / jour', this.option.thetaPerDay],
        ['Rho', this.option.rhoPer1PctRate],
        ['YTM sous-jacent', this.option.underlyingYieldToMaturity]
      ],
      'Valeur importée', textColor, gridColor, '#59b6ff'
    );
    this.payoffChartInstance = this.createPayoffChart(textColor, gridColor);
    this.smileChartInstance = this.createSmileChart(textColor, gridColor);
    this.cashFlowChartInstance = this.createCashFlowChart(textColor, gridColor);
  }

  private destroyCharts(): void {
    this.marketChartInstance?.destroy();
    this.riskChartInstance?.destroy();
    this.payoffChartInstance?.destroy();
    this.smileChartInstance?.destroy();
    this.cashFlowChartInstance?.destroy();
  }

  private updateDerivedData(): void {
    if (!this.option) return;
    const underlyingId = this.normalizeId(this.option.underlyingSecurityId);
    const comparableOptions = this.options.filter(candidate =>
      this.normalizeId(candidate.underlyingSecurityId) === underlyingId &&
      candidate.currency.toUpperCase() === this.option.currency.toUpperCase() &&
      candidate.valuationDate === this.option.valuationDate &&
      candidate.expirationDate === this.option.expirationDate &&
      candidate.exerciseStyle === this.option.exerciseStyle &&
      Number.isFinite(candidate.strikePrice) && candidate.strikePrice > 0 &&
      Number.isFinite(candidate.volatility) && candidate.volatility >= 0
    );
    this.smileOptions = comparableOptions.length ? comparableOptions : [this.option];
    this.bondAnalysis = this.buildBondAnalysis();
  }

  get hasSmileData(): boolean {
    return this.smileOptions.length > 0;
  }

  get smileNotice(): string {
    const strikeCount = new Set(this.smileOptions.map(candidate => candidate.strikePrice)).size;
    if (strikeCount === 1) return 'Une seule cotation est disponible : le point est affiché, mais il ne forme pas un smile.';
    if (strikeCount === 2) return 'Deux strikes sont disponibles : les observations sont affichées, mais le smile reste partiel.';
    return '';
  }

  private buildBondAnalysis(): EstimatedBondAnalysis | null {
    if (this.option.underlyingType.trim().toUpperCase() !== 'BOND') {
      return this.noBondAnalysis('Le sous-jacent sélectionné n’est pas une obligation.');
    }

    const bond = this.findUnderlyingBond();
    if (!bond) return this.noBondAnalysis('Importez une obligation avec le même identifiant et la même devise dans le panel pour estimer ses flux.');

    const terms = this.getBondProjectionTerms(bond);
    if (!terms) return null;
    const dates = this.getProjectionDates(bond);
    if (!dates) return null;

    const cashFlows = this.projectCashFlows(terms, dates.valuationDate, dates.maturityDate);
    if (!cashFlows.length) {
      return this.noBondAnalysis('Aucun flux futur estimable pour cette obligation.');
    }

    const durations = this.calculateDurations(cashFlows, terms);
    this.bondAnalysisMessage = '';
    return {
      bond,
      ...terms,
      cashFlows,
      ...durations
    };
  }

  private noBondAnalysis(message: string): null {
    this.bondAnalysisMessage = message;
    return null;
  }

  private findUnderlyingBond(): BondComparable | undefined {
    const underlyingId = this.normalizeId(this.option.underlyingSecurityId);
    const currency = this.option.currency.toUpperCase();
    return this.bonds.find(candidate =>
      this.normalizeId(candidate.securityId) === underlyingId && candidate.currency.toUpperCase() === currency
    );
  }

  private getBondProjectionTerms(bond: BondComparable): BondProjectionTerms | null {
    const assumptions: string[] = [];
    const faceValue = Number.isFinite(bond.faceValue) && (bond.faceValue ?? 0) > 0
      ? bond.faceValue as number
      : this.option.nominal;
    if (!Number.isFinite(bond.faceValue) || (bond.faceValue ?? 0) <= 0) assumptions.push('Nominal absent ou invalide : nominal repris de l’option.');
    if (!Number.isFinite(faceValue) || faceValue <= 0) {
      this.noBondAnalysis('Ajoutez un nominal valide au panel ou à l’option pour estimer le remboursement.');
      return null;
    }

    const couponRate = Number.isFinite(bond.couponRate) && (bond.couponRate ?? -1) >= 0
      ? bond.couponRate as number
      : 0;
    if (bond.couponRate == null || !Number.isFinite(bond.couponRate) || bond.couponRate < 0) {
      assumptions.push('Coupon absent ou invalide : projection du principal uniquement.');
    }

    const validFrequency = bond.couponFrequency != null && [1, 2, 3, 4, 6, 12].includes(bond.couponFrequency);
    const couponFrequency = validFrequency ? bond.couponFrequency as number : 1;
    if (!validFrequency && couponRate > 0) assumptions.push('Fréquence absente ou invalide : fréquence annuelle supposée.');

    const yieldToMaturity = this.getProjectionYield(bond, assumptions);
    if (yieldToMaturity == null) return null;

    return { faceValue, couponRate, couponFrequency, yieldToMaturity, assumptions };
  }

  private getProjectionYield(bond: BondComparable, assumptions: string[]): number | null {
    if (Number.isFinite(bond.yieldToMaturity)) return bond.yieldToMaturity;
    if (this.option.underlyingYieldToMaturity != null && Number.isFinite(this.option.underlyingYieldToMaturity)) {
      assumptions.push('YTM repris des données de l’option.');
      return this.option.underlyingYieldToMaturity;
    }
    if (Number.isFinite(this.option.riskFreeRate)) {
      assumptions.push('YTM du panel absent : taux sans risque de l’option utilisé comme approximation.');
      return this.option.riskFreeRate;
    }
    this.noBondAnalysis('Ajoutez un YTM au panel ou un taux valide aux données de l’option pour estimer la duration.');
    return null;
  }

  private getProjectionDates(bond: BondComparable): { valuationDate: Date; maturityDate: Date } | null {
    const valuationDate = this.parseDate(this.option.valuationDate);
    const maturityDate = this.parseDate(bond.maturityDate);
    if (!valuationDate || !maturityDate || maturityDate <= valuationDate) {
      this.noBondAnalysis('L’échéance obligataire doit être postérieure à la date de valorisation de l’option.');
      return null;
    }
    return { valuationDate, maturityDate };
  }

  private projectCashFlows(terms: BondProjectionTerms, valuationDate: Date, maturityDate: Date): EstimatedCashFlow[] {
    const cashFlows: EstimatedCashFlow[] = [];
    const couponMonths = 12 / terms.couponFrequency;
    const coupon = terms.faceValue * terms.couponRate / terms.couponFrequency;
    const discountBase = 1 + terms.yieldToMaturity / terms.couponFrequency;
    let paymentDate = maturityDate;
    for (let paymentIndex = 0; paymentIndex < 600 && paymentDate > valuationDate; paymentIndex++) {
      const timeYears = (paymentDate.getTime() - valuationDate.getTime()) / (365 * 24 * 60 * 60 * 1000);
      const isMaturity = paymentDate.getTime() === maturityDate.getTime();
      const principal = isMaturity ? terms.faceValue : 0;
      const undiscountedCashFlow = coupon + principal;
      const presentValue = discountBase > 0
        ? undiscountedCashFlow / Math.pow(discountBase, terms.couponFrequency * timeYears)
        : 0;
      cashFlows.push({
        date: this.toIsoDate(paymentDate),
        coupon,
        principal,
        presentValue,
        timeYears
      });
      paymentDate = this.addMonthsClamped(maturityDate, -(paymentIndex + 1) * couponMonths);
    }
    return cashFlows.reverse();
  }

  private calculateDurations(
    cashFlows: EstimatedCashFlow[],
    terms: BondProjectionTerms
  ): { macaulayDuration: number | null; modifiedDuration: number | null } {
    const discountBase = 1 + terms.yieldToMaturity / terms.couponFrequency;
    const presentValueTotal = cashFlows.reduce((sum, flow) => sum + flow.presentValue, 0);
    if (discountBase <= 0 || presentValueTotal <= 0) {
      return { macaulayDuration: null, modifiedDuration: null };
    }
    const macaulayDuration = cashFlows.reduce((sum, flow) => sum + flow.timeYears * flow.presentValue, 0) / presentValueTotal;
    return { macaulayDuration, modifiedDuration: macaulayDuration / discountBase };
  }

  private createPayoffChart(textColor: string, gridColor: string): Chart<'line', ChartPoint[], string> {
    const option = this.option;
    const maxSpot = Math.max(option.underlyingSpot, option.strikePrice, 1) * 2;
    const isCall = option.optionType === 'CALL';
    const positionSign = option.position === 'LONG' ? 1 : -1;
    const points: ChartPoint[] = Array.from({ length: 41 }, (_, index) => {
      const spot = maxSpot * index / 40;
      const intrinsic = isCall ? Math.max(spot - option.strikePrice, 0) : Math.max(option.strikePrice - spot, 0);
      return { x: spot, y: positionSign * (intrinsic - option.premiumPerUnit) };
    });

    return new Chart(this.payoffChart.nativeElement, {
      type: 'line',
      data: {
        datasets: [
          { label: 'P&L à l’échéance par unité', data: points, borderColor: '#18865b', backgroundColor: 'rgba(24, 134, 91, 0.12)', pointRadius: 0, fill: true, tension: 0 },
          { label: 'P&L nul', data: [{ x: 0, y: 0 }, { x: maxSpot, y: 0 }], borderColor: '#89959a', borderDash: [5, 4], pointRadius: 0, fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { display: true, labels: { color: textColor, boxWidth: 10 } } },
        scales: {
          x: { type: 'linear', title: { display: true, text: `Cours à l’échéance (${option.currency})`, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } },
          y: { title: { display: true, text: `P&L par unité (${option.currency})`, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } }
        }
      }
    });
  }

  private createSmileChart(textColor: string, gridColor: string): Chart<'scatter', ChartPoint[], string> {
    const selectedId = this.option.optionId;
    const comparables = this.smileOptions.filter(candidate => candidate.optionId !== selectedId);
    const calls = comparables.filter(candidate => candidate.optionType === 'CALL');
    const puts = comparables.filter(candidate => candidate.optionType === 'PUT');
    const selected = this.smileOptions.find(candidate => candidate.optionId === selectedId) ?? this.option;
    const points = (rows: OptionImportRecord[]): ChartPoint[] => rows.map(candidate => ({
      x: candidate.strikePrice,
      y: candidate.volatility * 100
    }));

    return new Chart(this.smileChart.nativeElement, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Calls', data: points(calls), backgroundColor: '#18865b', pointRadius: 5 },
          { label: 'Puts', data: points(puts), backgroundColor: '#3989c9', pointRadius: 5 },
          { label: `Sélectionnée · ${selected.optionId}`, data: points([selected]), backgroundColor: '#d26b3b', pointRadius: 7 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: textColor, boxWidth: 10 } } },
        scales: {
          x: { type: 'linear', title: { display: true, text: `Strike (${this.option.currency})`, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } },
          y: { title: { display: true, text: 'Volatilité implicite (%)', color: textColor }, ticks: { color: textColor, callback: value => `${value}%` }, grid: { color: gridColor } }
        }
      }
    });
  }

  private createCashFlowChart(textColor: string, gridColor: string): Chart<'bar', number[], string> {
    const cashFlows = this.bondAnalysis?.cashFlows ?? [];
    return new Chart(this.cashFlowChart.nativeElement, {
      type: 'bar',
      data: {
        labels: cashFlows.map(flow => this.formatDate(flow.date)),
        datasets: [
          { label: 'Coupon estimé', data: cashFlows.map(flow => flow.coupon), backgroundColor: '#18865b', stack: 'cashflow' },
          { label: 'Remboursement estimé', data: cashFlows.map(flow => flow.principal), backgroundColor: '#e0a243', stack: 'cashflow' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: textColor, boxWidth: 10 } } },
        scales: {
          x: { stacked: true, ticks: { color: textColor }, grid: { color: gridColor } },
          y: { stacked: true, title: { display: true, text: `Flux (${this.option.currency})`, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } }
        }
      }
    });
  }

  private normalizeId(value: string): string {
    return value.trim().replaceAll(/\s+/g, ' ').toUpperCase();
  }

  private parseDate(value: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
  }

  private addMonthsClamped(date: Date, months: number): Date {
    const targetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)));
  }

  private toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  }

  private createChart(
    canvas: HTMLCanvasElement,
    entries: [string, number | null | undefined][],
    axisTitle: string,
    textColor: string,
    gridColor: string,
    color: string
  ): Chart<'bar', number[], string> {
    const values = entries.filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));
    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: values.map(([label]) => label),
        datasets: [{ data: values.map(([, value]) => value), backgroundColor: color, borderRadius: 2 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: axisTitle, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        }
      }
    });
  }
}