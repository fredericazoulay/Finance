import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import {
  Chart,
  ChartConfiguration,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

import { AmortizationRow } from '../../../../models/calculator.model';
import { ThemeService } from '../../../../services/theme.service';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
);

@Component({
  selector: 'app-amortization-chart',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './amortization-chart.component.html',
  styleUrls: ['./amortization-chart.component.scss']
})
export class AmortizationChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  @Input() schedule: AmortizationRow[] = [];
  @Input() selectedCalculator = 'loan';

  private chart: Chart | null = null;
  private themeSub?: Subscription;

  totalPrincipal = 0;
  totalInterest = 0;
  totalPaid = 0;

  constructor(readonly themeService: ThemeService) {}

  ngAfterViewInit(): void {
    this.computeTotals();
    this.createOrUpdateChart();
    this.themeSub = this.themeService.isLightTheme$.subscribe(() => {
      this.createOrUpdateChart();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['schedule']) {
      this.computeTotals();
      if (this.chartCanvas) {
        this.createOrUpdateChart();
      }
    }
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    this.chart?.destroy();
  }

  private computeTotals(): void {
    if (!this.schedule || !this.schedule.length) {
      this.totalPrincipal = 0;
      this.totalInterest = 0;
      this.totalPaid = 0;
      return;
    }

    let pSum = 0;
    let iSum = 0;
    for (const row of this.schedule) {
      pSum += Number(row.principal) || 0;
      iSum += Number(row.interest) || 0;
    }
    this.totalPrincipal = Number(pSum.toFixed(2));
    this.totalInterest = Number(iSum.toFixed(2));
    this.totalPaid = Number((pSum + iSum).toFixed(2));
  }

  private createOrUpdateChart(): void {
    if (!this.chartCanvas || !this.schedule || !this.schedule.length) return;

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const config = this.buildConfig();
    if (config) {
      this.chart = new Chart(this.chartCanvas.nativeElement, config);
    }
  }

  private buildConfig(): ChartConfiguration | null {
    if (!this.schedule.length) return null;

    const isLight = this.themeService.isLightTheme;
    const textColor = isLight ? '#072024' : '#d9ebff';
    const gridColor = isLight ? 'rgba(7, 20, 29, 0.08)' : 'rgba(124, 181, 255, 0.12)';

    // Downsample if more than 60 rows for smooth rendering
    const step = Math.max(1, Math.floor(this.schedule.length / 40));
    const sample = this.schedule.filter((_, idx) => idx % step === 0 || idx === this.schedule.length - 1);

    const labels = sample.map(r => `P${r.period}`);
    const principalData = sample.map(r => Number(r.principal));
    const interestData = sample.map(r => Number(r.interest));
    const balanceData = sample.map(r => Number(r.balance));

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: 'Remaining Balance ($)',
            data: balanceData,
            borderColor: '#59b6ff',
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.2,
            yAxisID: 'y1'
          },
          {
            label: 'Principal Paid ($)',
            data: principalData,
            backgroundColor: '#3ae374',
            stack: 'combined',
            yAxisID: 'y'
          },
          {
            label: 'Interest Paid ($)',
            data: interestData,
            backgroundColor: '#ff7d7d',
            stack: 'combined',
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: {
            display: true,
            labels: { color: textColor, font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: 'rgba(7, 20, 29, 0.95)',
            titleColor: '#9fe1ff',
            bodyColor: '#eaf6ff',
            borderColor: 'rgba(124, 181, 255, 0.3)',
            borderWidth: 1,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: $${Number(ctx.raw).toLocaleString()}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: textColor, maxTicksLimit: 12 },
            grid: { color: gridColor },
            stacked: true
          },
          y: {
            title: { display: true, text: 'Periodic Breakdown ($)', color: textColor, font: { size: 11 } },
            ticks: { color: textColor, callback: val => `$${val}` },
            grid: { color: gridColor },
            stacked: true,
            position: 'left'
          },
          y1: {
            title: { display: true, text: 'Remaining Balance ($)', color: textColor, font: { size: 11 } },
            ticks: { color: textColor, callback: val => `$${val}` },
            grid: { drawOnChartArea: false },
            position: 'right'
          }
        }
      }
    };
  }
}
