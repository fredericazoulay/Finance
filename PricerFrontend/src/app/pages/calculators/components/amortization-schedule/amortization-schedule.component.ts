import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AmortizationRow } from '../../../../models/calculator.model';
import { CalculatorsService } from '../../../../services/calculators.service';

@Component({
  selector: 'app-amortization-schedule',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './amortization-schedule.component.html',
  styleUrls: ['./amortization-schedule.component.scss']
})
export class AmortizationScheduleComponent {
  @Input() schedule: AmortizationRow[] = [];
  @Input() selectedCalculator = 'loan';

  constructor(
    private readonly calculatorsService: CalculatorsService,
    private readonly translate: TranslateService
  ) {}

  formatValue(value: unknown): string {
    return this.calculatorsService.formatResultValue(value, this.translate.currentLang || 'en');
  }

  exportToExcel(): void {
    this.calculatorsService.exportScheduleToExcel(this.schedule, this.selectedCalculator);
  }
}
