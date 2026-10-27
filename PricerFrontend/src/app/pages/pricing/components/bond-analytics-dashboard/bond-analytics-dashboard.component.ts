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
  Tooltip
} from 'chart.js';
import { BondComparable } from '../../../../models/bond-comparables.model';

Chart.register(ArcElement, BarController, BarElement, CategoryScale, Legend, LinearScale, Tooltip);

const MATURITY_BUCKETS = ['0-5Y', '5-10Y', '10-20Y', '20Y+'];
const RATINGS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D'];
const CHART_COLORS = ['#4169f5', '#b44848', '#87a847', '#795d9b', '#44a1b3', '#e2863e', '#38a8a0', '#9d78c1'];

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

  private charts: Chart[] = [];
  private viewInitialized = false;

  get bondsWithRating(): BondComparable[] {
    return this.bonds.filter(bond => Boolean(this.normalizeRating(bond.rating)));
  }

  get bondsWithYieldAndRating(): BondComparable[] {
    return this.bondsWithRating.filter(bond => Number.isFinite(bond.yieldToMaturity));
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.updateCharts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['bonds'] && this.viewInitialized) this.updateCharts();
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  private updateCharts(): void {
    if (!this.viewInitialized) return;
    this.destroyCharts();

    const currencyCounts = this.countBy(this.bonds, bond => bond.currency?.trim().toUpperCase() || '');
    const maturityCounts = this.countMaturities();
    const ratingCounts = this.countBy(this.bondsWithRating, bond => this.normalizeRating(bond.rating));
    const ratings = [...RATINGS.filter(rating => ratingCounts.has(rating)), ...[...ratingCounts.keys()].filter(rating => !RATINGS.includes(rating))];
    const averageYields = ratings.map(rating => {
      const values = this.bondsWithYieldAndRating
        .filter(bond => this.normalizeRating(bond.rating) === rating)
        .map(bond => bond.yieldToMaturity * 100);
      return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
    });

    this.charts = [
      new Chart(this.currencyChart.nativeElement, {
        type: 'pie',
        data: {
          labels: [...currencyCounts.keys()],
          datasets: [{ data: [...currencyCounts.values()], backgroundColor: CHART_COLORS }]
        },
        options: this.chartOptions('Obligations par devise', true)
      }),
      new Chart(this.maturityChart.nativeElement, {
        type: 'bar',
        data: {
          labels: MATURITY_BUCKETS,
          datasets: [{ label: 'Nombre d’obligations', data: MATURITY_BUCKETS.map(bucket => maturityCounts.get(bucket) ?? 0), backgroundColor: CHART_COLORS }]
        },
        options: this.chartOptions('Obligations par tranche d’échéance')
      }),
      new Chart(this.ratingChart.nativeElement, {
        type: 'bar',
        data: {
          labels: ratings,
          datasets: [{ label: 'Nombre d’obligations', data: ratings.map(rating => ratingCounts.get(rating) ?? 0), backgroundColor: CHART_COLORS }]
        },
        options: this.chartOptions('Obligations par notation')
      })
    ];

    this.charts.push(new Chart(this.yieldRatingChart.nativeElement, {
      type: 'bar',
      data: {
        labels: ratings,
        datasets: [{ label: 'YTM moyen (%)', data: averageYields, backgroundColor: CHART_COLORS }]
      },
      options: this.chartOptions('YTM moyen par notation')
    }));
  }

  private chartOptions(title: string, isPie: true): ChartOptions<'pie'>;
  private chartOptions(title: string, isPie?: false): ChartOptions<'bar'>;
  private chartOptions(title: string, isPie = false): ChartOptions<'bar'> | ChartOptions<'pie'> {
    const plugins = {
      title: { display: true, text: title, color: '#263445' },
      legend: {
        display: isPie,
        position: 'right' as const,
        labels: { color: '#58677a', boxWidth: 10 }
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
        x: { ticks: { color: '#58677a' }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: '#58677a' }, grid: { color: 'rgba(88, 103, 122, 0.15)' } }
      }
    };
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
