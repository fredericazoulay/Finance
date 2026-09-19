import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostBinding, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { finalize, TimeoutError, timeout } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import * as XLSX from 'xlsx-js-style';

interface PriceResponse {
  request_id?: string;
  response_status?: string;
  security_id?: string;
  security_name?: string;
  product?: string;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

interface YahooSecurity {
  symbol: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
}

interface CalculatorField {
  key: string;
  label: string;
  type?: string;
  step?: string;
  defaultValue?: string | number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HttpClientModule,
    TranslateModule
  ],
  template: `
    <div class="terminal-shell">
      <header class="topbar">
        <div class="brand">
          <span class="dot green"></span>
          <span>Finance Pricer Terminal</span>
        </div>
        <div class="status">
          <span>{{ 'theme' | translate }}</span>
          <span class="pill" [class.light]="isLightTheme">
            <select class="theme-select" (change)="setTheme($any($event.target).value === 'LIGHT')" [value]="isLightTheme ? 'LIGHT' : 'DARK'">
              <option value="LIGHT">LIGHT</option>
              <option value="DARK">DARK</option>
            </select>
          </span>
          <span>{{ 'language' | translate }}</span>
          <span class="pill" [class.light]="isLightTheme">
            <select class="theme-select" (change)="setLanguage($any($event.target).value)" [value]="language">
              <option value="en">EN</option>
              <option value="fr">FR</option>
            </select>
          </span>
          <span>{{ 'api' | translate }}</span>
          <span class="pill" [class.online]="apiOnline">{{ apiOnline ? 'ONLINE' : 'OFFLINE' }}</span>
        </div>
      </header>

      <aside class="sidebar">
        <div class="menu-title">{{ 'instrument' | translate }}</div>
        <button type="button" (click)="selectProduct('EQTY_OPT')" [class.active]="selectedProduct === 'EQTY_OPT'">{{ 'EQTY_OPT' | translate }}</button>
        <button type="button" (click)="selectProduct('IRS')" [class.active]="selectedProduct === 'IRS'">{{ 'IRS' | translate }}</button>
        <button type="button" (click)="selectProduct('CDS')" [class.active]="selectedProduct === 'CDS'">{{ 'CDS' | translate }}</button>
        <button type="button" (click)="selectProduct('FXC')" [class.active]="selectedProduct === 'FXC'">{{ 'FXC' | translate }}</button>
        <button type="button" (click)="selectProduct('BOND')" [class.active]="selectedProduct === 'BOND'">{{ 'BOND' | translate }}</button>
        <button type="button" (click)="selectProduct('EQUITY')" [class.active]="selectedProduct === 'EQUITY'">{{ 'EQUITY' | translate }}</button>
        <button type="button" (click)="selectProduct('CALCULATORS')" [class.active]="selectedProduct === 'CALCULATORS'">{{ 'financial_calculators' | translate }}</button>
      </aside>

      <main class="content">
        <ng-container *ngIf="selectedProduct === 'CALCULATORS'; else pricingTerminal">
          <section class="panel calculators-panel">
            <div class="panel-header">{{ 'financial_calculators' | translate }}</div>
            <div class="calculator-layout">
              <div class="calculator-picker">
                <label>
                  <span>{{ 'calculator' | translate }}</span>
                  <select [value]="selectedCalculator" (change)="selectCalculator($any($event.target).value)">
                    <optgroup *ngFor="let group of calculatorGroups" [label]="calculatorGroupLabel(group.label)">
                      <option *ngFor="let calculator of group.items" [value]="calculator">{{ calculatorLabel(calculator) }}</option>
                    </optgroup>
                  </select>
                </label>
                <p class="calculator-description">{{ 'calculator_description' | translate }}</p>
              </div>
              <form class="calculator-form" [formGroup]="calculatorForm" (ngSubmit)="calculateFinancialCalculator()">
                <div class="calculator-fields">
                  <label *ngFor="let field of calculatorFields">
                    <span>{{ calculatorFieldLabel(field.label) }}</span>
                    <input [formControlName]="field.key" [type]="field.type || 'number'" [step]="field.step || 'any'" />
                  </label>
                </div>
                <div class="actions">
                  <button type="submit" class="primary" [disabled]="isCalculatorRunning">{{ isCalculatorRunning ? ('calculating' | translate) : ('calculate' | translate) }}</button>
                  <button type="button" class="secondary" (click)="resetCalculator()">{{ 'clear' | translate }}</button>
                </div>
                <p class="error-message" *ngIf="calculatorError">{{ calculatorError }}</p>
              </form>
            </div>
          </section>

          <section class="panel calculator-results-panel">
            <div class="panel-header">{{ 'results' | translate }}</div>
            <div class="calculator-results" *ngIf="calculatorResult; else noCalculatorResult">
              <div class="result-card" *ngFor="let entry of calculatorResultEntries">
                <span>{{ formatCalculatorKey(entry[0]) }}</span>
                <strong>{{ formatCalculatorValue(entry[1]) }}</strong>
              </div>
            </div>
            <div class="schedule" *ngIf="calculatorSchedule.length">
              <div class="schedule-heading">
                <h3>{{ 'amortization_schedule' | translate }}</h3>
                <button type="button" class="export-button" (click)="exportScheduleToExcel()">{{ 'export_excel' | translate }}</button>
              </div>
              <div class="schedule-table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>{{ 'schedule_period' | translate }}</th>
                      <th>{{ 'schedule_payment' | translate }}</th>
                      <th>{{ 'schedule_principal' | translate }}</th>
                      <th>{{ 'schedule_interest' | translate }}</th>
                      <th>{{ 'schedule_balance' | translate }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let row of calculatorSchedule">
                      <td>{{ row['period'] }}</td>
                      <td>{{ formatCalculatorValue(row['payment']) }}</td>
                      <td>{{ formatCalculatorValue(row['principal']) }}</td>
                      <td>{{ formatCalculatorValue(row['interest']) }}</td>
                      <td>{{ formatCalculatorValue(row['balance']) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <ng-template #noCalculatorResult>
              <p class="empty-results">{{ 'calculator_empty_results' | translate }}</p>
            </ng-template>
          </section>
        </ng-container>

        <ng-template #pricingTerminal>
        <section class="panel form-panel">
          <div class="panel-header">{{ selectedProductLabel }}</div>
          <form [formGroup]="form" (ngSubmit)="submitRequest()">
            <div class="grid">
              <label>
                <span>{{ 'request_id' | translate }}</span>
                <input formControlName="request_id" />
              </label>
              <label>
                <span>{{ 'security_id' | translate }}</span>
                <div class="security-tools">
                  <input formControlName="security_id" list="security-options" (input)="securityQueryChanged($any($event.target).value)" (change)="selectSecurity($any($event.target).value)" (keyup.enter)="searchSecurities()" />
                  <button type="button" class="secondary search-button" [disabled]="isSearchingSecurities" (click)="searchSecurities()">{{ isSearchingSecurities ? '...' : ('search' | translate) }}</button>
                </div>
                <datalist id="security-options">
                  <option *ngFor="let security of securityOptions" [value]="security"></option>
                  <option *ngFor="let security of securityResults" [value]="security.symbol">{{ security.shortname || security.longname || security.symbol }}</option>
                </datalist>
              </label>
              <label>
                <span>{{ 'security_name' | translate }}</span>
                <input formControlName="security_name" />
              </label>
              <label>
                <span>{{ 'product' | translate }}</span>
                <select formControlName="product" (change)="selectProduct(form.get('product')?.value)">
                  <option *ngFor="let product of productOptions" [value]="product.code">{{ product.code | translate }}</option>
                </select>
              </label>
              <label>
                <span>{{ 'curve' | translate }}</span>
                <input formControlName="curve_name" />
              </label>
              <label>
                <span>{{ 'source' | translate }}</span>
                <input formControlName="market_data_source" />
              </label>
              <label>
                <span>{{ 'model' | translate }}</span>
                <select formControlName="pricing_model">
                  <option *ngFor="let model of pricingModelOptions" [value]="model">{{ model }}</option>
                </select>
              </label>
            </div>

            <div class="actions">
              <button type="button" class="primary" [disabled]="isPricing" (click)="submitRequest()">{{ isPricing ? ('pricing_in_progress' | translate) : ('price' | translate) }}</button>
              <button type="button" class="secondary" (click)="resetForm()">{{ 'reset' | translate }}</button>
            </div>

            <div class="subsection">
              <h3>{{ 'market_data' | translate }}</h3>
              <div class="grid small-grid">
                <label *ngFor="let field of marketFields">
                  <span>{{ field.label }}</span>
                  <select *ngIf="field.options; else marketInput" [formControlName]="field.key">
                    <option *ngFor="let option of field.options" [value]="option">{{ option }}</option>
                  </select>
                  <ng-template #marketInput><input [formControlName]="field.key" [attr.type]="field.type || 'number'" /></ng-template>
                </label>
              </div>
            </div>

            <div class="subsection">
              <h3>{{ 'instrument_section' | translate }}</h3>
              <div class="grid small-grid">
                <label *ngFor="let field of instrumentFields">
                  <span>{{ field.label }}</span>
                  <select *ngIf="field.options; else instrumentInput" [formControlName]="field.key">
                    <option *ngFor="let option of field.options" [value]="option">{{ option }}</option>
                  </select>
                  <ng-template #instrumentInput><input [formControlName]="field.key" [attr.type]="field.type || 'number'" /></ng-template>
                </label>
              </div>
            </div>

            <p class="error-message" *ngIf="apiError">{{ apiError }}</p>
          </form>
        </section>

        <section class="panel quote-panel">
          <div class="panel-header">{{ 'quote_monitor' | translate }}</div>
          <p class="response-state" *ngIf="isPricing">Sending request to pricing API...</p>
          <p class="response-error" *ngIf="apiError">{{ apiError }}</p>
          <div class="quote-grid">
            <div class="quote-box">
              <span class="label">{{ 'security_label' | translate }}</span>
              <strong>{{ lastResponse?.security_name || '-' }}</strong>
            </div>
            <div class="quote-box">
              <span class="label">{{ 'product_label' | translate }}</span>
              <strong>{{ lastResponse?.product || '-' }}</strong>
            </div>
            <div class="quote-box">
              <span class="label">{{ 'status_label' | translate }}</span>
              <strong>{{ lastResponse?.response_status || ('waiting' | translate) }}</strong>
            </div>
            <div class="quote-box accent">
              <span class="label">{{ 'price_label' | translate }}</span>
              <strong>{{ formatResultValue(lastResponse?.result) }}</strong>
            </div>
          </div>

          <div class="json-box">
            <pre>{{ lastResponse | json }}</pre>
          </div>

          <div class="chart-box">
            <div class="chart-heading"><span>{{ chartTitle }}</span><span>{{ chartUnit }}</span></div>
            <svg viewBox="0 0 520 190" role="img" aria-label="Market sensitivity chart">
              <line class="chart-axis" x1="42" y1="155" x2="500" y2="155"></line>
              <line class="chart-axis" x1="42" y1="20" x2="42" y2="155"></line>
              <polyline class="chart-line" [attr.points]="chartPolyline"></polyline>
              <circle class="chart-point" *ngFor="let point of chartPoints" [attr.cx]="point.cx" [attr.cy]="point.cy" r="3"></circle>
            </svg>
          </div>
        </section>
        </ng-template>
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        background: #07141d;
        color: #eaf6ff;
        font-family: 'Segoe UI', sans-serif;
      }

      :host.light-theme {
        background: #f6f8fa;
        color: #072024;
      }

      :host.light-theme .topbar {
        background: #ffffff;
        border-bottom-color: rgba(7, 20, 29, 0.06);
        color: #072024;
      }

      :host.light-theme .sidebar {
        background: #f0f4f7;
        border-right-color: rgba(7, 20, 29, 0.06);
        color: #06323a;
      }

      /* Lighter buttons and panels in light theme for better contrast */
      :host.light-theme .sidebar button {
        background: #e9f6f4;
        border: 1px solid rgba(7, 20, 29, 0.06);
        color: #06323a;
      }

      :host.light-theme .sidebar button.active {
        background: #d7f0ea;
        border-color: rgba(14, 203, 141, 0.18);
        color: #032826;
      }

      :host.light-theme .quote-box,
      :host.light-theme .quote-box.accent {
        background: #f6fbfc;
        border-color: rgba(7, 20, 29, 0.06);
        color: #072024;
      }

      :host.light-theme .json-box {
        background: #fbfdff;
        border-color: rgba(7, 20, 29, 0.06);
        color: #072024;
      }

      :host.light-theme .json-box pre {
        color: #0b2f33;
      }

      :host.light-theme .panel {
        background: #ffffff;
        border-color: rgba(7, 20, 29, 0.06);
        color: #072024;
        box-shadow: 0 6px 18px rgba(10, 20, 30, 0.06);
      }

      :host.light-theme input,
      :host.light-theme select,
      :host.light-theme .theme-select {
        background: #fbfdff;
        border-color: rgba(7, 20, 29, 0.06);
        color: #072024;
      }

      :host.light-theme .pill {
        background: rgba(7, 20, 29, 0.04);
        color: #072024;
      }

      :host.light-theme .pill.online {
        background: rgba(58, 227, 116, 0.12);
        color: #0b3a22;
      }

      :host.light-theme .primary {
        background: linear-gradient(135deg, #0ecb8d, #3ae374);
        color: #062116;
      }

      /* Light theme chart adjustments */
      :host.light-theme .chart-box {
        background: #fbfdff;
        border-color: rgba(7, 20, 29, 0.06);
        color: #072024;
      }

      :host.light-theme .chart-heading { color: #0b5560; }

      :host.light-theme .chart-axis { stroke: rgba(7,20,29,0.08); }

      :host.light-theme .chart-line {
        fill: none;
        stroke: #0b8f6b;
        stroke-width: 3;
      }

      :host.light-theme .chart-point {
        fill: #0ecb8d;
        stroke: #fbfdff;
        stroke-width: 2;
      }

      :host.light-theme .chart-box .chart-axis { opacity: 0.7; }

      .terminal-shell {
        display: grid;
        grid-template-columns: 220px 1fr;
        grid-template-rows: 64px 1fr;
        height: 100vh;
      }

      .topbar {
        grid-column: 1 / -1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 20px;
        background: #0d1b25;
        border-bottom: 1px solid rgba(124, 181, 255, 0.2);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        display: inline-block;
      }

      .dot.green { background: #3ae374; }

      .status {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: #9db5c6;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(255, 0, 0, 0.12);
        color: #ff7d7d;
      }

      .pill.online {
        background: rgba(58, 227, 116, 0.12);
        color: #7af7a5;
      }

      .pill.light {
        background: rgba(255, 255, 255, 0.08);
        color: #062116;
      }

      .pill .theme-select {
        background: transparent;
        border: none;
        color: inherit;
        font-weight: 700;
        padding: 4px 8px;
        cursor: pointer;
        appearance: none;
      }

      .sidebar {
        background: rgba(7, 20, 29, 0.92);
        border-right: 1px solid rgba(124, 181, 255, 0.2);
        padding: 18px 12px;
      }

      .menu-title {
        font-size: 11px;
        text-transform: uppercase;
        color: #89a8bf;
        letter-spacing: 0.12em;
        margin: 6px 8px 14px;
      }

      .sidebar button {
        width: 100%;
        margin-bottom: 10px;
        background: #102532;
        border: 1px solid rgba(124, 181, 255, 0.2);
        color: #d9ebff;
        padding: 10px 12px;
        text-align: left;
        border-radius: 8px;
        cursor: pointer;
      }

      .sidebar button.active {
        background: #163d52;
        border-color: #59b6ff;
      }

      .content {
        display: grid;
        grid-template-columns: minmax(520px, 1.2fr) minmax(300px, 0.8fr);
        gap: 20px;
        padding: 20px;
        overflow: auto;
      }

      .panel {
        background: rgba(9, 25, 34, 0.95);
        border: 1px solid rgba(124, 181, 255, 0.2);
        border-radius: 14px;
        box-shadow: 0 0 24px rgba(16, 64, 100, 0.25);
      }

      .panel-header {
        border-bottom: 1px solid rgba(124, 181, 255, 0.15);
        padding: 16px 18px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #9fe1ff;
      }

      .form-panel {
        padding-bottom: 10px;
      }

      form {
        padding: 16px 18px 18px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(180px, 1fr));
        gap: 12px 16px;
      }

      .small-grid {
        grid-template-columns: repeat(2, minmax(160px, 1fr));
      }

      label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        color: #8eaec5;
      }

      input {
        background: #0c1b27;
        border: 1px solid rgba(124, 181, 255, 0.2);
        border-radius: 8px;
        padding: 10px 12px;
        color: #eaf6ff;
      }

      select {
        background: #0c1b27;
        border: 1px solid rgba(124, 181, 255, 0.2);
        border-radius: 8px;
        padding: 10px 12px;
        color: #eaf6ff;
      }

      .security-tools { display: flex; gap: 8px; }
      .security-tools input { min-width: 0; flex: 1; }
      .search-button { padding: 8px 10px; white-space: nowrap; }

      .subsection {
        margin-top: 18px;
      }

      .subsection h3 {
        margin: 0 0 10px;
        font-size: 13px;
        color: #9fe1ff;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .actions {
        display: flex;
        gap: 12px;
        margin-top: 20px;
      }

      button.primary, button.secondary {
        border: none;
        border-radius: 8px;
        padding: 10px 18px;
        font-weight: 700;
        cursor: pointer;
      }

      .primary {
        background: linear-gradient(135deg, #3ae374, #0ecb8d);
        color: #062116;
      }

      button:disabled {
        cursor: wait;
        opacity: 0.65;
      }

      .secondary {
        background: #102532;
        color: #d9ebff;
        border: 1px solid rgba(124, 181, 255, 0.2);
      }

      .quote-panel {
        padding-bottom: 12px;
      }

      .quote-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(120px, 1fr));
        gap: 14px;
        padding: 18px;
      }

      .quote-box {
        background: rgba(17, 33, 45, 0.9);
        border: 1px solid rgba(124, 181, 255, 0.15);
        border-radius: 12px;
        padding: 12px;
      }

      .quote-box.accent {
        background: rgba(13, 61, 69, 0.6);
        border-color: rgba(79, 227, 186, 0.4);
      }

      .label {
        display: block;
        font-size: 11px;
        color: #8eaec5;
        margin-bottom: 8px;
        text-transform: uppercase;
      }

      .quote-box strong {
        font-size: 18px;
      }

      .json-box {
        margin: 0 18px 18px;
        background: #07141d;
        border: 1px solid rgba(124, 181, 255, 0.15);
        border-radius: 12px;
        overflow: auto;
        max-height: 360px;
      }

      pre {
        margin: 0;
        padding: 14px;
        color: #a7f3c5;
        font-size: 12px;
        white-space: pre-wrap;
      }

      .error-message {
        margin: 14px 0 0;
        color: #ff9292;
        font-size: 12px;
      }

      .response-state,
      .response-error { margin: 14px 18px 0; font-size: 12px; }
      .response-state { color: #9fe1ff; }
      .response-error { color: #ff9292; }

      .chart-box { margin: 0 18px 18px; padding: 14px; background: #0a1b25; border: 1px solid rgba(124, 181, 255, 0.15); border-radius: 12px; }
      .chart-heading { display: flex; justify-content: space-between; color: #9fe1ff; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
      .chart-heading span:last-child { color: #8eaec5; }
      svg { width: 100%; height: auto; margin-top: 10px; }
      .chart-axis { stroke: rgba(142, 174, 197, .35); stroke-width: 1; }
      .chart-line { fill: none; stroke: #3ae374; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
      .chart-point { fill: #9fe1ff; stroke: #07141d; stroke-width: 2; }

      .calculators-panel, .calculator-results-panel { padding-bottom: 18px; }
      .calculator-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 22px; padding: 20px; }
      .calculator-picker { border-right: 1px solid rgba(124, 181, 255, 0.15); padding-right: 20px; }
      .calculator-description, .empty-results { color: #8eaec5; font-size: 12px; line-height: 1.6; }
      .calculator-form { padding: 0; }
      .calculator-fields { display: grid; grid-template-columns: repeat(2, minmax(160px, 1fr)); gap: 14px 16px; }
      .calculator-results { display: grid; grid-template-columns: repeat(2, minmax(160px, 1fr)); gap: 14px; padding: 20px; }
      .result-card { background: rgba(17, 33, 45, 0.9); border: 1px solid rgba(124, 181, 255, 0.15); border-radius: 10px; padding: 14px; }
      .result-card span { display: block; color: #8eaec5; font-size: 11px; text-transform: uppercase; margin-bottom: 8px; }
      .result-card strong { color: #a7f3c5; font-size: 18px; word-break: break-word; }
      .empty-results { margin: 20px; }
          .schedule { padding: 0 20px 20px; }
      .schedule-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 4px 0 12px; }
      .schedule h3 { color: #9fe1ff; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; margin: 0; }
      .export-button { border: 1px solid rgba(79, 227, 186, 0.4); border-radius: 7px; padding: 8px 12px; background: rgba(13, 61, 69, 0.6); color: #a7f3c5; font-weight: 700; cursor: pointer; }
          .schedule-table-wrapper { max-height: 420px; overflow: auto; border: 1px solid rgba(124, 181, 255, 0.15); border-radius: 10px; }
          table { width: 100%; border-collapse: collapse; min-width: 620px; font-size: 12px; }
          th, td { padding: 10px 12px; text-align: right; border-bottom: 1px solid rgba(124, 181, 255, 0.1); }
          th:first-child, td:first-child { text-align: left; }
          th { position: sticky; top: 0; background: #102532; color: #9fe1ff; font-weight: 700; }
          td { color: #d9ebff; }
          :host.light-theme .schedule h3 { color: #0b5560; }
          :host.light-theme .export-button { background: #e9f6f4; color: #0b6b55; border-color: rgba(11, 107, 85, 0.25); }
          :host.light-theme th { background: #e9f6f4; color: #06323a; }
          :host.light-theme td { color: #072024; }
      :host.light-theme .calculator-picker { border-right-color: rgba(7, 20, 29, 0.08); }
      :host.light-theme .result-card { background: #f6fbfc; border-color: rgba(7, 20, 29, 0.08); }
      :host.light-theme .result-card strong { color: #0b6b55; }
      @media (max-width: 900px) {
        .calculator-layout { grid-template-columns: 1fr; }
        .calculator-picker { border-right: 0; border-bottom: 1px solid rgba(124, 181, 255, 0.15); padding: 0 0 16px; }
      }
    `
  ]
})
export class AppComponent implements OnInit {
  apiOnline = false;
  @HostBinding('class.light-theme')
  isLightTheme = false;
  language = 'en';
  isPricing = false;
  apiError = '';
  isSearchingSecurities = false;
  securityResults: YahooSecurity[] = [];
  private securitySearchTimer?: ReturnType<typeof setTimeout>;
  selectedProduct = 'EQTY_OPT';
  lastResponse: PriceResponse | null = null;
  marketFields: Array<{ key: string; label: string; type?: string; options?: string[] }> = [];
  instrumentFields: Array<{ key: string; label: string; type?: string; options?: string[] }> = [];
  selectedCalculator = 'loan';
  isCalculatorRunning = false;
  calculatorError = '';
  calculatorResult: Record<string, unknown> | null = null;
  calculatorForm: FormGroup;

  readonly calculatorGroups = [
    { label: 'Mortgage and Real Estate', items: ['mortgage', 'loan', 'payment', 'apr'] },
    { label: 'Auto', items: ['auto-loan'] },
    { label: 'Investment', items: ['simple-interest', 'compound-interest', 'savings', 'investment', 'bond', 'roi', 'irr'] },
    { label: 'Retirement', items: ['retirement', '401k', 'ira', 'annuity', 'annuity-payout'] },
    { label: 'Other', items: ['currency', 'inflation', 'debt-payoff', 'credit-card-payoff', 'student-loan'] }
  ];

  form: FormGroup;

  constructor(private http: HttpClient, private fb: FormBuilder, private cdr: ChangeDetectorRef, private translate: TranslateService) {
    this.form = this.fb.group({
      request_id: ['REQ-1001'],
      security_id: ['AAPL US Equity'],
      security_name: ['AAPL US Equity'],
      product: ['EQTY_OPT'],
      curve_name: ['USD-SOFR'],
      market_data_source: ['BDP'],
      pricing_model: ['BLACK_SCHOLES'],
      underlying_spot: [100],
      risk_free_rate: [0.05],
      implied_volatility: [0.2],
      dividend_yield: [0.01],
      strike: [100],
      maturity_years: [1],
      option_type: ['CALL'],
      exercise_style: ['EUROPEAN']
      ,face_value: [100], coupon_rate: [0.04], coupon_frequency: [2], yield_to_maturity: [0.035]
      ,forecast_dividend: [2], growth_rate: [0.03], discount_rate: [0.05]
      ,tenors: [[1, 2, 3, 5, 7, 10]], discount_curve_rates: [[0.018, 0.022, 0.025, 0.029, 0.031, 0.033]], frequency: [2]
      ,notional: [1000000], fixed_rate: [0.03], payment_frequency: [2], receiver: [true]
      ,spread: [0.015], recovery_rate: [0.4]
      ,spot: [1.08], domestic_rate: [0.05], foreign_rate: [0.02], pair: ['EURUSD']
    });
    this.calculatorForm = this.fb.group({
      principal: [250000], amount: [10000], annualRate: [0.05], interestRate: [0.05], termYears: [30],
      paymentsPerYear: [12], compoundsPerYear: [12], contribution: [0], contributionFrequency: [12],
      payment: [1500], monthlyPayment: [300], initialInvestment: [10000], annualContribution: [5000],
      returnRate: [0.07], currentSavings: [25000], futureValue: [15000], exchangeRate: [1.08],
      inflationRate: [0.03], taxRate: [0.2], fees: [0], cashFlows: ['-10000,3000,4000,5000'],
      faceValue: [100], couponRate: [0.05], couponFrequency: [1], maturityDate: ['2029-09-16'],
      settlementDate: ['2026-09-19'], dayCount: ['30/360']
    });
  }

  get calculatorFields(): CalculatorField[] {
    const commonRate = [{ key: 'annualRate', label: 'Annual rate', step: '0.0001' }];
    const fields: Record<string, CalculatorField[]> = {
      loan: [{ key: 'principal', label: 'Principal' }, ...commonRate, { key: 'termYears', label: 'Term (years)' }, { key: 'paymentsPerYear', label: 'Payments per year', step: '1' }],
      payment: [{ key: 'principal', label: 'Principal' }, ...commonRate, { key: 'termYears', label: 'Term (years)' }, { key: 'paymentsPerYear', label: 'Payments per year', step: '1' }],
      mortgage: [{ key: 'principal', label: 'Loan amount' }, ...commonRate, { key: 'termYears', label: 'Term (years)' }, { key: 'paymentsPerYear', label: 'Payments per year', step: '1' }],
      'auto-loan': [{ key: 'principal', label: 'Loan amount' }, ...commonRate, { key: 'termYears', label: 'Term (years)' }, { key: 'paymentsPerYear', label: 'Payments per year', step: '1' }],
      'student-loan': [{ key: 'principal', label: 'Loan amount' }, ...commonRate, { key: 'termYears', label: 'Term (years)' }, { key: 'paymentsPerYear', label: 'Payments per year', step: '1' }],
      'simple-interest': [{ key: 'principal', label: 'Principal' }, ...commonRate, { key: 'termYears', label: 'Term (years)' }],
      'compound-interest': [{ key: 'principal', label: 'Principal' }, ...commonRate, { key: 'termYears', label: 'Term (years)' }, { key: 'compoundsPerYear', label: 'Compounds per year', step: '1' }, { key: 'contribution', label: 'Contribution' }, { key: 'contributionFrequency', label: 'Contribution frequency', step: '1' }],
      savings: [{ key: 'principal', label: 'Initial savings' }, ...commonRate, { key: 'termYears', label: 'Term (years)' }, { key: 'compoundsPerYear', label: 'Compounds per year', step: '1' }, { key: 'contribution', label: 'Contribution' }, { key: 'contributionFrequency', label: 'Contribution frequency', step: '1' }],
      investment: [{ key: 'principal', label: 'Initial investment' }, { key: 'returnRate', label: 'Return rate', step: '0.0001' }, { key: 'termYears', label: 'Term (years)' }, { key: 'contribution', label: 'Contribution' }, { key: 'contributionFrequency', label: 'Contribution frequency', step: '1' }],
      bond: [{ key: 'faceValue', label: 'Face value' }, { key: 'annualRate', label: 'Yield', step: '0.0001' }, { key: 'couponRate', label: 'Annual coupon', step: '0.0001' }, { key: 'couponFrequency', label: 'Coupon frequency', step: '1' }, { key: 'maturityDate', label: 'Maturity date', type: 'date' }, { key: 'settlementDate', label: 'Settlement date', type: 'date' }, { key: 'dayCount', label: 'Day count', type: 'text' }],
      roi: [{ key: 'principal', label: 'Amount invested' }, { key: 'futureValue', label: 'Amount returned' }],
      irr: [{ key: 'cashFlows', label: 'Cash flows (comma-separated)', type: 'text' }],
      retirement: [{ key: 'currentSavings', label: 'Current savings' }, { key: 'annualContribution', label: 'Annual contribution' }, { key: 'returnRate', label: 'Return rate', step: '0.0001' }, { key: 'termYears', label: 'Years to retirement' }],
      '401k': [{ key: 'currentSavings', label: 'Current savings' }, { key: 'annualContribution', label: 'Annual contribution' }, { key: 'returnRate', label: 'Return rate', step: '0.0001' }, { key: 'termYears', label: 'Years to retirement' }],
      ira: [{ key: 'currentSavings', label: 'Current savings' }, { key: 'annualContribution', label: 'Annual contribution' }, { key: 'returnRate', label: 'Return rate', step: '0.0001' }, { key: 'termYears', label: 'Years to retirement' }],
      annuity: [{ key: 'payment', label: 'Payment' }, ...commonRate, { key: 'termYears', label: 'Term (years)' }, { key: 'paymentsPerYear', label: 'Payments per year', step: '1' }],
      'annuity-payout': [{ key: 'payment', label: 'Payment' }, ...commonRate, { key: 'termYears', label: 'Term (years)' }, { key: 'paymentsPerYear', label: 'Payments per year', step: '1' }],
      'debt-payoff': [{ key: 'principal', label: 'Debt balance' }, ...commonRate, { key: 'monthlyPayment', label: 'Monthly payment' }],
      'credit-card-payoff': [{ key: 'principal', label: 'Credit card balance' }, ...commonRate, { key: 'monthlyPayment', label: 'Monthly payment' }],
      inflation: [{ key: 'amount', label: 'Current amount' }, { key: 'inflationRate', label: 'Inflation rate', step: '0.0001' }, { key: 'termYears', label: 'Years' }],
      'sales-tax': [{ key: 'amount', label: 'Amount' }, { key: 'taxRate', label: 'Tax rate', step: '0.0001' }],
      vat: [{ key: 'amount', label: 'Amount' }, { key: 'taxRate', label: 'VAT rate', step: '0.0001' }],
      currency: [{ key: 'amount', label: 'Amount' }, { key: 'exchangeRate', label: 'Exchange rate', step: '0.0001' }],
      apr: [{ key: 'principal', label: 'Principal' }, ...commonRate, { key: 'fees', label: 'Fees' }, { key: 'termYears', label: 'Term (years)' }]
    };
    return fields[this.selectedCalculator] || fields['loan'];
  }

  get calculatorResultEntries(): Array<[string, unknown]> {
    return this.calculatorResult ? Object.entries(this.calculatorResult).filter(([key]) => key !== 'calculator' && key !== 'schedule') : [];
  }

  get calculatorSchedule(): Array<Record<string, unknown>> {
    const schedule = this.calculatorResult?.['schedule'];
    return Array.isArray(schedule) ? schedule as Array<Record<string, unknown>> : [];
  }

  ngOnInit(): void {
    // initialize theme from localStorage or system preference
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'LIGHT' || stored === 'DARK') {
        this.isLightTheme = stored === 'LIGHT';
      } else if (typeof window !== 'undefined' && (window as any).matchMedia) {
        this.isLightTheme = (window as any).matchMedia('(prefers-color-scheme: light)').matches;
      }
      const storedLang = localStorage.getItem('language');
      if (storedLang === 'EN' || storedLang === 'FR') this.language = storedLang;
    } catch (e) {
      // ignore storage errors
    }
    // init translate
    try {
      const storedLang = localStorage.getItem('language');
      if (storedLang) this.language = storedLang.toLowerCase();
    } catch (e) {}
    this.translate.addLangs(['en', 'fr']);
    this.translate.setDefaultLang('en');
    this.translate.use(this.language);
    // ensure UI updates when translations load or language changes
    try {
      this.translate.onLangChange.subscribe(() => this.cdr.detectChanges());
      this.translate.onTranslationChange.subscribe(() => this.cdr.detectChanges());
    } catch (e) {}

    this.applyThemeToBody();
    this.applyFormForProduct(this.selectedProduct);
    this.checkApi();
  }

  get selectedProductLabel(): string {
    const translated = this.translate.instant(this.selectedProduct);
    return translated && translated !== this.selectedProduct ? translated : this.translate.instant('instrument');
  }

  readonly productOptions = [
    { code: 'EQTY_OPT', label: 'Equity Option' },
    { code: 'IRS', label: 'Interest Rate Swap' },
    { code: 'CDS', label: 'Credit Default Swap' },
    { code: 'FXC', label: 'FX Forward' },
    { code: 'BOND', label: 'Fixed Income Bond' },
    { code: 'EQUITY', label: 'Equity' },
    { code: 'CALCULATORS', label: 'Financial Calculators' }
  ];

  get securityOptions(): string[] {
    return {
      EQTY_OPT: ['AAPL US Equity', 'MSFT US Equity', 'SPY US Equity', 'TSLA US Equity'],
      IRS: ['USD 2Y IRS', 'USD 5Y IRS', 'EUR 5Y IRS', 'GBP 10Y IRS'],
      CDS: ['XYZ 5Y CDS', 'AAPL 5Y CDS', 'IBM 5Y CDS'],
      FXC: ['EURUSD Curncy', 'GBPUSD Curncy', 'USDJPY Curncy'],
      BOND: ['US GOVT 2Y', 'US GOVT 5Y', 'US GOVT 10Y'],
      EQUITY: ['AAPL US Equity', 'MSFT US Equity', 'SPY US Equity', 'TSLA US Equity']
    }[this.selectedProduct] || [];
  }

  securityQueryChanged(query: string): void {
    if (this.securitySearchTimer) clearTimeout(this.securitySearchTimer);
    if (!query.trim()) {
      this.securityResults = [];
      return;
    }
    this.securitySearchTimer = setTimeout(() => this.searchSecurities(query), 400);
  }

  searchSecurities(query = String(this.form.get('security_id')?.value || '')): void {
    if (this.securitySearchTimer) clearTimeout(this.securitySearchTimer);
    query = query.trim();
    if (!query) return;

    this.isSearchingSecurities = true;
    const params = new HttpParams().set('q', query);
    this.http.get<{ quotes?: YahooSecurity[] }>('/api/securities/search', { params }).pipe(
      finalize(() => {
        this.isSearchingSecurities = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (response) => {
        this.securityResults = response.quotes || [];
        if (!this.securityResults.length) {
          this.apiError = 'Aucune security Yahoo trouvée.';
          return;
        }
        this.apiError = '';
        const normalizedQuery = query.toUpperCase();
        const selected = this.securityResults.find(item => item.symbol.toUpperCase() === normalizedQuery)
          || this.securityResults.find(item => item.symbol.toUpperCase().startsWith(normalizedQuery))
          || this.securityResults[0];
        this.selectSecurity(selected.symbol);
      },
      error: (error: HttpErrorResponse) => {
        this.apiError = error.error?.message || 'Recherche Yahoo Finance indisponible.';
      }
    });
  }

  selectSecurity(symbol: string): void {
    const security = this.securityResults.find(item => item.symbol === symbol);
    if (security) {
      this.form.patchValue({
        security_id: security.symbol,
        security_name: security.longname || security.shortname || security.symbol
      });
    }
  }

  get pricingModelOptions(): string[] {
    if (this.selectedProduct === 'EQTY_OPT') return ['BLACK_SCHOLES', 'BINOMIAL', 'MONTE_CARLO'];
    if (this.selectedProduct === 'BOND' || this.selectedProduct === 'EQUITY') return ['DISCOUNTED_CASH_FLOW'];
    if (this.selectedProduct === 'IRS' || this.selectedProduct === 'CDS') return ['PAR_SWAP'];
    return ['FX_FORWARD'];
  }

  selectProduct(product: string): void {
    this.selectedProduct = product;
    this.lastResponse = null;
    this.apiError = '';
    this.calculatorError = '';
    this.calculatorResult = null;
    this.applyFormForProduct(product);
  }

  selectCalculator(calculator: string): void {
    this.selectedCalculator = calculator;
    this.calculatorError = '';
    this.calculatorResult = null;
  }

  calculatorLabel(calculator: string): string {
    const key = `calculator_${calculator.replaceAll('-', '_')}`;
    const translated = this.translate.instant(key);
    return translated === key ? calculator.replaceAll('-', ' ').replace(/\b\w/g, character => character.toUpperCase()) : translated;
  }

  calculatorGroupLabel(label: string): string {
    const keys: Record<string, string> = {
      'Mortgage and Real Estate': 'calculator_group_mortgage',
      Auto: 'calculator_group_auto',
      Investment: 'calculator_group_investment',
      Retirement: 'calculator_group_retirement',
      Other: 'calculator_group_other'
    };
    return this.translate.instant(keys[label] || label);
  }

  calculatorFieldLabel(label: string): string {
    const key = `calculator_field_${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
    const translated = this.translate.instant(key);
    return translated === key ? label : translated;
  }

  calculateFinancialCalculator(): void {
    if (this.isCalculatorRunning) return;
    const raw = this.calculatorForm.getRawValue();
    const payload: Record<string, unknown> = {};
    for (const field of this.calculatorFields) {
      const value = raw[field.key];
      if (field.key === 'cashFlows') {
        payload[field.key] = String(value || '').split(',').map(item => Number(item.trim()));
      } else if (field.type === 'date' || field.type === 'text') {
        payload[field.key] = value;
      } else {
        payload[field.key] = Number(value);
      }
    }

    this.isCalculatorRunning = true;
    this.calculatorError = '';
    this.http.post<Record<string, unknown>>(`/api/v1/calculators/${this.selectedCalculator}`, payload).pipe(
      timeout(15000),
      finalize(() => {
        this.isCalculatorRunning = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: result => {
        this.calculatorResult = result;
        this.apiOnline = true;
      },
      error: (error: HttpErrorResponse) => {
        this.apiOnline = false;
        this.calculatorError = error.error?.message || 'Calculator API unavailable.';
      }
    });
  }

  resetCalculator(): void {
    this.calculatorError = '';
    this.calculatorResult = null;
    this.calculatorForm.reset({
      principal: 250000, amount: 10000, annualRate: 0.05, interestRate: 0.05, termYears: 30,
      paymentsPerYear: 12, compoundsPerYear: 12, contribution: 0, contributionFrequency: 12,
      payment: 1500, monthlyPayment: 300, initialInvestment: 10000, annualContribution: 5000,
      returnRate: 0.07, currentSavings: 25000, futureValue: 15000, exchangeRate: 1.08,
      inflationRate: 0.03, taxRate: 0.2, fees: 0, cashFlows: '-10000,3000,4000,5000',
      faceValue: 100, couponRate: 0.05, couponFrequency: 1, maturityDate: '2029-09-16',
      settlementDate: '2026-09-19', dayCount: '30/360'
    });
  }

  formatCalculatorKey(key: string): string {
    const translationKey = `calculator_result_${key.replaceAll(/([a-z])([A-Z])/g, '$1_$2').replaceAll('-', '_').toLowerCase()}`;
    const translated = this.translate.instant(translationKey);
    if (translated !== translationKey) return translated;
    return key.replaceAll(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  formatCalculatorValue(value: unknown): string {
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(6);
    return String(value);
  }

  exportScheduleToExcel(): void {
    if (!this.calculatorSchedule.length) return;
    const rows = this.calculatorSchedule.map(row => ({
      [this.translate.instant('schedule_period')]: row['period'],
      [this.translate.instant('schedule_payment')]: row['payment'],
      [this.translate.instant('schedule_principal')]: row['principal'],
      [this.translate.instant('schedule_interest')]: row['interest'],
      [this.translate.instant('schedule_balance')]: row['balance']
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
    XLSX.writeFile(workbook, `${this.selectedCalculator}-amortization-schedule.xlsx`);
  }

  applyFormForProduct(product: string): void {
    const base = {
      request_id: 'REQ-1001',
      security_id: 'AAPL US Equity',
      security_name: 'AAPL US Equity',
      curve_name: 'USD-SOFR',
      market_data_source: 'BDP',
      pricing_model: 'BLACK_SCHOLES',
      product
    };

    if (product === 'IRS') {
      this.form.patchValue({
        ...base,
        security_id: 'USD 5Y IRS',
        security_name: 'USD 5Y IRS',
        market_data_source: 'Bloomberg',
        pricing_model: 'PAR_SWAP',
        notional: 1000000,
        fixed_rate: 0.03,
        maturity_years: 5,
        payment_frequency: 2,
        receiver: true,
        tenors: [1, 2, 3, 5, 7, 10],
        discount_curve_rates: [0.018, 0.022, 0.025, 0.029, 0.031, 0.033],
        frequency: 2
      });
      this.marketFields = [
        { key: 'tenors', label: 'Tenors' },
        { key: 'discount_curve_rates', label: 'Discount Curve Rates' },
        { key: 'frequency', label: 'Frequency' }
      ];
      this.instrumentFields = [
        { key: 'notional', label: 'Notional' },
        { key: 'fixed_rate', label: 'Fixed Rate' },
        { key: 'maturity_years', label: 'Maturity (Y)' },
        { key: 'payment_frequency', label: 'Payment Freq.' },
        { key: 'receiver', label: 'Receiver', type: 'checkbox' }
      ];
      return;
    }

    if (product === 'CDS') {
      this.form.patchValue({
        ...base,
        security_id: 'XYZ 5Y CDS',
        security_name: 'XYZ 5Y CDS',
        market_data_source: 'Bloomberg',
        pricing_model: 'IMPLIED_HAZARD',
        notional: 1000000,
        spread: 0.015,
        maturity_years: 5,
        payment_frequency: 4,
        recovery_rate: 0.4,
        tenors: [1, 2, 3, 5, 7, 10],
        discount_curve_rates: [0.015, 0.018, 0.021, 0.025, 0.028, 0.031],
        frequency: 4
      });
      this.marketFields = [
        { key: 'tenors', label: 'Tenors' },
        { key: 'discount_curve_rates', label: 'Discount Curve Rates' },
        { key: 'frequency', label: 'Frequency' }
      ];
      this.instrumentFields = [
        { key: 'notional', label: 'Notional' },
        { key: 'spread', label: 'Spread' },
        { key: 'maturity_years', label: 'Maturity (Y)' },
        { key: 'payment_frequency', label: 'Payment Freq.' },
        { key: 'recovery_rate', label: 'Recovery' }
      ];
      return;
    }

    if (product === 'FXC') {
      this.form.patchValue({
        ...base,
        security_id: 'EURUSD Curncy',
        security_name: 'EURUSD Curncy',
        market_data_source: 'Reuters',
        pricing_model: 'FX_FORWARD',
        spot: 1.08,
        domestic_rate: 0.05,
        foreign_rate: 0.02,
        pair: 'EURUSD',
        maturity_years: 1
      });
      this.marketFields = [
        { key: 'spot', label: 'Spot' },
        { key: 'domestic_rate', label: 'Domestic Rate' },
        { key: 'foreign_rate', label: 'Foreign Rate' }
      ];
      this.instrumentFields = [
        { key: 'pair', label: 'Pair', options: ['EURUSD', 'GBPUSD', 'USDJPY'] },
        { key: 'maturity_years', label: 'Maturity (Y)' }
      ];
      return;
    }

    if (product === 'BOND') {
      this.form.patchValue({ ...base, security_id: 'US GOVT 5Y', security_name: 'US GOVT 5Y', product: 'BOND', market_data_source: 'Bloomberg', pricing_model: 'DISCOUNTED_CASH_FLOW', face_value: 100, coupon_rate: 0.04, coupon_frequency: 2, maturity_years: 5, yield_to_maturity: 0.035 });
      this.marketFields = [{ key: 'yield_to_maturity', label: 'Yield to Maturity' }];
      this.instrumentFields = [{ key: 'face_value', label: 'Face Value' }, { key: 'coupon_rate', label: 'Coupon Rate' }, { key: 'coupon_frequency', label: 'Coupon Freq.' }, { key: 'maturity_years', label: 'Maturity (Y)' }];
      return;
    }

    if (product === 'EQUITY') {
      this.form.patchValue({ ...base, security_id: 'AAPL US Equity', security_name: 'AAPL US Equity', product: 'EQUITY', market_data_source: 'Bloomberg', pricing_model: 'DISCOUNTED_CASH_FLOW', forecast_dividend: 2, growth_rate: 0.03, underlying_spot: 100, discount_rate: 0.05 });
      this.marketFields = [{ key: 'underlying_spot', label: 'Underlying Spot' }, { key: 'discount_rate', label: 'Discount Rate' }];
      this.instrumentFields = [{ key: 'forecast_dividend', label: 'Forecast Dividend' }, { key: 'growth_rate', label: 'Growth Rate' }];
      return;
    }

    this.form.patchValue({
      ...base,
      underlying_spot: 100,
      risk_free_rate: 0.05,
      implied_volatility: 0.2,
      dividend_yield: 0.01,
      strike: 100,
      maturity_years: 1,
      option_type: 'CALL',
      exercise_style: 'EUROPEAN'
    });
    this.marketFields = [
      { key: 'underlying_spot', label: 'Underlying Spot' },
      { key: 'risk_free_rate', label: 'Risk-Free Rate' },
      { key: 'implied_volatility', label: 'Volatility' },
      { key: 'dividend_yield', label: 'Dividend Yield' }
    ];
    this.instrumentFields = [
      { key: 'strike', label: 'Strike' },
      { key: 'maturity_years', label: 'Maturity (Y)' },
      { key: 'option_type', label: 'Option Type', options: ['CALL', 'PUT'] },
      { key: 'exercise_style', label: 'Exercise Style', options: ['EUROPEAN', 'AMERICAN'] }
    ];
  }

  checkApi(): void {
    this.http.get<{ status?: string }>('/api/health').subscribe({
      next: () => this.apiOnline = true,
      error: () => this.apiOnline = false
    });
  }

  submitRequest(): void {
    if (this.isPricing) return;

    const payload = this.buildPayload();
    const url = this.urlForProduct(this.selectedProduct);
    this.isPricing = true;
    this.apiError = '';
    this.lastResponse = null;

    this.http.post<PriceResponse>(url, payload).pipe(
      timeout(15000),
      finalize(() => {
        this.isPricing = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (response) => {
        this.lastResponse = response;
        this.apiOnline = true;
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.apiOnline = false;
        const serverMessage = typeof error.error?.message === 'string' ? error.error.message : '';
        this.apiError = serverMessage || (error instanceof TimeoutError
          ? 'The pricing API did not respond within 15 seconds.'
          : 'Pricing API unavailable. Start the Spring Boot service on port 9092.');
        this.cdr.detectChanges();
      }
    });
  }

  setTheme(isLight: boolean): void {
    this.isLightTheme = isLight;
    try {
      localStorage.setItem('theme', isLight ? 'LIGHT' : 'DARK');
    } catch (e) {}
    this.applyThemeToBody();
  }

  setLanguage(lang: string): void {
    this.language = lang.toLowerCase();
    try {
      localStorage.setItem('language', this.language);
    } catch (e) {}
    try {
      this.translate.use(this.language);
    } catch (e) {}
  }

  private applyThemeToBody(): void {
    if (typeof document === 'undefined' || !document.body) return;
    if (this.isLightTheme) {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    } else {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    }
  }

  buildPayload(): Record<string, unknown> {
    const values = this.form.getRawValue();

    const base = {
      request_id: values.request_id,
      security_id: values.security_id,
      security_name: values.security_name,
      product: this.selectedProduct,
      curve_name: values.curve_name,
      market_data_source: values.market_data_source,
      pricing_model: values.pricing_model
    };

    if (this.selectedProduct === 'EQTY_OPT') {
      return {
        ...base,
        market_data: {
          underlying_spot: Number(values.underlying_spot),
          risk_free_rate: Number(values.risk_free_rate),
          implied_volatility: Number(values.implied_volatility),
          dividend_yield: Number(values.dividend_yield)
        },
        instrument: {
          strike: Number(values.strike),
          maturity_years: Number(values.maturity_years),
          option_type: values.option_type,
          exercise_style: values.exercise_style
        }
      };
    }

    if (this.selectedProduct === 'IRS') {
      return {
        ...base,
        market_data: {
          tenors: values.tenors,
          discount_curve_rates: values.discount_curve_rates,
          frequency: Number(values.frequency)
        },
        instrument: {
          notional: Number(values.notional),
          fixed_rate: Number(values.fixed_rate),
          maturity_years: Number(values.maturity_years),
          payment_frequency: Number(values.payment_frequency),
          receiver: Boolean(values.receiver)
        }
      };
    }

    if (this.selectedProduct === 'CDS') {
      return {
        ...base,
        market_data: {
          tenors: values.tenors,
          discount_curve_rates: values.discount_curve_rates,
          frequency: Number(values.frequency)
        },
        instrument: {
          notional: Number(values.notional),
          spread: Number(values.spread),
          maturity_years: Number(values.maturity_years),
          payment_frequency: Number(values.payment_frequency),
          recovery_rate: Number(values.recovery_rate)
        }
      };
    }

    if (this.selectedProduct === 'BOND') {
      return { model: values.pricing_model, face_value: Number(values.face_value), coupon_rate: Number(values.coupon_rate), coupon_frequency: Number(values.coupon_frequency), maturity_years: Number(values.maturity_years), yield_to_maturity: Number(values.yield_to_maturity) };
    }

    if (this.selectedProduct === 'EQUITY') {
      return { model: values.pricing_model, forecast_dividend: Number(values.forecast_dividend), growth_rate: Number(values.growth_rate), underlying_spot: Number(values.underlying_spot), discount_rate: Number(values.discount_rate) };
    }

    return {
      ...base,
      market_data: {
        spot: Number(values.spot),
        domestic_rate: Number(values.domestic_rate),
        foreign_rate: Number(values.foreign_rate)
      },
      instrument: {
        pair: values.pair,
        maturity_years: Number(values.maturity_years)
      }
    };
  }

  urlForProduct(product: string): string {
    const map: Record<string, string> = {
      EQTY_OPT: '/api/v1/blp/pricing/equity-option',
      IRS: '/api/v1/blp/pricing/irs',
      CDS: '/api/v1/blp/pricing/cds',
      FXC: '/api/v1/blp/pricing/fx-forward'
      ,BOND: '/api/v1/blp/pricing/fixed-income-bond'
      ,EQUITY: '/api/v1/blp/pricing/equity'
    };
    return map[product] || '/api/v1/blp/pricing/equity-option';
  }

  formatResultValue(result: Record<string, unknown> | undefined): string {
    if (!result) return '-';
    if (typeof result['price'] === 'number') return `$${Number(result['price']).toFixed(4)}`;
    if (typeof result['present_value'] === 'number') return `$${Number(result['present_value']).toFixed(2)}`;
    if (typeof result['forward_price'] === 'number') return Number(result['forward_price']).toFixed(6).toString();
    if (typeof result['implied_hazard_rate'] === 'number') return Number(result['implied_hazard_rate']).toFixed(6).toString();
    if (typeof result['par_rate'] === 'number') return Number(result['par_rate']).toFixed(6).toString();
    return JSON.stringify(result);
  }

  resetForm(): void {
    this.applyFormForProduct(this.selectedProduct);
    this.lastResponse = null;
    this.apiError = '';
  }

  get chartTitle(): string {
    return this.selectedProduct === 'IRS' || this.selectedProduct === 'CDS' ? 'Curve monitor' : 'Sensitivity monitor';
  }

  get chartUnit(): string {
    return this.selectedProduct === 'FXC' ? 'Forward points' : this.selectedProduct === 'IRS' || this.selectedProduct === 'CDS' ? 'Rate' : 'Value';
  }

  get chartPoints(): Array<{ cx: number; cy: number }> {
    const values = this.form.getRawValue();
    let series: number[];
    if (this.selectedProduct === 'IRS' || this.selectedProduct === 'CDS') series = Array.from(values.discount_curve_rates || [], Number);
    else if (this.selectedProduct === 'FXC') series = [Number(values.spot), Number(values.spot) * (1 + (Number(values.domestic_rate) - Number(values.foreign_rate)) * Number(values.maturity_years))];
    else if (this.selectedProduct === 'EQTY_OPT') series = [80, 90, 100, 110, 120].map(spot => Math.max(spot - Number(values.strike), 0));
    else if (this.selectedProduct === 'BOND') series = [0, 1, 2, 3, 4, 5].map(year => Number(values.face_value) * Math.pow(1 + Number(values.yield_to_maturity), -year));
    else series = [Number(values.forecast_dividend), Number(values.forecast_dividend) * 1.1, Number(values.forecast_dividend) * 1.2, Number(values.forecast_dividend) * 1.3];
    series = series.filter(Number.isFinite);
    if (!series.length) return [];
    const min = Math.min(...series), max = Math.max(...series), spread = max - min || 1;
    return series.map((value, index) => ({ cx: 42 + index * (458 / Math.max(series.length - 1, 1)), cy: 145 - ((value - min) / spread) * 115 }));
  }

  get chartPolyline(): string {
    return this.chartPoints.map(point => `${point.cx},${point.cy}`).join(' ');
  }
}
