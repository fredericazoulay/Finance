import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { WorkGroupService } from '../../services/work-group.service';

type MurexScreenKind = 'query' | 'ticket' | 'market' | 'risk' | 'process';

interface MurexScreen {
  id: string;
  title: string;
  section: string;
  kind: MurexScreenKind;
  command: string;
  description: string;
}

interface MurexRecord {
  reference: string;
  version: string;
  status: string;
  product: string;
  instrument: string;
  side: string;
  quantity: string;
  currency: string;
  counterparty: string;
  portfolio: string;
  tradeDate: string;
  user: string;
}

interface MurexModuleRow {
  code: string;
  label: string;
  detail: string;
  status: string;
  asOf: string;
}

const SCREEN_CATALOG: MurexScreen[] = [
  { id: 'e-tradepad', title: 'E-Tradepad', section: 'Trading', kind: 'ticket', command: 'Pricing / E-Tradepad', description: 'Compose a trade, review market data and manage a demonstration blotter.' },
  { id: 'insert-trade', title: 'Insert trade', section: 'Trading', kind: 'ticket', command: 'Processing / Trades / Insert trade', description: 'Enter the core characteristics of a new trade.' },
  { id: 'order-query', title: 'Order query', section: 'Trading', kind: 'query', command: 'Processing / Trades / Order query', description: 'Search orders by reference, classification, portfolio and key dates.' },
  { id: 'trade-query', title: 'Trade query', section: 'Trading', kind: 'query', command: 'Processing / Trades / Trade query', description: 'Search and inspect trades across the selected workspace.' },
  { id: 'trade-query-type', title: 'Trade query by type', section: 'Trading', kind: 'query', command: 'Processing / Trades / Trade query by type', description: 'Restrict the trade search to a product family and type.' },
  { id: 'trade-query-user', title: 'Trade query by user filter', section: 'Trading', kind: 'query', command: 'Processing / Trades / Trade query by user filter', description: 'Review trades matching a user-defined filter.' },
  { id: 'free-packages-query', title: 'Free packages query', section: 'Trading', kind: 'query', command: 'Processing / Trades / Free packages query', description: 'Find unallocated packages in the demonstration book.' },
  { id: 'import-trade-market-values', title: 'Import trade market values', section: 'Trade control', kind: 'process', command: 'Middle office / Closing prices', description: 'Review a market-value import batch.' },
  { id: 'set-trade-marked-values', title: 'Set trade marked values', section: 'Trade control', kind: 'process', command: 'Middle office / Closing prices', description: 'Inspect marked-value updates before processing.' },
  { id: 'audit-global-trade-activity', title: 'Audit trail: Global trade activity', section: 'Trade control', kind: 'query', command: 'Middle office / Reporting / Audit trail', description: 'Review a chronological activity trail.' },
  { id: 'audit-trade-modifications', title: 'Audit trail: Trade modifications', section: 'Trade control', kind: 'query', command: 'Middle office / Reporting / Audit trail', description: 'Compare recorded trade changes.' },
  { id: 'audit-trade-version-diff', title: 'Audit trail: Trade version diff', section: 'Trade control', kind: 'query', command: 'Middle office / Reporting / Audit trail', description: 'Inspect differences between trade versions.' },
  { id: 'global-trade-fixing-dates', title: 'Global trade fixing procedure between two dates', section: 'Fixings', kind: 'process', command: 'Processing / Fixings', description: 'Review the fixing procedure for a selected period.' },
  { id: 'modify-trade-fixings', title: 'Modify values of trade fixings', section: 'Fixings', kind: 'process', command: 'Processing / Fixings', description: 'Inspect fixing values staged for modification.' },
  { id: 'modify-trade-fixings-past', title: 'Modify values of trade fixings as of a past date', section: 'Fixings', kind: 'process', command: 'Processing / Fixings', description: 'Review historical fixing adjustments.' },
  { id: 'trade-fixing-procedure', title: 'Trade fixing procedure', section: 'Fixings', kind: 'process', command: 'Processing / Fixings', description: 'Review pending trade fixing tasks.' },
  { id: 'trade-fixing-procedure-dates', title: 'Trade fixing procedure between two dates', section: 'Fixings', kind: 'process', command: 'Processing / Fixings', description: 'Review fixing tasks across a date range.' },
  { id: 'bond-generators', title: 'Bond generators', section: 'Fixed income', kind: 'market', command: 'Configuration / Generators / Bond generators', description: 'Browse demonstration bond generator conventions.' },
  { id: 'bond-indices', title: 'Bond indices', section: 'Fixed income', kind: 'market', command: 'Configuration / Indices / Bond indices', description: 'Review bond index reference entries.' },
  { id: 'bonds', title: 'Bonds', section: 'Fixed income', kind: 'market', command: 'Configuration / Securities / Bonds', description: 'Browse a small reference set of bonds.' },
  { id: 'bonds-spreads', title: 'Bonds spreads', section: 'Fixed income', kind: 'market', command: 'Historical data / Securities / Bonds spreads', description: 'Review sample historical bond spreads.' },
  { id: 'bond-futures-price-factors', title: 'Bond futures price factors', section: 'Fixed income', kind: 'market', command: 'Market data / Bonds / Bond futures price factors', description: 'Inspect sample futures price factors.' },
  { id: 'bonds-futures-prices', title: 'Bonds and futures prices', section: 'Fixed income', kind: 'market', command: 'Market data / Bonds / Bonds and futures prices', description: 'Review sample bond and futures prices.' },
  { id: 'bonds-futures-volatilities', title: 'Bonds and futures volatilities', section: 'Fixed income', kind: 'market', command: 'Market data / Bonds / Bonds and futures volatilities', description: 'Review sample volatility points.' },
  { id: 'bonds-repo-margins', title: 'Bonds repo margins', section: 'Fixed income', kind: 'market', command: 'Market data / Bonds / Bonds repo margins', description: 'Inspect sample repo margin references.' },
  { id: 'bonds-zero-coupon-model', title: 'Bonds zero coupon model', section: 'Fixed income', kind: 'market', command: 'Market data / Bonds / Bonds zero coupon model', description: 'Review zero-coupon curve model settings.' },
  { id: 'bond-pricing', title: 'Bond', section: 'Fixed income', kind: 'market', command: 'Pricing / Bonds / Bond', description: 'Inspect a fixed-income pricing workspace.' },
  { id: 'convertible-bond', title: 'Convertible bond', section: 'Fixed income', kind: 'market', command: 'Pricing / Equities / Convertible bond', description: 'Review a convertible bond product workspace.' },
  { id: 'bulk-event-audit', title: 'Bulk Event Audit', section: 'Processing', kind: 'process', command: 'Processing / Events / Bulk Event Audit', description: 'Review a demonstration corporate-event batch.' },
  { id: 'bulk-amendment-cancel-reissue', title: 'Bulk amendment (cancel and reissue)', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Inspect cancel-and-reissue amendments.' },
  { id: 'bulk-amendment-restructure', title: 'Bulk amendment (restructure)', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Inspect restructuring amendments.' },
  { id: 'bulk-cancel', title: 'Bulk cancel', section: 'Processing', kind: 'process', command: 'Processing / Events / Bulk cancel', description: 'Review trades selected for cancellation.' },
  { id: 'bulk-closing-out', title: 'Bulk closing out', section: 'Processing', kind: 'process', command: 'Processing / Events / Bulk closing out', description: 'Review a closing-out batch.' },
  { id: 'bulk-commit', title: 'Bulk commit', section: 'Processing', kind: 'process', command: 'Processing / Events / Bulk commit', description: 'Review items staged for commitment.' },
  { id: 'bulk-corporate-bonus', title: 'Bulk corporate Bonus Issue', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review a corporate bonus issue batch.' },
  { id: 'bulk-corporate-merger', title: 'Bulk corporate Merger', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review a corporate merger batch.' },
  { id: 'bulk-corporate-reverse-split', title: 'Bulk corporate Reverse Split', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review a reverse-split batch.' },
  { id: 'bulk-corporate-right-issue', title: 'Bulk corporate Right Issue', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review a rights-issue batch.' },
  { id: 'bulk-corporate-special-dividend', title: 'Bulk corporate Special Dividend', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review a special-dividend batch.' },
  { id: 'bulk-corporate-spin-off', title: 'Bulk corporate Spin Off', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review a spin-off batch.' },
  { id: 'bulk-corporate-split', title: 'Bulk corporate Split', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review a corporate split batch.' },
  { id: 'bulk-counterparty-amendment', title: 'Bulk counterparty amendment', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review counterparty amendments.' },
  { id: 'bulk-counterparty-amendment-full', title: 'Bulk counterparty amendment (FULL)', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review full counterparty amendments.' },
  { id: 'bulk-counterparty-assignment', title: 'Bulk counterparty assignment', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review counterparty assignments.' },
  { id: 'bulk-credit-basket-addition', title: 'Bulk credit basket addition', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review credit-basket additions.' },
  { id: 'bulk-credit-basket-deletion', title: 'Bulk credit basket deletion', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review credit-basket deletions.' },
  { id: 'bulk-credit-basket-substitution', title: 'Bulk credit basket substitution', section: 'Processing', kind: 'process', command: 'Processing / Events', description: 'Review credit-basket substitutions.' },
  { id: 'one-stop-processing', title: 'One-Stop Processing (OSP)', section: 'Processing', kind: 'process', command: 'Processing / One-Stop Processing', description: 'Review a demonstration processing queue.' },
  { id: 'processing-scripts', title: 'Processing scripts', section: 'Processing', kind: 'process', command: 'Processing / Processing scripts', description: 'Browse script entries shown in the MX.3 workspace.' },
  { id: 'maturities-configuration', title: 'Maturities configuration', section: 'Risk', kind: 'risk', command: 'Risk / Market Risk Data', description: 'Review sample maturity configuration.' },
  { id: 'variance-covariance-matrix', title: 'Variance covariance matrix', section: 'Risk', kind: 'risk', command: 'Risk / Market Risk Data', description: 'Inspect a sample variance-covariance matrix.' },
  { id: 'scenarios', title: 'Scenarios', section: 'Risk', kind: 'risk', command: 'Risk / Market Risk Data', description: 'Review sample market-risk scenarios.' },
  { id: 'enterprise-market-risk-monitor', title: 'Enterprise Market Risk Monitor', section: 'Risk', kind: 'risk', command: 'Risk / Monitors', description: 'Review portfolio-level risk indicators.' },
  { id: 'var-viewer', title: 'VaR Viewer', section: 'Risk', kind: 'risk', command: 'Risk / Monitors', description: 'Inspect sample value-at-risk outputs.' },
  { id: 'market-risk-batch-reports', title: 'Market Risk Batch of Reports', section: 'Risk', kind: 'risk', command: 'Risk / Risk Engine', description: 'Review a demonstration risk-report batch.' },
  { id: 'market-risk-single-report', title: 'Market Risk Single Report', section: 'Risk', kind: 'risk', command: 'Risk / Risk Engine', description: 'Inspect a sample single risk report.' },
  { id: 'rate-curves-assignment', title: 'Rate curves assignment by currency', section: 'Risk', kind: 'risk', command: 'Risk / Risk Engine', description: 'Review sample curve assignments.' },
  { id: 'market-risk-configuration', title: 'Market Risk Configuration', section: 'Risk', kind: 'risk', command: 'Risk / Source', description: 'Browse risk configuration entries.' },
  { id: 'market-risk-data', title: 'Market Risk Data', section: 'Risk', kind: 'risk', command: 'Risk / Source', description: 'Review the sample market-risk data set.' }
];

const DEMO_TRADES: MurexRecord[] = [
  { reference: 'TRD-2026-0418', version: '2', status: 'Validated', product: 'Bond', instrument: 'FR DEMO 3.10 2031', side: 'Buy', quantity: '2,500,000', currency: 'EUR', counterparty: 'CP-DEMO-01', portfolio: 'GOV_EUR', tradeDate: '28/10/2026', user: 'USR-01' },
  { reference: 'TRD-2026-0417', version: '1', status: 'Pending', product: 'IRS', instrument: 'EUR 5Y Payer', side: 'Pay', quantity: '10,000,000', currency: 'EUR', counterparty: 'CP-DEMO-02', portfolio: 'RATES_EUR', tradeDate: '28/10/2026', user: 'USR-02' },
  { reference: 'TRD-2026-0416', version: '3', status: 'Validated', product: 'Bond', instrument: 'DE DEMO 2.40 2033', side: 'Sell', quantity: '1,200,000', currency: 'EUR', counterparty: 'CP-DEMO-03', portfolio: 'GOV_EUR', tradeDate: '27/10/2026', user: 'USR-01' },
  { reference: 'TRD-2026-0415', version: '1', status: 'Amended', product: 'FX Forward', instrument: 'EUR/USD 1M', side: 'Buy', quantity: '750,000', currency: 'USD', counterparty: 'CP-DEMO-04', portfolio: 'FX_MAJOR', tradeDate: '27/10/2026', user: 'USR-03' }
];

const DEMO_ORDERS: MurexRecord[] = [
  { reference: 'ORD-2026-0182', version: '1', status: 'Open', product: 'Equity', instrument: 'EQ-DEMO-01', side: 'Buy', quantity: '12,000', currency: 'EUR', counterparty: 'CP-DEMO-02', portfolio: 'EQ_EUR', tradeDate: '28/10/2026', user: 'USR-01' },
  { reference: 'ORD-2026-0181', version: '2', status: 'Partially filled', product: 'Bond', instrument: 'FR DEMO 3.10 2031', side: 'Sell', quantity: '500,000', currency: 'EUR', counterparty: 'CP-DEMO-01', portfolio: 'GOV_EUR', tradeDate: '28/10/2026', user: 'USR-02' },
  { reference: 'ORD-2026-0180', version: '1', status: 'Cancelled', product: 'Fund', instrument: 'FUND-DEMO-03', side: 'Buy', quantity: '80,000', currency: 'EUR', counterparty: 'CP-DEMO-03', portfolio: 'FUND_EUR', tradeDate: '27/10/2026', user: 'USR-03' },
  { reference: 'ORD-2026-0179', version: '1', status: 'Executed', product: 'Bond', instrument: 'DE DEMO 2.40 2033', side: 'Buy', quantity: '1,000,000', currency: 'EUR', counterparty: 'CP-DEMO-04', portfolio: 'GOV_EUR', tradeDate: '27/10/2026', user: 'USR-01' }
];

@Component({
  selector: 'app-murex-page',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './murex-page.component.html',
  styleUrls: ['./murex-page.component.scss']
})
export class MurexPageComponent {
  readonly screens = SCREEN_CATALOG;
  readonly quickAccessIds = ['e-tradepad', 'trade-query', 'order-query'];
  readonly productFamilies = ['Bond', 'Equity/ETF Order', 'Fund', 'Credit (IRS)', 'FX Swap'];
  readonly demoTrades = DEMO_TRADES;
  readonly demoOrders = DEMO_ORDERS;
  readonly marketRows: MurexModuleRow[] = [
    { code: 'BOND-EUR-2031', label: 'FR DEMO 3.10 2031', detail: 'Bond · EUR · 15/05/2031', status: 'Available', asOf: '28/10/2026' },
    { code: 'BOND-DE-2033', label: 'DE DEMO 2.40 2033', detail: 'Bond · EUR · 12/04/2033', status: 'Available', asOf: '28/10/2026' },
    { code: 'BOND-IT-2030', label: 'IT DEMO 2.85 2030', detail: 'Bond · EUR · 01/09/2030', status: 'Indicative', asOf: '27/10/2026' },
    { code: 'BOND-US-2032', label: 'US DEMO 3.75 2032', detail: 'Bond · USD · 15/02/2032', status: 'Indicative', asOf: '27/10/2026' }
  ];
  readonly riskRows: MurexModuleRow[] = [
    { code: 'RISK-EUR-01', label: 'EUR Rates', detail: 'Curve sensitivity · EUR', status: 'Calculated', asOf: '28/10/2026' },
    { code: 'RISK-USD-02', label: 'USD Rates', detail: 'Curve sensitivity · USD', status: 'Calculated', asOf: '28/10/2026' },
    { code: 'RISK-SPD-03', label: 'Credit spreads', detail: 'Spread sensitivity · Multi-currency', status: 'Indicative', asOf: '27/10/2026' },
    { code: 'RISK-VAR-04', label: 'Historical VaR', detail: '99% · 1 day · demonstration', status: 'Sample', asOf: '27/10/2026' }
  ];
  readonly processRows: MurexModuleRow[] = [
    { code: 'BATCH-0261', label: 'EOD_BF_EG_REALTIME', detail: 'End-of-day processing', status: 'Completed', asOf: '28/10/2026 18:05' },
    { code: 'BATCH-0260', label: 'BULK_ORDER_CANCEL', detail: 'Order processing', status: 'Ready', asOf: '28/10/2026 17:42' },
    { code: 'BATCH-0259', label: 'DAILY_PL_BM_FEED', detail: 'P&L feed', status: 'Completed', asOf: '28/10/2026 17:15' },
    { code: 'BATCH-0258', label: 'BENCHMARK_VALUATION', detail: 'Benchmark valuation', status: 'Review', asOf: '28/10/2026 16:50' }
  ];

  activeScreenId = 'e-tradepad';
  screenSearch = '';
  referenceFilter = '';
  instrumentFilter = '';
  portfolioFilter = '';
  counterpartyFilter = '';
  statusFilter = 'All';
  productTypeFilter = 'All';
  userFilter = 'All';
  queryExecuted = false;
  moduleSearch = '';
  ticketProduct = 'Bond';
  ticketInstrument = 'FR DEMO 3.10 2031';
  ticketSide: 'Buy' | 'Sell' = 'Buy';
  ticketQuantity = 1_000_000;
  ticketPrice = 99.875;
  ticketCurrency = 'EUR';
  ticketPortfolio = 'GOV_EUR';
  ticketCounterparty = 'CP-DEMO-01';
  ticketStatus = '';
  private draftSequence = 1;
  ticketRows: MurexRecord[] = [
    { reference: 'TRD-2026-0418', version: '2', status: 'Validated', product: 'Bond', instrument: 'FR DEMO 3.10 2031', side: 'Buy', quantity: '2,500,000', currency: 'EUR', counterparty: 'CP-DEMO-01', portfolio: 'GOV_EUR', tradeDate: '28/10/2026', user: 'USR-01' },
    { reference: 'TRD-2026-0416', version: '3', status: 'Validated', product: 'Bond', instrument: 'DE DEMO 2.40 2033', side: 'Sell', quantity: '1,200,000', currency: 'EUR', counterparty: 'CP-DEMO-03', portfolio: 'GOV_EUR', tradeDate: '27/10/2026', user: 'USR-01' }
  ];

  constructor(readonly workGroupService: WorkGroupService) {}

  get activeScreen(): MurexScreen {
    return this.screens.find(screen => screen.id === this.activeScreenId) ?? this.screens[0];
  }

  get visibleSections(): Array<{ name: string; screens: MurexScreen[] }> {
    const query = this.screenSearch.trim().toLocaleLowerCase();
    const visible = this.screens.filter(screen => !query || `${screen.title} ${screen.command}`.toLocaleLowerCase().includes(query));
    return [...new Set(visible.map(screen => screen.section))].map(name => ({
      name,
      screens: visible.filter(screen => screen.section === name)
    }));
  }

  get quickAccessScreens(): MurexScreen[] {
    return this.quickAccessIds.map(id => this.screens.find(screen => screen.id === id)).filter((screen): screen is MurexScreen => !!screen);
  }

  get isOrderQuery(): boolean {
    return this.activeScreenId === 'order-query' || this.activeScreenId === 'free-packages-query';
  }

  get filteredRecords(): MurexRecord[] {
    const records = this.isOrderQuery ? this.demoOrders : this.demoTrades;
    const reference = this.referenceFilter.trim().toLocaleLowerCase();
    const instrument = this.instrumentFilter.trim().toLocaleLowerCase();
    const portfolio = this.portfolioFilter.trim().toLocaleLowerCase();
    const counterparty = this.counterpartyFilter.trim().toLocaleLowerCase();
    return records.filter(record =>
      (!reference || record.reference.toLocaleLowerCase().includes(reference))
      && (!instrument || record.instrument.toLocaleLowerCase().includes(instrument))
      && (!portfolio || record.portfolio.toLocaleLowerCase().includes(portfolio))
      && (!counterparty || record.counterparty.toLocaleLowerCase().includes(counterparty))
      && (this.statusFilter === 'All' || record.status === this.statusFilter)
      && (this.productTypeFilter === 'All' || record.product === this.productTypeFilter)
      && (this.userFilter === 'All' || record.user === this.userFilter)
    );
  }

  get moduleRows(): MurexModuleRow[] {
    let rows = this.marketRows;
    if (this.activeScreen.kind === 'risk') {
      rows = this.riskRows;
    } else if (this.activeScreen.kind === 'process') {
      rows = this.processRows;
    }
    const query = this.moduleSearch.trim().toLocaleLowerCase();
    return rows.filter(row => !query || `${row.code} ${row.label} ${row.detail}`.toLocaleLowerCase().includes(query));
  }

  selectScreen(screen: MurexScreen): void {
    this.activeScreenId = screen.id;
    this.queryExecuted = false;
    this.moduleSearch = '';
    this.ticketStatus = '';
  }

  selectProduct(product: string): void {
    this.ticketProduct = product;
    this.ticketInstrument = product === 'Bond' ? 'FR DEMO 3.10 2031' : `${product.toUpperCase()}-DEMO-01`;
    this.ticketCurrency = product === 'FX Swap' ? 'USD' : 'EUR';
  }

  runQuery(): void {
    this.queryExecuted = true;
  }

  clearQuery(): void {
    this.referenceFilter = '';
    this.instrumentFilter = '';
    this.portfolioFilter = '';
    this.counterpartyFilter = '';
    this.statusFilter = 'All';
    this.productTypeFilter = 'All';
    this.userFilter = 'All';
    this.queryExecuted = false;
  }

  submitTicket(): void {
    if (!this.ticketInstrument.trim() || !Number.isFinite(this.ticketQuantity) || this.ticketQuantity <= 0 || !Number.isFinite(this.ticketPrice) || this.ticketPrice <= 0) {
      this.ticketStatus = 'Enter a valid instrument, quantity and price.';
      return;
    }
    const reference = `DRAFT-${String(this.draftSequence++).padStart(4, '0')}`;
    const draft: MurexRecord = {
      reference,
      version: '1',
      status: 'Draft',
      product: this.ticketProduct,
      instrument: this.ticketInstrument,
      side: this.ticketSide,
      quantity: this.ticketQuantity.toLocaleString('en-US'),
      currency: this.ticketCurrency,
      counterparty: this.ticketCounterparty,
      portfolio: this.ticketPortfolio,
      tradeDate: new Intl.DateTimeFormat('en-GB').format(new Date()),
      user: 'USR-DEMO'
    };
    this.ticketRows = [draft, ...this.ticketRows];
    this.ticketStatus = `${reference} added to the local demonstration blotter.`;
  }

  clearTicket(): void {
    this.ticketProduct = 'Bond';
    this.ticketInstrument = 'FR DEMO 3.10 2031';
    this.ticketSide = 'Buy';
    this.ticketQuantity = 1_000_000;
    this.ticketPrice = 99.875;
    this.ticketCurrency = 'EUR';
    this.ticketPortfolio = 'GOV_EUR';
    this.ticketCounterparty = 'CP-DEMO-01';
    this.ticketStatus = '';
  }
}