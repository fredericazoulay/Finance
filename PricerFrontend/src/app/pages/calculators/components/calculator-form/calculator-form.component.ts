import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CalculatorField, CalculatorGroup } from '../../../../models/calculator.model';
import { CalculatorDefinitionsService } from '../../../../services/calculator-definitions.service';

@Component({
  selector: 'app-calculator-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  templateUrl: './calculator-form.component.html',
  styleUrls: ['./calculator-form.component.scss']
})
export class CalculatorFormComponent implements OnChanges {
  @Input({ required: true }) selectedCalculator = 'loan';
  @Input({ required: true }) calculatorForm!: FormGroup;
  @Input() isCalculatorRunning = false;
  @Input() calculatorError = '';

  @Output() calculatorChange = new EventEmitter<string>();
  @Output() calculateSubmit = new EventEmitter<void>();
  @Output() calculatorReset = new EventEmitter<void>();

  calculatorGroups: CalculatorGroup[] = [];
  calculatorFields: CalculatorField[] = [];

  constructor(
    private readonly calculatorDefinitions: CalculatorDefinitionsService,
    private readonly translate: TranslateService
  ) {
    this.calculatorGroups = this.calculatorDefinitions.groups;
    this.calculatorFields = this.calculatorDefinitions.getFields(this.selectedCalculator);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedCalculator']) {
      this.calculatorFields = this.calculatorDefinitions.getFields(this.selectedCalculator);
    }
  }

  onSelectCalculator(id: string): void {
    if (id && id !== this.selectedCalculator) {
      this.calculatorChange.emit(id);
    }
  }

  calculatorLabel(calculator: string): string {
    const key = `calculator_${calculator.replaceAll('-', '_')}`;
    const translated = this.translate.instant(key);
    return translated === key
      ? calculator.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase())
      : translated;
  }

  calculatorGroupLabel(label: string): string {
    const keys: Record<string, string> = {
      'Mortgage and Real Estate': 'calculator_group_mortgage',
      Auto: 'calculator_group_auto',
      Investment: 'calculator_group_investment',
      Retirement: 'calculator_group_retirement',
      'Tax and Salary': 'calculator_group_tax_salary',
      Business: 'calculator_group_business',
      Other: 'calculator_group_other'
    };
    const transKey = keys[label] || `calculator_group_${label.toLowerCase().replaceAll(' ', '_')}`;
    const translated = this.translate.instant(transKey);
    return translated !== transKey ? translated : label;
  }

  calculatorFieldLabel(label: string): string {
    const key = `calculator_field_${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
    const translated = this.translate.instant(key);
    return translated === key ? label : translated;
  }

  onSubmit(): void {
    this.calculateSubmit.emit();
  }

  onReset(): void {
    this.calculatorReset.emit();
  }
}
