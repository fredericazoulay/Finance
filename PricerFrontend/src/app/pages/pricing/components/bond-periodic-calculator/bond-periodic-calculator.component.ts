import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize, TimeoutError } from 'rxjs';
import { BondDirectPricingRequest, BondDirectPricingResponse } from '../../../../models/bond-comparables.model';
import { BondComparablesService } from '../../../../services/bond-comparables.service';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

interface PresentValuePayment {
  label: string;
  amount: number;
}

@Component({
  selector: 'app-bond-periodic-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bond-periodic-calculator.component.html',
  styleUrls: ['./bond-periodic-calculator.component.scss']
})
export class BondPeriodicCalculatorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() currency = 'EUR';
  @ViewChild('cashFlowChart') cashFlowChart!: ElementRef<HTMLCanvasElement>;

  readonly form = {
    faceValue: 1000,
    annualCouponRate: 5,
    couponFrequency: 1,
    termYears: 10,
    ytm: 8
  };
  result: BondDirectPricingResponse | null = null;
  error = '';
  isPricing = false;

  private chart: Chart | null = null;
  private themeObserver: MutationObserver | null = null;
  private viewInitialized = false;

  constructor(
    private readonly comparablesService: BondComparablesService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  get couponPerPeriod(): number {
    return this.form.faceValue * this.form.annualCouponRate / 100 / this.form.couponFrequency;
  }

  get annualCoupon(): number {
    return this.form.faceValue * this.form.annualCouponRate / 100;
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.updateChart();
    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
      this.themeObserver = new MutationObserver(() => this.updateChart());
      this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currency'] && this.viewInitialized) this.updateChart();
  }

  ngOnDestroy(): void {
    this.themeObserver?.disconnect();
    this.chart?.destroy();
  }

  invalidateResult(): void {
    this.result = null;
    this.error = '';
    this.updateChart();
  }

  calculate(): void {
    const request: BondDirectPricingRequest = {
      solveFor: 'PRICE',
      faceValue: Number(this.form.faceValue),
      couponRate: Number(this.form.annualCouponRate) / 100,
      couponFrequency: Number(this.form.couponFrequency),
      ytm: Number(this.form.ytm) / 100,
      termYears: Number(this.form.termYears)
    };

    this.error = '';
    this.result = null;
    this.chart?.destroy();
    this.chart = null;
    this.isPricing = true;
    this.comparablesService.priceDirectly(request).pipe(
      finalize(() => {
        this.isPricing = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: result => {
        this.result = result;
        this.updateChart();
        this.cdr.detectChanges();
      },
      error: (error: unknown) => {
        if (error instanceof TimeoutError) {
          this.error = 'Le backend n’a pas répondu dans les 15 secondes. Réessayez.';
        } else if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') {
          this.error = error.error.message;
        } else if (error instanceof HttpErrorResponse && error.status === 0) {
          this.error = 'API inaccessible. Vérifiez que le backend répond sur le port 9092.';
        } else {
          this.error = 'Le calcul obligataire a échoué. Vérifiez les paramètres puis réessayez.';
        }
        this.cdr.detectChanges();
      }
    });
  }

  reset(): void {
    Object.assign(this.form, {
      faceValue: 1000,
      annualCouponRate: 5,
      couponFrequency: 1,
      termYears: 10,
      ytm: 8
    });
    this.invalidateResult();
  }

  private presentValuePayments(): PresentValuePayment[] {
    const frequency = Number(this.form.couponFrequency);
    const periods = Number(this.form.termYears) * frequency;
    const fullCoupons = Math.floor(periods + 1e-10);
    const fractionalPeriod = periods - fullCoupons;
    const periodicYield = 1 + Number(this.form.ytm) / 100 / frequency;
    const couponPayment = this.couponPerPeriod;
    const payments: PresentValuePayment[] = [];
    const integerMaturity = fractionalPeriod < 1e-10;

    for (let period = 1; period <= fullCoupons; period++) {
      const cashFlow = couponPayment + (integerMaturity && period === fullCoupons ? Number(this.form.faceValue) : 0);
      payments.push({
        label: String(period),
        amount: cashFlow / Math.pow(periodicYield, period)
      });
    }

    if (!integerMaturity) {
      const cashFlow = Number(this.form.faceValue) + couponPayment * fractionalPeriod;
      payments.push({
        label: String(periods),
        amount: cashFlow / Math.pow(periodicYield, periods)
      });
    }
    return payments;
  }

  private updateChart(): void {
    if (!this.viewInitialized || !this.cashFlowChart) return;
    this.chart?.destroy();
    this.chart = null;
    if (!this.result) return;

    const payments = this.presentValuePayments();
    const formatter = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const isThemedDark = document.body.classList.contains('bloomberg-theme') || document.body.classList.contains('custom-theme');
    const chartAccent = isThemedDark ? getComputedStyle(document.body).getPropertyValue('--ui-accent').trim() : '#4169f5';
    const chartText = isThemedDark ? '#c9c9c9' : '#657080';
    const chartGrid = isThemedDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(101, 112, 128, 0.15)';
    this.chart = new Chart(this.cashFlowChart.nativeElement, {
      type: 'bar',
      data: {
        labels: payments.map(payment => payment.label),
        datasets: [{
          label: 'Valeur actuelle des paiements',
          data: payments.map(payment => payment.amount),
          backgroundColor: chartAccent || '#4169f5',
          borderRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { color: chartText, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: context => ` Valeur actuelle : ${formatter.format(Number(context.raw))} ${this.currency}`
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Nombre de paiements', color: chartText },
            ticks: { color: chartText },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: `Valeur (${this.currency})`, color: chartText },
            ticks: { color: chartText },
            grid: { color: chartGrid }
          }
        }
      }
    });
  }
}
