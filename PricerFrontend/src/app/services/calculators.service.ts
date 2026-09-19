import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, timeout } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import * as XLSX from 'xlsx-js-style';
import { AmortizationRow } from '../models/calculator.model';
import { PricingService } from './pricing.service';

@Injectable({
  providedIn: 'root'
})
export class CalculatorsService {
  constructor(
    private readonly http: HttpClient,
    private readonly pricingService: PricingService,
    private readonly translate: TranslateService
  ) {}

  calculate(calculatorId: string, payload: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`/api/v1/calculators/${calculatorId}`, payload).pipe(
      timeout(15000),
      map(res => {
        this.pricingService.setApiOnline(true);
        return res;
      }),
      catchError((error: HttpErrorResponse) => {
        this.pricingService.setApiOnline(false);
        throw error;
      })
    );
  }

  formatResultKey(key: string): string {
    const translationKey = `calculator_result_${key.replaceAll(/([a-z])([A-Z])/g, '$1_$2').replaceAll('-', '_').toLowerCase()}`;
    const translated = this.translate.instant(translationKey);
    if (translated !== translationKey) return translated;
    return key.replaceAll(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  formatResultValue(value: unknown, lang = 'en'): string {
    if (typeof value === 'number') {
      return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
        maximumFractionDigits: 6
      }).format(value);
    }
    return String(value);
  }

  exportScheduleToExcel(schedule: AmortizationRow[], calculatorId: string): void {
    if (!schedule || !schedule.length) return;

    const rows = schedule.map(row => ({
      [this.translate.instant('schedule_period')]: row.period,
      [this.translate.instant('schedule_payment')]: row.payment,
      [this.translate.instant('schedule_principal')]: row.principal,
      [this.translate.instant('schedule_interest')]: row.interest,
      [this.translate.instant('schedule_balance')]: row.balance
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const lastRow = rows.length + 1;
    const lastColumn = 'E';
    const border = {
      top: { style: 'thin', color: { rgb: 'B7B7B7' } },
      bottom: { style: 'thin', color: { rgb: 'B7B7B7' } },
      left: { style: 'thin', color: { rgb: 'B7B7B7' } },
      right: { style: 'thin', color: { rgb: 'B7B7B7' } }
    };

    for (let row = 1; row <= lastRow; row++) {
      for (let column = 0; column < 5; column++) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: row - 1, c: column })];
        if (cell) cell.s = { border };
      }
    }

    for (let column = 0; column < 5; column++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: column })];
      if (cell) {
        cell.s = {
          fill: { patternType: 'solid', fgColor: { rgb: 'FFF200' } },
          font: { bold: true, color: { rgb: '000000' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border
        };
      }
    }

    worksheet['!autofilter'] = { ref: `A1:${lastColumn}${lastRow}` };
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule');
    XLSX.writeFile(workbook, `${calculatorId}-amortization-schedule.xlsx`);
  }
}
