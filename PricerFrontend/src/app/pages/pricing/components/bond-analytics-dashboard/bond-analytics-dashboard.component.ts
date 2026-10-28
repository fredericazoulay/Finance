import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartOptions,
  Legend,
  LinearScale,
  PointElement,
  PieController,
  ScatterController,
  Title,
  Tooltip
} from 'chart.js';
import { BondComparable } from '../../../../models/bond-comparables.model';

Chart.register(ArcElement, BarController, BarElement, CategoryScale, Legend, LinearScale, PieController, PointElement, ScatterController, Title, Tooltip);

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
  @ViewChild('currencyChart') currencyChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('maturityChart') maturityChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('ratingChart') ratingChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('yieldRatingChart') yieldRatingChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('sectorChart') sectorChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('maturityYieldChart') maturityYieldChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('couponYieldChart') couponYieldChart!: ElementRef<HTMLCanvasElement>;

  private charts: Chart[] = [];
  private themeObserver: MutationObserver | null = null;
  private viewInitialized = false;

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
    if (changes['bonds'] && this.viewInitialized) this.updateCharts();
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
  }

  private chartOptions(title: string, isPie: true): ChartOptions<'pie'>;
  private chartOptions(title: string, isPie?: false): ChartOptions<'bar'>;
  private chartOptions(title: string, isPie = false): ChartOptions<'bar'> | ChartOptions<'pie'> {
    const textColor = this.chartTextColor;
    const plugins = {
      title: { display: true, text: title, color: this.isBloombergTheme ? '#ffad33' : '#263445' },
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
        title: { display: true, text: title, color: this.isBloombergTheme ? '#ffad33' : '#263445' },
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

  private get isBloombergTheme(): boolean {
    return typeof document !== 'undefined' && document.body.classList.contains('bloomberg-theme');
  }

  private get chartColors(): string[] {
    return this.isBloombergTheme ? BLOOMBERG_CHART_COLORS : CHART_COLORS;
  }

  private get chartTextColor(): string {
    return this.isBloombergTheme ? '#c9c9c9' : '#58677a';
  }

  private get chartGridColor(): string {
    return this.isBloombergTheme ? 'rgba(255, 140, 0, 0.15)' : 'rgba(88, 103, 122, 0.15)';
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
