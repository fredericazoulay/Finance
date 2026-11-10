import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface BondMetrics {
  price: number;
  yieldPercent: number;
  currentYieldPercent: number;
  macaulayDuration: number;
  modifiedDuration: number;
  convexity: number;
  dv01: number;
}

interface RiskTopic {
  title: string;
  description: string;
  monitor: string;
}

interface AnalysisChecklistItem {
  label: string;
  checked: boolean;
}

@Component({
  selector: 'app-bond-analysis-guide',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bond-analysis-guide.component.html',
  styleUrls: ['./bond-analysis-guide.component.scss']
})
export class BondAnalysisGuideComponent {
  @Input() currency = 'EUR';

  modifiedDuration = 8.5;
  rateShockPoints = 1;
  portfolioValue = 22_000;
  portfolioConvexity: number | null = null;

  solveFor: 'PRICE' | 'YTM' = 'PRICE';
  faceValue = 1_000;
  couponRatePercent = 4;
  couponFrequency = 2;
  maturityYears = 5;
  yieldPercent = 5;
  marketPrice = 950;
  valuation: BondMetrics | null = null;
  valuationError = '';

  referenceYieldPercent = 3;
  creditYieldPercent = 5.5;
  inflationPercent = 2;
  taxRatePercent = 30;
  annualFeesPercent = 0.2;

  comparisonA = { yieldPercent: 3.5, rating: 'A', modifiedDuration: 5.5, spreadPercent: 0.8, liquidity: 'Bonne' };
  comparisonB = { yieldPercent: 5, rating: 'BB', modifiedDuration: 4, spreadPercent: 2.5, liquidity: 'Moyenne' };

  readonly checklist: AnalysisChecklistItem[] = [
    { label: 'YTM, YTW, coupon et rendement net', checked: false },
    { label: 'Notation, endettement et échéances de dette', checked: false },
    { label: 'Duration, convexité et exposition à la courbe', checked: false },
    { label: 'Spread comparé à une référence cohérente', checked: false },
    { label: 'Liquidité, volumes et écart bid-ask', checked: false },
    { label: 'Séniorité, garanties, covenants et options', checked: false },
    { label: 'Inflation, devise, frais et fiscalité', checked: false },
    { label: 'Risques ESG matériels et controverses', checked: false },
    { label: 'Concentration par émetteur, secteur et pays', checked: false },
    { label: 'Rôle de l’obligation dans le portefeuille', checked: false }
  ];

  readonly riskTopics: RiskTopic[] = [
    { title: 'Crédit et défaut', description: 'L’émetteur peut retarder ou ne pas honorer coupons et principal. La notation est une opinion, pas une garantie.', monitor: 'Capacité de remboursement, levier, trésorerie, couverture des intérêts, échéances et rang de la dette.' },
    { title: 'Taux et courbe', description: 'Une hausse des rendements exigés pèse généralement sur le prix d’une obligation à taux fixe.', monitor: 'Duration modifiée, convexité, key rate duration et scénarios de pente ou de déplacement de courbe.' },
    { title: 'Spread de crédit', description: 'Un élargissement du spread peut entraîner une perte même si les taux souverains restent stables.', monitor: 'Spread duration, qualité de la référence et évolution du risque propre à l’émetteur.' },
    { title: 'Liquidité', description: 'Une revente rapide peut être impossible sans décote lorsque les échanges sont rares.', monitor: 'Fourchette bid-ask, volumes, taille de l’émission et profondeur du marché.' },
    { title: 'Inflation et réinvestissement', description: 'L’inflation réduit le pouvoir d’achat des flux; les coupons peuvent devoir être réinvestis à un taux inférieur.', monitor: 'Rendement réel, indexation, échéancier des flux et hypothèses de réinvestissement.' },
    { title: 'Change', description: 'Une variation de devise peut effacer le rendement obtenu dans la monnaie de l’obligation.', monitor: 'Devise des flux, couverture de change, coût de couverture et devise de référence du portefeuille.' },
    { title: 'Structure et options', description: 'Subordination, clauses de remboursement et options intégrées modifient les pertes possibles et le rendement réalisé.', monitor: 'Prospectus, séniorité, garanties, covenants, call, put, conversion et mécanismes de bail-in.' }
  ];

  readonly ratingRows = [
    { quality: 'Très bonne qualité', sp: 'AAA', moodys: 'Aaa' },
    { quality: 'Haute qualité', sp: 'AA', moodys: 'Aa' },
    { quality: 'Bonne qualité', sp: 'A', moodys: 'A' },
    { quality: 'Qualité moyenne supérieure', sp: 'BBB', moodys: 'Baa' },
    { quality: 'Spéculatif', sp: 'BB', moodys: 'Ba' },
    { quality: 'Très spéculatif', sp: 'B', moodys: 'B' },
    { quality: 'Risque très élevé', sp: 'CCC et inférieur', moodys: 'Caa et inférieur' }
  ];

  readonly sustainableBondTypes = [
    { name: 'Green bonds', description: 'Les fonds financent ou refinancent des projets environnementaux définis.' },
    { name: 'Social bonds', description: 'Les fonds sont destinés à des projets sociaux décrits dans le cadre d’émission.' },
    { name: 'Sustainability bonds', description: 'Les fonds combinent des objectifs environnementaux et sociaux.' },
    { name: 'Sustainability-linked bonds', description: 'Une caractéristique financière peut évoluer selon des objectifs prédéfinis; les fonds ne sont pas nécessairement fléchés.' }
  ];

  constructor() {
    this.calculateValuation();
  }

  get estimatedMoveRatio(): number {
    const shock = this.rateShockPoints / 100;
    const convexity = this.isFiniteNumber(this.portfolioConvexity) ? this.portfolioConvexity : 0;
    return -this.modifiedDuration * shock + 0.5 * convexity * shock * shock;
  }

  get estimatedMoveAmount(): number {
    return this.portfolioValue * this.estimatedMoveRatio;
  }

  get portfolioDv01(): number {
    return this.portfolioValue * this.modifiedDuration / 10_000;
  }

  get spreadBasisPoints(): number {
    return (this.creditYieldPercent - this.referenceYieldPercent) * 100;
  }

  get approximateRealNetYieldPercent(): number {
    const beforeTaxYield = this.valuation?.yieldPercent ?? this.yieldPercent;
    return beforeTaxYield * (1 - this.taxRatePercent / 100) - this.annualFeesPercent - this.inflationPercent;
  }

  get completedChecklistCount(): number {
    return this.checklist.filter(item => item.checked).length;
  }

  get scenarioRows(): Array<{ shock: number; movePercent: number; moveAmount: number }> {
    return [-300, -200, -100, 0, 100, 200, 300].map(shock => {
      const movePercent = this.scenarioMoveRatio(shock) * 100;
      return { shock, movePercent, moveAmount: this.portfolioValue * movePercent / 100 };
    });
  }

  calculateValuation(): void {
    this.valuationError = '';
    const inputsAreValid = this.isFiniteNumber(this.faceValue) && this.faceValue > 0
      && this.isFiniteNumber(this.couponRatePercent) && this.couponRatePercent >= 0
      && this.isFiniteNumber(this.maturityYears) && this.maturityYears > 0
      && this.isFiniteNumber(this.couponFrequency) && this.couponFrequency > 0;

    if (!inputsAreValid || (this.solveFor === 'YTM' && (!this.isFiniteNumber(this.marketPrice) || this.marketPrice <= 0))) {
      this.valuation = null;
      this.valuationError = 'Vérifiez les paramètres : le nominal, l’échéance, la fréquence et le prix doivent être positifs.';
      return;
    }

    const solvedYield = this.solveFor === 'YTM' ? this.solveYield(this.marketPrice) : this.yieldPercent;
    if (solvedYield === null || !this.isFiniteNumber(solvedYield)) {
      this.valuation = null;
      this.valuationError = 'Le rendement correspondant au prix saisi ne peut pas être déterminé avec ces paramètres.';
      return;
    }

    const metrics = this.metricsAtYield(solvedYield);
    if (!metrics) {
      this.valuation = null;
      this.valuationError = 'La valorisation est hors du domaine numérique pour les paramètres saisis.';
      return;
    }

    const price = this.solveFor === 'YTM' ? this.marketPrice : metrics.price;
    this.valuation = {
      ...metrics,
      price,
      yieldPercent: solvedYield,
      currentYieldPercent: this.faceValue * this.couponRatePercent / 100 / price * 100,
      dv01: price * metrics.modifiedDuration / 10_000
    };
  }

  scenarioMoveRatio(shockBasisPoints: number): number {
    const shock = shockBasisPoints / 10_000;
    const convexity = this.isFiniteNumber(this.portfolioConvexity) ? this.portfolioConvexity : 0;
    return -this.modifiedDuration * shock + 0.5 * convexity * shock * shock;
  }

  private solveYield(targetPrice: number): number | null {
    let lower = -this.couponFrequency * 100 + 0.001;
    let upper = 1_000;
    const lowerMetrics = this.metricsAtYield(lower);
    const upperMetrics = this.metricsAtYield(upper);
    if (!lowerMetrics || !upperMetrics || targetPrice > lowerMetrics.price || targetPrice < upperMetrics.price) return null;

    for (let iteration = 0; iteration < 100; iteration++) {
      const middle = (lower + upper) / 2;
      const metrics = this.metricsAtYield(middle);
      if (!metrics) return null;
      if (metrics.price > targetPrice) lower = middle;
      else upper = middle;
    }
    return (lower + upper) / 2;
  }

  private metricsAtYield(yieldPercent: number): BondMetrics | null {
    const frequency = this.couponFrequency;
    const periodicBase = 1 + yieldPercent / 100 / frequency;
    if (periodicBase <= 0 || !Number.isFinite(periodicBase)) return null;

    const periodCount = Math.ceil(this.maturityYears * frequency);
    const couponRate = this.couponRatePercent / 100;
    let previousTime = 0;
    let price = 0;
    let timeWeightedPresentValue = 0;
    let modifiedTimeWeightedPresentValue = 0;
    let convexityWeightedPresentValue = 0;

    for (let period = 1; period <= periodCount; period++) {
      const time = Math.min(period / frequency, this.maturityYears);
      const accrual = time - previousTime;
      const isMaturity = period === periodCount;
      const cashflow = this.faceValue * couponRate * accrual + (isMaturity ? this.faceValue : 0);
      const presentValue = cashflow / Math.pow(periodicBase, time * frequency);
      if (!Number.isFinite(presentValue)) return null;
      price += presentValue;
      timeWeightedPresentValue += time * presentValue;
      modifiedTimeWeightedPresentValue += time * presentValue / periodicBase;
      convexityWeightedPresentValue += time * (time + 1 / frequency) * presentValue / (periodicBase * periodicBase);
      previousTime = time;
    }

    if (price <= 0 || !Number.isFinite(price)) return null;
    const macaulayDuration = timeWeightedPresentValue / price;
    const modifiedDuration = modifiedTimeWeightedPresentValue / price;
    const convexity = convexityWeightedPresentValue / price;
    return {
      price,
      yieldPercent,
      currentYieldPercent: this.faceValue * couponRate / price * 100,
      macaulayDuration,
      modifiedDuration,
      convexity,
      dv01: price * modifiedDuration / 10_000
    };
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }
}