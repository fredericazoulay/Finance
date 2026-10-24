import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import { OptionImportRecord } from '../../../../models/option-import.model';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

@Component({
  selector: 'app-full-option-graphs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './full-option-graphs.component.html',
  styleUrls: ['./full-option-graphs.component.scss']
})
export class FullOptionGraphsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) option!: OptionImportRecord;
  @ViewChild('marketChart') marketChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('riskChart') riskChart!: ElementRef<HTMLCanvasElement>;

  private marketChartInstance: Chart<'bar', number[], string> | null = null;
  private riskChartInstance: Chart<'bar', number[], string> | null = null;

  ngAfterViewInit(): void {
    this.updateCharts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['option'] && this.marketChart && this.riskChart) this.updateCharts();
  }

  ngOnDestroy(): void {
    this.marketChartInstance?.destroy();
    this.riskChartInstance?.destroy();
  }

  private updateCharts(): void {
    if (!this.marketChart || !this.riskChart || !this.option) return;
    this.marketChartInstance?.destroy();
    this.riskChartInstance?.destroy();
    const isLight = document.body.classList.contains('light-theme');
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