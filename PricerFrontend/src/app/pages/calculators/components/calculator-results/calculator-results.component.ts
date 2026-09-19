import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CalculatorsService } from '../../../../services/calculators.service';

@Component({
  selector: 'app-calculator-results',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './calculator-results.component.html',
  styleUrls: ['./calculator-results.component.scss']
})
export class CalculatorResultsComponent {
  @Input() calculatorResult: Record<string, unknown> | null = null;

  constructor(
    private readonly calculatorsService: CalculatorsService,
    private readonly translate: TranslateService
  ) {}

  get resultEntries(): Array<[string, unknown]> {
    if (!this.calculatorResult) return [];
    return Object.entries(this.calculatorResult).filter(
      ([key]) => key !== 'calculator' && key !== 'schedule'
    );
  }

  formatKey(key: string): string {
    return this.calculatorsService.formatResultKey(key);
  }

  formatValue(value: unknown): string {
    return this.calculatorsService.formatResultValue(value, this.translate.currentLang || 'en');
  }
}
