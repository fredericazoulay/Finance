import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

import { AmortizationRow } from '../../models/calculator.model';
import { CalculatorDefinitionsService } from '../../services/calculator-definitions.service';
import { CalculatorsService } from '../../services/calculators.service';
import { CalculatorFormComponent } from './components/calculator-form/calculator-form.component';
import { CalculatorResultsComponent } from './components/calculator-results/calculator-results.component';
import { AmortizationScheduleComponent } from './components/amortization-schedule/amortization-schedule.component';
import { AmortizationChartComponent } from './components/amortization-chart/amortization-chart.component';

@Component({
  selector: 'app-calculators-page',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    CalculatorFormComponent,
    CalculatorResultsComponent,
    AmortizationScheduleComponent,
    AmortizationChartComponent
  ],
  templateUrl: './calculators-page.component.html',
  styleUrls: ['./calculators-page.component.scss']
})
export class CalculatorsPageComponent implements OnInit, OnDestroy {
  selectedCalculator = 'loan';
  isCalculatorRunning = false;
  calculatorError = '';
  calculatorResult: Record<string, unknown> | null = null;
  readonly calculatorForm: FormGroup;

  private routeSub?: Subscription;

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
    private readonly calculatorDefinitions: CalculatorDefinitionsService,
    private readonly calculatorsService: CalculatorsService
  ) {
    const defaults = this.calculatorDefinitions.getDefaultFormValues();
    const validators = this.calculatorDefinitions.getFormValidators();
    const formControls: Record<string, any> = {};

    for (const [key, value] of Object.entries(defaults)) {
      formControls[key] = [value, validators[key] || []];
    }
    this.calculatorForm = this.fb.group(formControls);
  }

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id && this.calculatorDefinitions.fields[id]) {
        this.selectedCalculator = id;
      } else {
        this.selectedCalculator = 'loan';
      }
      this.calculatorError = '';
      this.calculatorResult = null;
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  get schedule(): AmortizationRow[] {
    const s = this.calculatorResult?.['schedule'];
    return Array.isArray(s) ? (s as AmortizationRow[]) : [];
  }

  onCalculatorChange(id: string): void {
    this.router.navigate(['/calculators', id]);
  }

  calculate(): void {
    if (this.isCalculatorRunning) return;
    if (this.calculatorForm.invalid) {
      this.calculatorForm.markAllAsTouched();
      return;
    }

    const raw = this.calculatorForm.getRawValue();
    const fields = this.calculatorDefinitions.getFields(this.selectedCalculator);
    const payload: Record<string, unknown> = {};

    for (const field of fields) {
      const val = raw[field.key];
      if (field.key === 'cashFlows') {
        payload[field.key] = String(val || '')
          .split(',')
          .map(item => Number(item.trim()));
      } else if (field.type === 'date' || field.type === 'text') {
        payload[field.key] = val;
      } else {
        payload[field.key] = Number(val);
      }
    }

    this.isCalculatorRunning = true;
    this.calculatorError = '';

    this.calculatorsService.calculate(this.selectedCalculator, payload).subscribe({
      next: (result) => {
        this.calculatorResult = result;
        this.isCalculatorRunning = false;
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.isCalculatorRunning = false;
        this.calculatorError = error.error?.message || 'Calculator API unavailable.';
        this.cdr.detectChanges();
      }
    });
  }

  resetCalculator(): void {
    this.calculatorError = '';
    this.calculatorResult = null;
    this.calculatorForm.reset(this.calculatorDefinitions.getDefaultFormValues());
  }
}
