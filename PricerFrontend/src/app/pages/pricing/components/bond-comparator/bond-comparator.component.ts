import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Chart, Legend, LinearScale, LineController, LineElement, PointElement, Title, Tooltip } from 'chart.js';
import { BondComparable } from '../../../../models/bond-comparables.model';
import {
  BondComputedMetrics,
  calculateRateShockImpact,
  computeBondAnalytics
} from '../../../../services/bond-analytics-calc';

Chart.register(Legend, LinearScale, LineController, LineElement, PointElement, Title, Tooltip);

export interface BondShockResult {
  securityId: string;
  name: string;
  currentPrice: number;
  newPrice: number;
  pctChange: number;
  monetaryChange: number;
}

export interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  checked: boolean;
}

@Component({
  selector: 'app-bond-comparator',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './bond-comparator.component.html',
  styleUrls: ['./bond-comparator.component.scss']
})
export class BondComparatorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() selectedBonds: BondComparable[] = [];
  @Input() allBonds: BondComparable[] = [];
  @ViewChild('shockComparisonChart')
  set shockComparisonCanvas(canvas: ElementRef<HTMLCanvasElement> | undefined) {
    this.shockCanvas = canvas;
    if (!canvas) {
      this.shockChart?.destroy();
      this.shockChart = null;
      return;
    }
    this.updateShockChart();
  }

  @Output() removeBond = new EventEmitter<string>();
  @Output() addBond = new EventEmitter<string>();
  @Output() openInBloomberg = new EventEmitter<string>();

  metricsMap = new Map<string, BondComputedMetrics>();
  selectedBondForChecklist = '';
  private shockChart: Chart<'line'> | null = null;
  private shockChartReady = false;
  private shockCanvas: ElementRef<HTMLCanvasElement> | undefined;

  // Simulator controls
  rateShockBps = 100;
  investedAmount = 100000;
  bondToAddId = '';

  // 10-point inspection checklist based on application_bonds2.md
  checklist: ChecklistItem[] = [
    { id: 'ytm', category: 'Rendement', title: 'YTM & Coupons', description: 'Le rendement actuariel (YTM) rémunère-t-il suffisamment la période d’immobilisation ?', checked: true },
    { id: 'credit', category: 'Crédit', title: 'Notation & Solvabilité', description: 'La qualité de crédit (rating S&P/Moody’s) et la trajectoire d’endettement sont-elles saines ?', checked: true },
    { id: 'rates', category: 'Taux', title: 'Duration & Convexité', description: 'La duration modifiée est-elle en adéquation avec votre tolérance aux hausses de taux ?', checked: true },
    { id: 'spread', category: 'Spread', title: 'G-Spread vs Souverain', description: 'La prime de risque par rapport aux emprunts d’État (Bund / OAT) est-elle attractive ?', checked: true },
    { id: 'liquidity', category: 'Liquidité', title: 'Liquidité & Encours', description: 'L’émission dépasse-t-elle 500 M€ et le spread bid/ask est-il raisonnable ?', checked: false },
    { id: 'structure', category: 'Structure', title: 'Séniorité & Clauses', description: 'Rang de remboursement (Senior vs Subordonné) et absence de clauses défavorables de call ?', checked: true },
    { id: 'macro', category: 'Macro', title: 'Inflation & Change', description: 'Le rendement net d’inflation reste-t-il positif et le risque de change est-il maîtrisé ?', checked: false },
    { id: 'esg', category: 'ESG', title: 'Facteurs ESG & Green Bond', description: 'Prise en compte des risques de transition écologique et des controverses majeures ?', checked: true },
    { id: 'tax', category: 'Fiscalité', title: 'Rendement net réel', description: 'Prise en compte du régime fiscal et des frais d’intermédiation ?', checked: false },
    { id: 'portfolio', category: 'Portefeuille', title: 'Diversification & Poids', description: 'Le titre limite-t-il la concentration sectorielle ou émetteur dans votre portefeuille ?', checked: true }
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedBonds']) {
      this.recalculateAllMetrics();
      if (!this.selectedBondForChecklist && this.selectedBonds.length > 0) {
        this.selectedBondForChecklist = this.selectedBonds[0].securityId;
      }
      this.updateShockChart();
    }
  }

  ngAfterViewInit(): void {
    this.shockChartReady = true;
    this.updateShockChart();
  }

  ngOnDestroy(): void {
    this.shockChart?.destroy();
  }

  private recalculateAllMetrics(): void {
    this.metricsMap.clear();
    for (const bond of this.selectedBonds) {
      this.metricsMap.set(bond.securityId, computeBondAnalytics(bond));
    }
  }

  getMetrics(securityId: string): BondComputedMetrics | undefined {
    return this.metricsMap.get(securityId);
  }

  get availableBondsToAdd(): BondComparable[] {
    const selectedIds = new Set(this.selectedBonds.map(b => b.securityId));
    return this.allBonds.filter(b => !selectedIds.has(b.securityId));
  }

  onAddSelectedBond(): void {
    if (this.bondToAddId) {
      this.addBond.emit(this.bondToAddId);
      this.bondToAddId = '';
    }
  }

  onRemoveBond(securityId: string): void {
    this.removeBond.emit(securityId);
    if (this.selectedBondForChecklist === securityId) {
      const remaining = this.selectedBonds.filter(b => b.securityId !== securityId);
      this.selectedBondForChecklist = remaining.length > 0 ? remaining[0].securityId : '';
    }
  }

  get checkedCount(): number {
    return this.checklist.filter(item => item.checked).length;
  }

  get simulationResults(): BondShockResult[] {
    return this.selectedBonds.map(bond => {
      const metrics = this.getMetrics(bond.securityId);
      if (!metrics) {
        return {
          securityId: bond.securityId,
          name: bond.name || bond.securityId,
          currentPrice: 100,
          newPrice: 100,
          pctChange: 0,
          monetaryChange: 0
        };
      }

      const impact = calculateRateShockImpact(
        metrics.modifiedDuration,
        metrics.convexity,
        this.rateShockBps,
        this.investedAmount,
        metrics.cleanPrice
      );

      return {
        securityId: bond.securityId,
        name: bond.name || bond.securityId,
        currentPrice: metrics.cleanPrice,
        newPrice: impact.newPrice,
        pctChange: impact.pctChange,
        monetaryChange: impact.monetaryChange
      };
    });
  }

  setQuickShock(bps: number): void {
    this.rateShockBps = bps;
    this.updateShockChart();
  }

  onRateShockChange(): void {
    this.updateShockChart();
  }

  private updateShockChart(): void {
    if (!this.shockChartReady || !this.shockCanvas) return;

    const shocks = Array.from({ length: 61 }, (_, index) => -300 + index * 10);
    const colors = ['#2563eb', '#d94841', '#218653', '#8a5da8', '#0f8b8d'];
    const datasets = this.selectedBonds.flatMap((bond, index) => {
      const metrics = this.getMetrics(bond.securityId);
      if (!metrics) return [];

      const color = colors[index % colors.length];
      return [{
        label: bond.securityId || bond.name,
        data: shocks.map(shockBps => ({
          x: shockBps,
          y: calculateRateShockImpact(
            metrics.modifiedDuration,
            metrics.convexity,
            shockBps,
            this.investedAmount,
            metrics.cleanPrice
          ).pctChange
        })),
        borderColor: color,
        backgroundColor: color,
        pointRadius: shocks.map(shockBps => shockBps === Number(this.rateShockBps) ? 3 : 0),
        pointHoverRadius: 4,
        tension: 0.2
      }];
    });

    if (!this.shockChart) {
      this.shockChart = new Chart(this.shockCanvas.nativeElement, {
        type: 'line',
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            title: { display: true, text: 'Variation estimée selon le choc de taux' },
            legend: { display: true, position: 'bottom' },
            tooltip: {
              callbacks: {
                title: items => `${items[0]?.parsed.x ?? 0} pb`,
                label: context => `${context.dataset.label}: ${(context.parsed.y ?? 0).toFixed(2)} %`
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              title: { display: true, text: 'Choc de rendement (pb)' },
              ticks: { maxTicksLimit: 9 }
            },
            y: {
              title: { display: true, text: 'Variation estimée du prix (%)' }
            }
          }
        }
      });
      return;
    }

    this.shockChart.data.datasets = datasets;
    this.shockChart.update('none');
  }

  toggleChecklistItem(item: ChecklistItem): void {
    item.checked = !item.checked;
  }

  resetChecklist(): void {
    for (const item of this.checklist) {
      item.checked = false;
    }
  }

  selectAllChecklist(): void {
    for (const item of this.checklist) {
      item.checked = true;
    }
  }

  printTearSheet(): void {
    window.print();
  }

  exportComparisonCsv(): void {
    if (!this.selectedBonds.length) return;

    const headers = ['Critère', ...this.selectedBonds.map(b => `"${b.securityId} (${b.name})"` )];
    const rows = [
      ['Émetteur', ...this.selectedBonds.map(b => `"${b.issuer || '—'}"`)],
      ['Devise', ...this.selectedBonds.map(b => b.currency)],
      ['Notation', ...this.selectedBonds.map(b => b.rating || 'NR')],
      ['Séniorité', ...this.selectedBonds.map(b => `"${b.seniority || 'Senior Unsecured'}"`)],
      ['Prix Clean (%)', ...this.selectedBonds.map(b => String(this.getMetrics(b.securityId)?.cleanPrice ?? '—'))],
      ['Prix Dirty (%)', ...this.selectedBonds.map(b => String(this.getMetrics(b.securityId)?.dirtyPrice ?? '—'))],
      ['YTM (%)', ...this.selectedBonds.map(b => String(this.getMetrics(b.securityId)?.yieldToMaturity ?? '—'))],
      ['G-Spread (bp)', ...this.selectedBonds.map(b => String(this.getMetrics(b.securityId)?.gSpreadBps ?? '—'))],
      ['Duration Modifiée (ans)', ...this.selectedBonds.map(b => String(this.getMetrics(b.securityId)?.modifiedDuration ?? '—'))],
      ['Convexité', ...this.selectedBonds.map(b => String(this.getMetrics(b.securityId)?.convexity ?? '—'))],
      ['DV01 (100k)', ...this.selectedBonds.map(b => String(this.getMetrics(b.securityId)?.dv01 ?? '—'))],
      ['Ratio YTM / Dur (%/an)', ...this.selectedBonds.map(b => String(this.getMetrics(b.securityId)?.yieldToDurationRatio ?? '—'))],
      ['Statut Relative Value', ...this.selectedBonds.map(b => this.getMetrics(b.securityId)?.relativeValueStatus ?? '—')]
    ];

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `comparatif-obligations-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }
}
