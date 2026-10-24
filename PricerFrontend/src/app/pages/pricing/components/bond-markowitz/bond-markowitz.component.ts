import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, LinearScale, PointElement, ScatterController, Tooltip } from 'chart.js';
import { OptionImportRecord } from '../../../../models/option-import.model';

Chart.register(LinearScale, PointElement, ScatterController, Tooltip);

interface BondRiskPoint {
  id: string;
  securityId: string;
  currency: string;
  expectedReturn: number;
  risk: number;
  sourceCount: number;
}

@Component({
  selector: 'app-bond-markowitz',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bond-markowitz.component.html',
  styleUrls: ['./bond-markowitz.component.scss']
})
export class BondMarkowitzComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() options: OptionImportRecord[] = [];
  @ViewChild('riskReturnChart') riskReturnChart!: ElementRef<HTMLCanvasElement>;

  riskAppetite = 70;
  portfolioSize = 5;
  bonds: BondRiskPoint[] = [];
  selectedBondIds = new Set<string>();

  private chart: Chart<'scatter', { x: number; y: number }[], string> | null = null;

  ngAfterViewInit(): void {
    this.updateChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) {
      this.bonds = this.aggregateBonds();
      this.applyRecommendations();
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  get profileLabel(): string {
    if (this.riskAppetite < 34) return 'Prudent';
    if (this.riskAppetite < 67) return 'Équilibré';
    return 'Riskophile';
  }

  get selectedBonds(): BondRiskPoint[] {
    return this.bonds.filter(bond => this.selectedBondIds.has(bond.id));
  }

  get portfolioExpectedReturn(): number | null {
    return this.average(this.selectedBonds.map(bond => bond.expectedReturn));
  }

  get portfolioAverageRisk(): number | null {
    return this.average(this.selectedBonds.map(bond => bond.risk));
  }

  setRiskAppetite(event: Event): void {
    this.riskAppetite = Number((event.target as HTMLInputElement).value);
    this.applyRecommendations();
  }

  setPortfolioSize(event: Event): void {
    this.portfolioSize = Number((event.target as HTMLInputElement).value);
    this.applyRecommendations();
  }

  isSelected(id: string): boolean {
    return this.selectedBondIds.has(id);
  }

  toggleBond(id: string): void {
    const nextSelection = new Set(this.selectedBondIds);
    if (nextSelection.has(id)) nextSelection.delete(id);
    else nextSelection.add(id);
    this.selectedBondIds = nextSelection;
    this.updateChart();
  }

  private aggregateBonds(): BondRiskPoint[] {
    const grouped = new Map<string, { securityId: string; currency: string; returns: number[]; risks: number[] }>();
    for (const option of this.options) {
      const securityId = option.underlyingSecurityId.trim();
      const expectedReturn = option.underlyingYieldToMaturity;
      const risk = option.volatility;
      if (!securityId || typeof expectedReturn !== 'number' || !Number.isFinite(expectedReturn) ||
          typeof risk !== 'number' || !Number.isFinite(risk) || risk < 0) continue;

      const currency = option.currency.trim().toUpperCase();
      const id = `${currency}::${securityId}`;
      const entry = grouped.get(id) ?? { securityId, currency, returns: [], risks: [] };
      entry.returns.push(expectedReturn);
      entry.risks.push(risk);
      grouped.set(id, entry);
    }

    return [...grouped.entries()].map(([id, entry]) => ({
      id,
      securityId: entry.securityId,
      currency: entry.currency,
      expectedReturn: this.average(entry.returns) ?? 0,
      risk: this.average(entry.risks) ?? 0,
      sourceCount: entry.returns.length
    })).sort((left, right) => left.securityId.localeCompare(right.securityId));
  }

  private applyRecommendations(): void {
    const rankedBonds = this.rankBonds();
    this.selectedBondIds = new Set(rankedBonds.slice(0, this.portfolioSize).map(bond => bond.id));
    this.updateChart();
  }

  private rankBonds(): BondRiskPoint[] {
    if (!this.bonds.length) return [];
    const returns = this.bonds.map(bond => bond.expectedReturn);
    const risks = this.bonds.map(bond => bond.risk);
    const minReturn = Math.min(...returns);
    const returnRange = Math.max(...returns) - minReturn || 1;
    const minRisk = Math.min(...risks);
    const riskRange = Math.max(...risks) - minRisk || 1;
    const appetite = this.riskAppetite / 100;

    return this.bonds.slice().sort((left, right) => {
      const leftReturn = (left.expectedReturn - minReturn) / returnRange;
      const rightReturn = (right.expectedReturn - minReturn) / returnRange;
      const leftStability = 1 - (left.risk - minRisk) / riskRange;
      const rightStability = 1 - (right.risk - minRisk) / riskRange;
      const leftScore = leftReturn * appetite + leftStability * (1 - appetite);
      const rightScore = rightReturn * appetite + rightStability * (1 - appetite);
      return rightScore - leftScore;
    });
  }

  private updateChart(): void {
    if (!this.riskReturnChart) return;
    this.chart?.destroy();

    const isLight = document.body.classList.contains('light-theme') || document.body.classList.contains('pop-theme');
    const textColor = isLight ? '#344b45' : '#d8ebe5';
    const gridColor = isLight ? 'rgba(36, 66, 54, 0.14)' : 'rgba(145, 199, 185, 0.16)';
    const pointColor = this.bonds.map(bond => this.isSelected(bond.id) ? '#20bd78' : '#6d9aa0');
    const pointRadius = this.bonds.map(bond => this.isSelected(bond.id) ? 7 : 5);

    const config: ChartConfiguration<'scatter', { x: number; y: number }[], string> = {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Obligations',
          data: this.bonds.map(bond => ({ x: bond.risk * 100, y: bond.expectedReturn * 100 })),
          backgroundColor: pointColor,
          pointRadius,
          pointHoverRadius: 9
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_event, elements) => {
          const index = elements[0]?.index;
          if (index !== undefined && this.bonds[index]) this.toggleBond(this.bonds[index].id);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => {
                const bond = this.bonds[context.dataIndex];
                if (!bond) return '';
                const membership = this.isSelected(bond.id) ? ' · Dans le portefeuille' : ' · Hors portefeuille';
                return `${bond.securityId} (${bond.currency}) · YTM ${this.formatPercent(bond.expectedReturn)} · Risque ${this.formatPercent(bond.risk)}${membership}`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            title: { display: true, text: 'Risque / volatilité annualisée (%)', color: textColor },
            ticks: { color: textColor, callback: value => `${value}%` },
            grid: { color: gridColor }
          },
          y: {
            title: { display: true, text: 'Espérance de rentabilité / YTM (%)', color: textColor },
            ticks: { color: textColor, callback: value => `${value}%` },
            grid: { color: gridColor }
          }
        }
      }
    };
    this.chart = new Chart(this.riskReturnChart.nativeElement, config);
  }

  private average(values: number[]): number | null {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  private formatPercent(value: number): string {
    return `${(value * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}%`;
  }
}