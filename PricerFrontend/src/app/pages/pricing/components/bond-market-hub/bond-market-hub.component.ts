import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Chart, ChartOptions, Legend, LineController, LineElement, LinearScale, PointElement, Title, Tooltip } from 'chart.js';
import { Subscription } from 'rxjs';
import {
  BondMarketQuote,
  LiveMarketSnapshot,
  MacroIndicator,
  MarketDataLiveService,
  SovereignYieldCurve
} from '../../../../services/market-data-live.service';

Chart.register(LineController, LineElement, LinearScale, PointElement, Title, Tooltip, Legend);

@Component({
  selector: 'app-bond-market-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './bond-market-hub.component.html',
  styleUrls: ['./bond-market-hub.component.scss']
})
export class BondMarketHubComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() applyLiveRates = new EventEmitter<void>();
  @Output() addBenchmarkToCompare = new EventEmitter<string>();

  @ViewChild('yieldCurveCanvas') yieldCurveCanvas!: ElementRef<HTMLCanvasElement>;

  snapshot: LiveMarketSnapshot | null = null;
  isSyncing = false;
  appliedSuccessMessage = '';
  private chart: Chart | null = null;
  private sub?: Subscription;

  selectedMacroCategory: 'ALL' | 'RATES' | 'SPREADS' | 'MONEY_MARKET' | 'INFLATION' = 'ALL';

  constructor(readonly marketDataService: MarketDataLiveService) {}

  ngOnInit(): void {
    this.sub = this.marketDataService.snapshot$.subscribe(snap => {
      this.snapshot = snap;
      this.updateChart();
    });

    this.sub.add(
      this.marketDataService.isSyncing$.subscribe(syncing => {
        this.isSyncing = syncing;
      })
    );
  }

  ngAfterViewInit(): void {
    this.updateChart();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.chart?.destroy();
  }

  refresh(): void {
    this.marketDataService.refreshLiveMarketData().subscribe({
      next: () => {
        this.appliedSuccessMessage = 'Données de marché actualisées avec succès (FRED / BCE / Yahoo).';
        setTimeout(() => this.appliedSuccessMessage = '', 4000);
      }
    });
  }

  onApplyLiveRates(): void {
    this.applyLiveRates.emit();
    this.appliedSuccessMessage = 'Courbes des taux live appliquées au Pricer et au Comparateur.';
    setTimeout(() => this.appliedSuccessMessage = '', 4000);
  }

  get filteredMacroIndicators(): MacroIndicator[] {
    if (!this.snapshot) return [];
    if (this.selectedMacroCategory === 'ALL') return this.snapshot.macroIndicators;
    return this.snapshot.macroIndicators.filter(i => i.category === this.selectedMacroCategory);
  }

  private updateChart(): void {
    if (!this.yieldCurveCanvas || !this.snapshot) return;

    this.chart?.destroy();

    const usNodes = this.snapshot.usCurve.nodes;
    const euNodes = this.snapshot.euCurve.nodes;

    const ctx = this.yieldCurveCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const textColor = getComputedStyle(document.body).getPropertyValue('--ui-text').trim() || '#334155';
    const gridColor = getComputedStyle(document.body).getPropertyValue('--ui-border').trim() || 'rgba(0,0,0,0.08)';

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'US Treasury Curve (FRED / DGS)',
            data: usNodes.map(n => ({ x: n.years, y: n.ratePercent })),
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 5,
            pointHoverRadius: 7
          },
          {
            label: 'Euro Area AAA / Bund Curve (BCE)',
            data: euNodes.map(n => ({ x: n.years, y: n.ratePercent })),
            borderColor: '#059669',
            backgroundColor: 'rgba(5, 150, 105, 0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 5,
            pointHoverRadius: 7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Courbes des taux souveraines comparées (Spot Yields)',
            color: textColor,
            font: { size: 14, weight: 'bold' }
          },
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: textColor, boxWidth: 12 }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const pt = context.raw as { x: number; y: number };
                return `${context.dataset.label}: ${pt.y.toFixed(3)}% (${pt.x} an(s))`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Maturité (Années)', color: textColor },
            ticks: { color: textColor },
            grid: { color: gridColor }
          },
          y: {
            title: { display: true, text: 'Rendement actuariel (%)', color: textColor },
            ticks: { color: textColor },
            grid: { color: gridColor }
          }
        }
      }
    });
  }
}
