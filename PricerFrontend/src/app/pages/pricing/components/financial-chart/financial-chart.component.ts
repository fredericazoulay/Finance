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
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

import { FinancialMathService, OptionGreeks } from '../../../../services/financial-math.service';
import { ThemeService } from '../../../../services/theme.service';

Chart.register(
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
  selector: 'app-financial-chart',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './financial-chart.component.html',
  styleUrls: ['./financial-chart.component.scss']
})
export class FinancialChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  @Input() product = 'EQTY_OPT';
  @Input() formValues: Record<string, any> = {};
  @Input() lastPrice: number | null = null;

  private chart: Chart | null = null;
  private themeSub?: Subscription;

  greeks: OptionGreeks | null = null;
  sliderSpotOffset = 0; // percentage offset -30% to +30%

  constructor(
    private readonly mathService: FinancialMathService,
    readonly themeService: ThemeService
  ) {}

  ngAfterViewInit(): void {
    this.createOrUpdateChart();
    this.themeSub = this.themeService.isLightTheme$.subscribe(() => {
      this.createOrUpdateChart();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product']) {
      this.sliderSpotOffset = 0;
    }
    if (this.chartCanvas) {
      this.createOrUpdateChart();
    }
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    this.chart?.destroy();
  }

  onSpotSliderChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.sliderSpotOffset = Number(target.value);
    this.createOrUpdateChart();
  }

  resetSpotSlider(): void {
    this.sliderSpotOffset = 0;
    this.createOrUpdateChart();
  }

  get effectiveSpot(): number {
    const baseSpot = Number(this.formValues['underlying_spot'] || this.formValues['spot'] || 100);
    return Number((baseSpot * (1 + this.sliderSpotOffset / 100)).toFixed(2));
  }

  private createOrUpdateChart(): void {
    if (!this.chartCanvas) return;

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const config = this.buildChartConfig();
    if (config) {
      this.chart = new Chart(this.chartCanvas.nativeElement, config);
    }
  }

  private buildChartConfig(): ChartConfiguration | null {
    const isLight = this.themeService.isLightTheme;
    const textColor = isLight ? '#072024' : '#d9ebff';
    const gridColor = isLight ? 'rgba(7, 20, 29, 0.08)' : 'rgba(124, 181, 255, 0.12)';

    if (this.product === 'EQTY_OPT') {
      return this.buildOptionsPayoffConfig(textColor, gridColor);
    }

    if (this.product === 'IRS' || this.product === 'CDS') {
      return this.buildYieldCurveConfig(textColor, gridColor);
    }

    if (this.product === 'BOND') {
      return this.buildBondCashFlowConfig(textColor, gridColor);
    }

    return this.buildForwardCurveConfig(textColor, gridColor);
  }

  private buildOptionsPayoffConfig(textColor: string, gridColor: string): ChartConfiguration {
    const spot = this.effectiveSpot;
    const strike = Number(this.formValues['strike'] || 100);
    const rate = Number(this.formValues['risk_free_rate'] || 0.05);
    const vol = Number(this.formValues['implied_volatility'] || 0.2);
    const t = Number(this.formValues['maturity_years'] || 1);
    const q = Number(this.formValues['dividend_yield'] || 0);
    const isCall = (this.formValues['option_type'] || 'CALL') === 'CALL';

    const bs = this.mathService.calculateBlackScholes(spot, strike, rate, vol, t, q, isCall);
    this.greeks = bs.greeks;

    const points = this.mathService.generatePayoffCurve(spot, strike, rate, vol, t, q, isCall, 35);
    const labels = points.map(p => `$${p.spot}`);
    const payoffData = points.map(p => p.payoffAtExpiry);
    const theoreticalData = points.map(p => p.theoreticalValue);

    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: isCall ? 'Call P&L at Expiry' : 'Put P&L at Expiry',
            data: payoffData,
            borderColor: '#3ae374',
            backgroundColor: 'rgba(58, 227, 116, 0.08)',
            fill: true,
            tension: 0.1,
            pointRadius: 2,
            pointHoverRadius: 5
          },
          {
            label: 'Current Value (Black-Scholes P&L)',
            data: theoreticalData,
            borderColor: '#59b6ff',
            borderDash: [5, 5],
            fill: false,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 5
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
            labels: { color: textColor, font: { size: 11, family: 'Segoe UI' } }
          },
          tooltip: {
            backgroundColor: 'rgba(7, 20, 29, 0.95)',
            titleColor: '#9fe1ff',
            bodyColor: '#eaf6ff',
            borderColor: 'rgba(124, 181, 255, 0.3)',
            borderWidth: 1,
            callbacks: {
              label: context => ` ${context.dataset.label}: $${Number(context.raw).toFixed(2)}`
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Underlying Stock Price ($)', color: textColor, font: { size: 11 } },
            ticks: { color: textColor, maxTicksLimit: 8 },
            grid: { color: gridColor }
          },
          y: {
            title: { display: true, text: 'Profit / Loss ($)', color: textColor, font: { size: 11 } },
            ticks: { color: textColor, callback: val => `$${val}` },
            grid: { color: gridColor }
          }
        }
      }
    };
  }

  private buildYieldCurveConfig(textColor: string, gridColor: string): ChartConfiguration {
    this.greeks = null;
    const tenors = (this.formValues['tenors'] || [1, 2, 3, 5, 7, 10]) as number[];
    const rates = (this.formValues['discount_curve_rates'] || [0.018, 0.022, 0.025, 0.029, 0.031, 0.033]) as number[];

    const labels = tenors.map(t => `${t}Y`);
    const ratePercent = rates.map(r => Number((r * 100).toFixed(3)));
    const discountFactors = tenors.map((t, i) => Number((1 / Math.pow(1 + (rates[i] || 0.02), t)).toFixed(4)));

    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Yield Curve Rate (%)',
            data: ratePercent,
            borderColor: '#59b6ff',
            backgroundColor: 'rgba(89, 182, 255, 0.12)',
            fill: true,
            tension: 0.35,
            pointRadius: 5,
            pointBackgroundColor: '#59b6ff',
            yAxisID: 'y'
          },
          {
            label: 'Discount Factor (DF)',
            data: discountFactors,
            borderColor: '#ffbf69',
            borderDash: [4, 4],
            fill: false,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#ffbf69',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
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
            borderWidth: 1
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Tenor (Maturity)', color: textColor, font: { size: 11 } },
            ticks: { color: textColor },
            grid: { color: gridColor }
          },
          y: {
            title: { display: true, text: 'Zero Rate (%)', color: textColor, font: { size: 11 } },
            ticks: { color: textColor, callback: val => `${val}%` },
            grid: { color: gridColor },
            position: 'left'
          },
          y1: {
            title: { display: true, text: 'Discount Factor', color: textColor, font: { size: 11 } },
            ticks: { color: textColor },
            grid: { drawOnChartArea: false },
            position: 'right'
          }
        }
      }
    };
  }

  private buildBondCashFlowConfig(textColor: string, gridColor: string): ChartConfiguration {
    this.greeks = null;
    const maturity = Number(this.formValues['maturity_years'] || 5);
    const ytm = Number(this.formValues['yield_to_maturity'] || 0.035);
    const faceValue = Number(this.formValues['face_value'] || 100);
    const couponRate = Number(this.formValues['coupon_rate'] || 0.04);
    const annualCoupon = faceValue * couponRate;

    const years = Array.from({ length: maturity }, (_, i) => i + 1);
    const discountedCashFlows = years.map((year, idx) => {
      const isFinal = idx === years.length - 1;
      const cashFlow = isFinal ? annualCoupon + faceValue : annualCoupon;
      return Number((cashFlow / Math.pow(1 + ytm, year)).toFixed(2));
    });

    return {
      type: 'line',
      data: {
        labels: years.map(y => `Year ${y}`),
        datasets: [
          {
            label: 'Discounted Cash Flows ($)',
            data: discountedCashFlows,
            borderColor: '#3ae374',
            backgroundColor: 'rgba(58, 227, 116, 0.15)',
            fill: true,
            tension: 0.25,
            pointRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: textColor }
          }
        },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: {
            ticks: { color: textColor, callback: val => `$${val}` },
            grid: { color: gridColor }
          }
        }
      }
    };
  }

  private buildForwardCurveConfig(textColor: string, gridColor: string): ChartConfiguration {
    this.greeks = null;
    const spot = Number(this.formValues['spot'] || 1.08);
    const domRate = Number(this.formValues['domestic_rate'] || 0.05);
    const forRate = Number(this.formValues['foreign_rate'] || 0.02);

    const periods = [0.25, 0.5, 1, 2, 3, 5];
    const forwardPrices = periods.map(t => Number((spot * Math.exp((domRate - forRate) * t)).toFixed(5)));

    return {
      type: 'line',
      data: {
        labels: periods.map(t => `${t}Y`),
        datasets: [
          {
            label: 'Implied FX Forward Rate',
            data: forwardPrices,
            borderColor: '#59b6ff',
            backgroundColor: 'rgba(89, 182, 255, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: textColor }
          }
        },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        }
      }
    };
  }
}
