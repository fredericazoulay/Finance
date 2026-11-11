import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartOptions,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  PieController,
  ScatterController,
  Title,
  Tooltip
} from 'chart.js';
import { BondComparable } from '../../../../models/bond-comparables.model';
import {
  BondScenarioInput,
  BondScenarioMetrics,
  calculateBondScenario,
  priceBondAtYield
} from './bond-scenario';

Chart.register(ArcElement, BarController, BarElement, CategoryScale, Legend, LineController, LineElement, LinearScale, PieController, PointElement, ScatterController, Title, Tooltip);

const MATURITY_BUCKETS = ['0-5Y', '5-10Y', '10-20Y', '20Y+'];
const RATINGS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D'];
const CHART_COLORS = ['#4169f5', '#b44848', '#87a847', '#795d9b', '#44a1b3', '#e2863e', '#38a8a0', '#9d78c1'];
const BLOOMBERG_CHART_COLORS = ['#ff8c00', '#f4c542', '#54b7a5', '#56a8d8', '#e66b5b', '#a28ac2', '#8eb04a', '#e89b63'];

@Component({
  selector: 'app-bond-analytics-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bond-analytics-dashboard.component.html',
  styleUrls: ['./bond-analytics-dashboard.component.scss']
})
export class BondAnalyticsDashboardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() bonds: BondComparable[] = [];
  @Input() faceValue = 100;
  @Input() couponRate = 5;
  @Input() couponFrequency = 2;
  @Input() maturityYears = 3;
  @Input() yieldToMaturity = 6;
  @Output() scenarioInputChange = new EventEmitter<{ key: keyof BondScenarioInput; value: number }>();
  @ViewChild('currencyChart') currencyChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('maturityChart') maturityChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('ratingChart') ratingChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('yieldRatingChart') yieldRatingChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('sectorChart') sectorChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('maturityYieldChart') maturityYieldChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('couponYieldChart') couponYieldChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('priceYieldChart') priceYieldChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cashFlowChart') cashFlowChart!: ElementRef<HTMLCanvasElement>;

  private charts: Chart[] = [];
  private themeObserver: MutationObserver | null = null;
  private viewInitialized = false;
  rateShockBps = 0;

  get scenario(): BondScenarioMetrics | null {
    return calculateBondScenario(this.scenarioInput, this.rateShockBps);
  }

  get scenarioYieldPercent(): number {
    return this.yieldToMaturity + this.rateShockBps / 100;
  }

  get minRateShockBps(): number {
    const frequency = Number(this.couponFrequency);
    const yieldRate = Number(this.yieldToMaturity) / 100;
    return Math.max(-300, Math.ceil((-frequency - yieldRate + 0.0001) * 10000));
  }

  get bondsWithRating(): BondComparable[] {
    return this.bonds.filter(bond => Boolean(this.normalizeRating(bond.rating)));
  }

  get bondsWithYieldAndRating(): BondComparable[] {
    return this.bondsWithRating.filter(bond => Number.isFinite(bond.yieldToMaturity));
  }

  get bondsWithMaturityAndYieldCount(): number {
    return this.bonds.filter(bond => this.yearsToMaturity(bond.maturityDate) !== null && Number.isFinite(bond.yieldToMaturity)).length;
  }

  get bondsWithCouponAndYieldCount(): number {
    return this.bonds.filter(bond => bond.couponRate != null && Number.isFinite(bond.couponRate) && Number.isFinite(bond.yieldToMaturity)).length;
  }

  get bondsWithSectorCount(): number {
    return this.bonds.filter(bond => Boolean(bond.sector?.trim())).length;
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.updateCharts();
    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
      this.themeObserver = new MutationObserver(() => this.updateCharts());
      this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.viewInitialized && Object.keys(changes).length) {
      this.rateShockBps = Math.max(this.minRateShockBps, this.rateShockBps);
      this.updateCharts();
    }
  }

  ngOnDestroy(): void {
    this.themeObserver?.disconnect();
    this.destroyCharts();
  }

  private updateCharts(): void {
    if (!this.viewInitialized) return;
    this.destroyCharts();

    const currencyCounts = this.countBy(this.bonds, bond => bond.currency?.trim().toUpperCase() || '');
    const maturityCounts = this.countMaturities();
    const ratingCounts = this.countBy(this.bondsWithRating, bond => this.normalizeRating(bond.rating));
    const sectorCounts = this.countBy(this.bonds, bond => bond.sector?.trim() || '');
    const ratings = [...RATINGS.filter(rating => ratingCounts.has(rating)), ...[...ratingCounts.keys()].filter(rating => !RATINGS.includes(rating))];
    const sectors = [...sectorCounts.keys()].sort((left, right) => left.localeCompare(right));
    const averageYields = ratings.map(rating => {
      const values = this.bondsWithYieldAndRating
        .filter(bond => this.normalizeRating(bond.rating) === rating)
        .map(bond => bond.yieldToMaturity * 100);
      return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
    });
    const chartColors = this.chartColors;

    this.charts = [
      new Chart(this.currencyChart.nativeElement, {
        type: 'pie',
        data: {
          labels: [...currencyCounts.keys()],
          datasets: [{ data: [...currencyCounts.values()], backgroundColor: chartColors }]
        },
        options: this.chartOptions('Obligations par devise', true)
      }),
      new Chart(this.maturityChart.nativeElement, {
        type: 'bar',
        data: {
          labels: MATURITY_BUCKETS,
          datasets: [{ label: 'Nombre d’obligations', data: MATURITY_BUCKETS.map(bucket => maturityCounts.get(bucket) ?? 0), backgroundColor: chartColors }]
        },
        options: this.chartOptions('Obligations par tranche d’échéance')
      }),
      new Chart(this.ratingChart.nativeElement, {
        type: 'bar',
        data: {
          labels: ratings,
          datasets: [{ label: 'Nombre d’obligations', data: ratings.map(rating => ratingCounts.get(rating) ?? 0), backgroundColor: chartColors }]
        },
        options: this.chartOptions('Obligations par notation')
      }),
      new Chart(this.sectorChart.nativeElement, {
        type: 'bar',
        data: {
          labels: sectors,
          datasets: [{ label: 'Nombre d’obligations', data: sectors.map(sector => sectorCounts.get(sector) ?? 0), backgroundColor: chartColors }]
        },
        options: this.chartOptions('Obligations par secteur')
      }),
      new Chart(this.maturityYieldChart.nativeElement, {
        type: 'scatter',
        data: { datasets: this.maturityYieldDatasets(chartColors) },
        options: this.scatterChartOptions('YTM selon l’échéance', 'Années jusqu’à l’échéance', 'YTM (%)')
      }),
      new Chart(this.couponYieldChart.nativeElement, {
        type: 'scatter',
        data: { datasets: this.couponYieldDatasets(chartColors) },
        options: this.scatterChartOptions('YTM selon le coupon', 'Coupon annuel (%)', 'YTM (%)')
      })
    ];

    this.charts.push(new Chart(this.yieldRatingChart.nativeElement, {
      type: 'bar',
      data: {
        labels: ratings,
        datasets: [{ label: 'YTM moyen (%)', data: averageYields, backgroundColor: chartColors }]
      },
      options: this.chartOptions('YTM moyen par notation')
    }));
    this.createScenarioCharts(chartColors);
  }

  onRateShockChange(event: Event): void {
    this.rateShockBps = Number((event.target as HTMLInputElement).value);
    this.updateCharts();
  }

  onScenarioInputChange(key: keyof BondScenarioInput, event: Event): void {
    this.scenarioInputChange.emit({
      key,
      value: Number((event.target as HTMLInputElement).value)
    });
  }

  resetRateShock(): void {
    this.rateShockBps = 0;
    this.updateCharts();
  }

  private createScenarioCharts(chartColors: string[]): void {
    const scenario = calculateBondScenario(this.scenarioInput, this.rateShockBps);
    const baseScenario = calculateBondScenario(this.scenarioInput);
    if (!scenario || !baseScenario) return;

    const input = this.scenarioInput;
    const frequency = Number(input.couponFrequency);
    const baseYield = Number(input.yieldToMaturityPercent) / 100;
    const scenarioYield = baseYield + this.rateShockBps / 10000;
    const lowestYield = Math.max(baseYield - 0.03, -frequency + 0.0001);
    const highestYield = baseYield + 0.03;
    const yields = [...new Set([
      baseYield,
      scenarioYield,
      ...Array.from({ length: 25 }, (_, index) => baseYield + (index - 12) * 0.0025)
        .filter(value => value >= lowestYield && value <= highestYield)
    ])].sort((left, right) => left - right);
    const textColor = this.chartTextColor;

    this.charts.push(new Chart(this.priceYieldChart.nativeElement, {
      type: 'line',
      data: {
        labels: yields.map(value => `${(value * 100).toFixed(2)} %`),
        datasets: [
          {
            label: 'Prix exact',
            data: yields.map(value => priceBondAtYield(scenario.cashFlows, frequency, value)),
            borderColor: chartColors[0],
            backgroundColor: `${chartColors[0]}22`,
            fill: true,
            tension: 0.2,
            pointRadius: 0
          },
          {
            label: 'Duration seule',
            data: yields.map(value => baseScenario.basePrice * (1 - baseScenario.duration * (value - baseYield))),
            borderColor: '#f0a33a',
            borderDash: [5, 4],
            fill: false,
            pointRadius: 0
          },
          {
            label: 'Duration + convexité',
            data: yields.map(value => {
              const shock = value - baseYield;
              return baseScenario.basePrice * (
                1 - baseScenario.duration * shock + 0.5 * baseScenario.convexity * shock * shock
              );
            }),
            borderColor: '#8a6ac1',
            borderDash: [2, 3],
            fill: false,
            pointRadius: 0
          },
          {
            label: 'Prix de référence',
            data: yields.map(value => value === baseYield ? scenario.basePrice : null),
            borderColor: '#f0a33a',
            backgroundColor: '#f0a33a',
            pointRadius: 5,
            showLine: false
          },
          {
            label: 'Prix du scénario',
            data: yields.map(value => value === scenarioYield ? scenario.price : null),
            borderColor: '#d95757',
            backgroundColor: '#d95757',
            pointRadius: 5,
            showLine: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Prix selon le rendement', color: this.chartTitleColor },
          legend: { display: true, position: 'bottom', labels: { color: textColor, boxWidth: 10 } },
          tooltip: { callbacks: { label: context => `${context.dataset.label}: ${Number(context.raw).toFixed(4)}` } }
        },
        scales: {
          x: {
            title: { display: true, text: 'Rendement actuariel', color: textColor },
            ticks: { color: textColor, maxTicksLimit: 7 },
            grid: { color: this.chartGridColor }
          },
          y: {
            title: { display: true, text: 'Prix par nominal', color: textColor },
            ticks: { color: textColor },
            grid: { color: this.chartGridColor }
          }
        }
      }
    }));

    this.charts.push(new Chart(this.cashFlowChart.nativeElement, {
      type: 'bar',
      data: {
        labels: scenario.cashFlows.map(flow => `${flow.timeYears.toFixed(2)} an(s)`),
        datasets: [
          {
            label: 'Flux contractuel',
            data: scenario.cashFlows.map(flow => flow.amount),
            backgroundColor: `${chartColors[1]}bb`
          },
          {
            label: 'Flux actualisé',
            data: scenario.cashFlows.map(flow =>
              flow.amount / Math.pow(1 + scenarioYield / frequency, flow.timeYears * frequency)
            ),
            backgroundColor: `${chartColors[2]}bb`
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: 'Flux et valeur actualisée au rendement du scénario', color: this.chartTitleColor },
          legend: { display: true, position: 'bottom', labels: { color: textColor, boxWidth: 10 } }
        },
        scales: {
          x: { ticks: { color: textColor }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: this.chartGridColor } }
        }
      }
    }));

  }

  private get scenarioInput(): BondScenarioInput {
    return {
      faceValue: Number(this.faceValue),
      couponRatePercent: Number(this.couponRate),
      couponFrequency: Number(this.couponFrequency),
      maturityYears: Number(this.maturityYears),
      yieldToMaturityPercent: Number(this.yieldToMaturity)
    };
  }

  private chartOptions(title: string, isPie: true): ChartOptions<'pie'>;
  private chartOptions(title: string, isPie?: false): ChartOptions<'bar'>;
  private chartOptions(title: string, isPie = false): ChartOptions<'bar'> | ChartOptions<'pie'> {
    const textColor = this.chartTextColor;
    const plugins = {
      title: { display: true, text: title, color: this.chartTitleColor },
      legend: {
        display: isPie,
        position: 'right' as const,
        labels: { color: textColor, boxWidth: 10 }
      },
      tooltip: { enabled: true }
    };
    if (isPie) {
      return { responsive: true, maintainAspectRatio: false, plugins };
    }
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins,
      scales: {
        x: { ticks: { color: textColor }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: this.chartGridColor } }
      }
    };
  }

  private scatterChartOptions(title: string, xTitle: string, yTitle: string): ChartOptions<'scatter'> {
    const textColor = this.chartTextColor;
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: title, color: this.chartTitleColor },
        legend: { display: true, position: 'bottom', labels: { color: textColor, boxWidth: 10 } },
        tooltip: { enabled: true }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: xTitle, color: textColor },
          ticks: { color: textColor },
          grid: { color: this.chartGridColor }
        },
        y: {
          type: 'linear',
          title: { display: true, text: yTitle, color: textColor },
          ticks: { color: textColor },
          grid: { color: this.chartGridColor }
        }
      }
    };
  }

  private maturityYieldDatasets(chartColors: string[]): Array<{ label: string; data: Array<{ x: number; y: number }>; backgroundColor: string }> {
    const bondsByRating = new Map<string, Array<{ x: number; y: number }>>();
    for (const bond of this.bonds) {
      const years = this.yearsToMaturity(bond.maturityDate);
      if (years === null || !Number.isFinite(bond.yieldToMaturity)) continue;
      const rating = this.normalizeRating(bond.rating) || 'Non notée';
      const points = bondsByRating.get(rating) ?? [];
      points.push({ x: years, y: bond.yieldToMaturity * 100 });
      bondsByRating.set(rating, points);
    }
    return [...bondsByRating.entries()].map(([rating, data], index) => ({
      label: rating,
      data,
      backgroundColor: chartColors[index % chartColors.length]
    }));
  }

  private couponYieldDatasets(chartColors: string[]): Array<{ label: string; data: Array<{ x: number; y: number }>; backgroundColor: string }> {
    const bondsByRating = new Map<string, Array<{ x: number; y: number }>>();
    for (const bond of this.bonds) {
      if (bond.couponRate == null || !Number.isFinite(bond.couponRate) || !Number.isFinite(bond.yieldToMaturity)) continue;
      const rating = this.normalizeRating(bond.rating) || 'Non notée';
      const points = bondsByRating.get(rating) ?? [];
      points.push({ x: bond.couponRate * 100, y: bond.yieldToMaturity * 100 });
      bondsByRating.set(rating, points);
    }
    return [...bondsByRating.entries()].map(([rating, data], index) => ({
      label: rating,
      data,
      backgroundColor: chartColors[index % chartColors.length]
    }));
  }

  private yearsToMaturity(maturityDate: string): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(maturityDate)) return null;
    const maturity = new Date(`${maturityDate}T00:00:00Z`);
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    if (Number.isNaN(maturity.getTime()) || maturity.getTime() <= todayUtc) return null;
    return (maturity.getTime() - todayUtc) / (365.25 * 24 * 60 * 60 * 1000);
  }

  private countMaturities(): Map<string, number> {
    const counts = new Map<string, number>(MATURITY_BUCKETS.map(bucket => [bucket, 0] as [string, number]));
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    for (const bond of this.bonds) {
      const maturity = new Date(`${bond.maturityDate}T00:00:00Z`);
      if (Number.isNaN(maturity.getTime()) || maturity.getTime() <= todayUtc) continue;
      const years = (maturity.getTime() - todayUtc) / (365.25 * 24 * 60 * 60 * 1000);
      const bucket = years <= 5 ? '0-5Y' : years <= 10 ? '5-10Y' : years <= 20 ? '10-20Y' : '20Y+';
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    return counts;
  }

  private countBy<T>(items: T[], keyOf: (item: T) => string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = keyOf(item);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  private themeColor(variable: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback;
    return getComputedStyle(document.body).getPropertyValue(variable).trim() || fallback;
  }

  private get chartColors(): string[] {
    return [this.themeColor('--ui-accent', '#4169f5'), ...BLOOMBERG_CHART_COLORS.slice(1)];
  }

  private get chartTextColor(): string {
    return this.themeColor('--ui-muted', '#58677a');
  }

  private get chartGridColor(): string {
    return this.themeColor('--ui-border', 'rgba(88, 103, 122, 0.15)');
  }

  private get chartTitleColor(): string {
    return this.themeColor('--ui-accent', '#263445');
  }

  private normalizeRating(value: string | undefined): string {
    if (!value) return '';
    const normalized = value.trim().toUpperCase();
    const aliases: Record<string, string> = { AAA: 'AAA', AAA_MINUS: 'AAA', AA_PLUS: 'AA', AA_MINUS: 'AA', A_PLUS: 'A', A_MINUS: 'A', BBB_PLUS: 'BBB', BBB_MINUS: 'BBB', BB_PLUS: 'BB', BB_MINUS: 'BB', B_PLUS: 'B', B_MINUS: 'B' };
    const compact = normalized.replace(/[+\-]/g, match => match === '+' ? '_PLUS' : '_MINUS');
    return aliases[compact] ?? normalized;
  }

  private destroyCharts(): void {
    for (const chart of this.charts) chart.destroy();
    this.charts = [];
  }
}
