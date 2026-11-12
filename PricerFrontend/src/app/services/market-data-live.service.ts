import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, forkJoin, map, of, tap } from 'rxjs';
import { updateLiveBenchmarkYields } from './bond-analytics-calc';

export type MarketDataFreshness = 'live' | 'stale' | 'indicative' | 'imported';
type SnapshotDataStatus = 'live' | 'partial' | 'stale' | 'indicative';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const FRED_STALE_AFTER_DAYS = 5;
const FRED_CURVE_SERIES = [
  { seriesId: 'DGS2', tenor: '2Y' },
  { seriesId: 'DGS5', tenor: '5Y' },
  { seriesId: 'DGS10', tenor: '10Y' },
  { seriesId: 'DGS30', tenor: '30Y' }
] as const;

interface FredObservation {
  seriesId: typeof FRED_CURVE_SERIES[number]['seriesId'];
  asOf: string;
  ratePercent: number;
  dataStatus: 'live' | 'stale';
  ageDays: number;
}

export interface YieldCurveNode {
  tenor: string;
  years: number;
  ratePercent: number;
  source: string;
  asOf: string;
  dataStatus: MarketDataFreshness;
  ageDays?: number;
}

export interface SovereignYieldCurve {
  currency: string;
  country: string;
  name: string;
  source: string;
  asOf: string;
  dataStatus: MarketDataFreshness | 'partial';
  ageDays?: number;
  nodes: YieldCurveNode[];
  spread2s10sBps: number | null;
  spread10s30sBps: number | null;
}

export interface MacroIndicator {
  id: string;
  name: string;
  category: 'RATES' | 'SPREADS' | 'INFLATION' | 'MONEY_MARKET';
  value: number;
  unit: string;
  change1D: number;
  asOf: string;
  source: 'FRED' | 'ECB' | 'Yahoo Finance' | 'Données indicatives';
  dataStatus: MarketDataFreshness;
  ageDays?: number;
  description: string;
}

export interface BondMarketQuote {
  symbol: string;
  name: string;
  assetClass: 'Sovereign' | 'Corp IG' | 'High Yield' | 'Aggregated';
  price: number;
  changePercent: number;
  yieldPercent: number;
  currency: string;
  source: string;
  asOf: string;
  dataStatus: MarketDataFreshness;
  ageDays?: number;
}

export interface LiveMarketSnapshot {
  usCurve: SovereignYieldCurve;
  euCurve: SovereignYieldCurve;
  macroIndicators: MacroIndicator[];
  quotes: BondMarketQuote[];
  lastUpdated: Date;
  dataStatus: SnapshotDataStatus;
  isLive: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class MarketDataLiveService {
  private readonly snapshotSubject = new BehaviorSubject<LiveMarketSnapshot>(this.getDefaultMarketSnapshot());
  readonly snapshot$ = this.snapshotSubject.asObservable();

  private readonly isSyncingSubject = new BehaviorSubject<boolean>(false);
  readonly isSyncing$ = this.isSyncingSubject.asObservable();

  constructor(private readonly http: HttpClient) {
    // Initial sync
    this.refreshLiveMarketData().subscribe();
  }

  get currentSnapshot(): LiveMarketSnapshot {
    return this.snapshotSubject.value;
  }

  /** Refreshes the market data that is currently parsed and validated. */
  refreshLiveMarketData(): Observable<LiveMarketSnapshot> {
    this.isSyncingSubject.next(true);

    const fred$ = this.fetchFredData().pipe(catchError(() => of(null)));

    return fred$.pipe(
      map(fred => {
        const fallback = this.getDefaultMarketSnapshot();

        const usCurve = fred?.usCurve ?? fallback.usCurve;
        const euCurve = fallback.euCurve;
        const macroIndicators = fred?.indicators ?? fallback.macroIndicators;
        const quotes = fallback.quotes;

        const dataStatus = fred?.dataStatus ?? 'indicative';

        const snapshot: LiveMarketSnapshot = {
          usCurve,
          euCurve,
          macroIndicators,
          quotes,
          lastUpdated: new Date(),
          dataStatus,
          isLive: false
        };

        // Update the global benchmark reference yields in the bond calculation engine
        updateLiveBenchmarkYields({
          us10Y: usCurve.nodes.find(n => n.tenor === '10Y')?.ratePercent ?? 4.25,
          us2Y: usCurve.nodes.find(n => n.tenor === '2Y')?.ratePercent ?? 4.10,
          us5Y: usCurve.nodes.find(n => n.tenor === '5Y')?.ratePercent ?? 4.05,
          us30Y: usCurve.nodes.find(n => n.tenor === '30Y')?.ratePercent ?? 4.45,
          eur10Y: euCurve.nodes.find(n => n.tenor === '10Y')?.ratePercent ?? 2.38,
          eur2Y: euCurve.nodes.find(n => n.tenor === '2Y')?.ratePercent ?? 2.25,
          eur5Y: euCurve.nodes.find(n => n.tenor === '5Y')?.ratePercent ?? 2.28,
          eur30Y: euCurve.nodes.find(n => n.tenor === '30Y')?.ratePercent ?? 2.65
        });

        this.snapshotSubject.next(snapshot);
        this.isSyncingSubject.next(false);
        return snapshot;
      }),
      tap({
        error: () => this.isSyncingSubject.next(false)
      })
    );
  }

  /**
   * Fetches Treasury Yield Curve and Macro spreads from Federal Reserve Economic Data (FRED).
   */
  private fetchFredData(): Observable<{
    usCurve: SovereignYieldCurve;
    indicators: MacroIndicator[];
    dataStatus: 'partial' | 'stale';
  } | null> {
    const seriesRequests = FRED_CURVE_SERIES.map(({ seriesId }) =>
      this.fetchFredSeries(seriesId).pipe(catchError(() => of(null)))
    );

    return forkJoin(seriesRequests).pipe(
      map(observations => {
        const availableObservations = observations.filter((item): item is FredObservation => item !== null);
        if (!availableObservations.length) return null;

        const defaultSnap = this.getDefaultMarketSnapshot();
        const observationsByTenor = new Map<string, FredObservation>(availableObservations.map(item => [
          FRED_CURVE_SERIES.find(series => series.seriesId === item.seriesId)!.tenor,
          item
        ]));
        const adjustedNodes = defaultSnap.usCurve.nodes.map(node => {
          const observation = observationsByTenor.get(node.tenor);
          if (!observation) return node;
          return {
            ...node,
            ratePercent: observation.ratePercent,
            source: `FRED ${observation.seriesId}`,
            asOf: observation.asOf,
            dataStatus: observation.dataStatus,
            ageDays: observation.ageDays
          };
        });

        const node2Y = adjustedNodes.find(node => node.tenor === '2Y');
        const node10Y = adjustedNodes.find(node => node.tenor === '10Y');
        const node30Y = adjustedNodes.find(node => node.tenor === '30Y');
        const spread2s10sBps = node2Y && node10Y && node2Y.dataStatus !== 'indicative' && node10Y.dataStatus !== 'indicative'
          ? Math.round((node10Y.ratePercent - node2Y.ratePercent) * 100)
          : null;
        const spread10s30sBps = node10Y && node30Y && node10Y.dataStatus !== 'indicative' && node30Y.dataStatus !== 'indicative'
          ? Math.round((node30Y.ratePercent - node10Y.ratePercent) * 100)
          : null;
        const observation10Y = observationsByTenor.get('10Y');
        const curveDataStatus: SovereignYieldCurve['dataStatus'] = availableObservations.some(item => item.dataStatus === 'stale')
          ? 'stale'
          : 'partial';

        const indicators: MacroIndicator[] = defaultSnap.macroIndicators.map(indicator => indicator.id === 'US10Y'
          && observation10Y
          ? { ...indicator, value: observation10Y.ratePercent, asOf: observation10Y.asOf, source: 'FRED', dataStatus: observation10Y.dataStatus, ageDays: observation10Y.ageDays }
          : indicator);
        const snapshotDataStatus: 'partial' | 'stale' = curveDataStatus === 'stale' ? 'stale' : 'partial';

        return {
          usCurve: {
            ...defaultSnap.usCurve,
            source: 'FRED DGS + maturités indicatives',
            asOf: observation10Y?.asOf ?? '',
            dataStatus: curveDataStatus,
            ageDays: observation10Y?.ageDays,
            nodes: adjustedNodes,
            spread2s10sBps,
            spread10s30sBps
          },
          indicators,
          dataStatus: snapshotDataStatus
        };
      })
    );
  }

  private fetchFredSeries(seriesId: FredObservation['seriesId']): Observable<FredObservation | null> {
    return this.http.get(`/external/fred/graph/fredgraph.csv?id=${seriesId}`, { responseType: 'text' }).pipe(
      map(csv => {
        const lines = csv.trim().split('\n');
        const [rawDate, valueText] = (lines.at(-1) ?? '').split(',');
        const asOf = rawDate?.trim() ?? '';
        const ratePercent = Number(valueText);
        const freshness = this.getObservationFreshness(asOf);
        if (!Number.isFinite(ratePercent) || ratePercent <= 0 || !freshness) return null;
        return { seriesId, asOf, ratePercent, ...freshness };
      })
    );
  }

  private getObservationFreshness(asOf: string): { dataStatus: 'live' | 'stale'; ageDays: number } | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;

    const observationDate = new Date(`${asOf}T00:00:00.000Z`);
    if (Number.isNaN(observationDate.getTime()) || observationDate.toISOString().slice(0, 10) !== asOf) return null;

    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const ageDays = Math.floor((todayUtc - observationDate.getTime()) / DAY_IN_MILLISECONDS);
    if (ageDays < 0) return null;

    return {
      dataStatus: ageDays > FRED_STALE_AFTER_DAYS ? 'stale' : 'live',
      ageDays
    };
  }

  private createIndicativeNodes(
    nodes: Omit<YieldCurveNode, 'source' | 'asOf' | 'dataStatus' | 'ageDays'>[]
  ): YieldCurveNode[] {
    return nodes.map(node => ({
      ...node,
      source: 'Données indicatives',
      asOf: '',
      dataStatus: 'indicative'
    }));
  }

  private markIndicative<T extends { source: string; asOf: string }>(
    observations: T[]
  ): Array<T & { dataStatus: 'indicative' }> {
    return observations.map(observation => ({ ...observation, dataStatus: 'indicative' }));
  }

  /**
  * Indicative baseline values used when no corresponding market observation is parsed.
   */
  private getDefaultMarketSnapshot(): LiveMarketSnapshot {
    const usNodes = this.createIndicativeNodes([
      { tenor: '1M', years: 0.083, ratePercent: 4.82 },
      { tenor: '3M', years: 0.25, ratePercent: 4.75 },
      { tenor: '6M', years: 0.5, ratePercent: 4.58 },
      { tenor: '1Y', years: 1.0, ratePercent: 4.32 },
      { tenor: '2Y', years: 2.0, ratePercent: 4.12 },
      { tenor: '3Y', years: 3.0, ratePercent: 4.08 },
      { tenor: '5Y', years: 5.0, ratePercent: 4.06 },
      { tenor: '7Y', years: 7.0, ratePercent: 4.15 },
      { tenor: '10Y', years: 10.0, ratePercent: 4.28 },
      { tenor: '20Y', years: 20.0, ratePercent: 4.54 },
      { tenor: '30Y', years: 30.0, ratePercent: 4.48 }
    ]);

    const euNodes = this.createIndicativeNodes([
      { tenor: '3M', years: 0.25, ratePercent: 3.20 },
      { tenor: '6M', years: 0.5, ratePercent: 3.02 },
      { tenor: '1Y', years: 1.0, ratePercent: 2.74 },
      { tenor: '2Y', years: 2.0, ratePercent: 2.24 },
      { tenor: '3Y', years: 3.0, ratePercent: 2.22 },
      { tenor: '5Y', years: 5.0, ratePercent: 2.26 },
      { tenor: '7Y', years: 7.0, ratePercent: 2.30 },
      { tenor: '10Y', years: 10.0, ratePercent: 2.38 },
      { tenor: '20Y', years: 20.0, ratePercent: 2.62 },
      { tenor: '30Y', years: 30.0, ratePercent: 2.68 }
    ]);

    const us2Y = usNodes.find(n => n.tenor === '2Y')!.ratePercent;
    const us10Y = usNodes.find(n => n.tenor === '10Y')!.ratePercent;
    const us30Y = usNodes.find(n => n.tenor === '30Y')!.ratePercent;

    const eu2Y = euNodes.find(n => n.tenor === '2Y')!.ratePercent;
    const eu10Y = euNodes.find(n => n.tenor === '10Y')!.ratePercent;
    const eu30Y = euNodes.find(n => n.tenor === '30Y')!.ratePercent;

    const usCurve: SovereignYieldCurve = {
      currency: 'USD',
      country: 'États-Unis',
      name: 'US Treasury Benchmark Yield Curve',
      source: 'Données indicatives',
      asOf: '',
      dataStatus: 'indicative',
      nodes: usNodes,
      spread2s10sBps: Math.round((us10Y - us2Y) * 100),
      spread10s30sBps: Math.round((us30Y - us10Y) * 100)
    };

    const euCurve: SovereignYieldCurve = {
      currency: 'EUR',
      country: 'Zone Euro (AAA / Bund)',
      name: 'Euro Area AAA Benchmark Curve',
      source: 'Données indicatives',
      asOf: '',
      dataStatus: 'indicative',
      nodes: euNodes,
      spread2s10sBps: Math.round((eu10Y - eu2Y) * 100),
      spread10s30sBps: Math.round((eu30Y - eu10Y) * 100)
    };

    const macroIndicators: MacroIndicator[] = this.markIndicative<Omit<MacroIndicator, 'dataStatus' | 'ageDays'>>([
      {
        id: 'US10Y',
        name: 'US 10-Year Treasury',
        category: 'RATES',
        value: us10Y,
        unit: '%',
        change1D: -0.03,
        asOf: '',
        source: 'Données indicatives',
        description: 'Taux de référence souverain américain à 10 ans (série FRED DGS10)'
      },
      {
        id: 'BUND10Y',
        name: 'Euro Bund 10-Year',
        category: 'RATES',
        value: eu10Y,
        unit: '%',
        change1D: -0.02,
        asOf: '',
        source: 'Données indicatives',
        description: 'Emprunt d’État fédéral allemand à 10 ans, taux sans risque de la zone euro'
      },
      {
        id: 'OAT10Y',
        name: 'OAT France 10-Year',
        category: 'RATES',
        value: 3.16,
        unit: '%',
        change1D: +0.01,
        asOf: '',
        source: 'Données indicatives',
        description: 'Obligation Assimilable du Trésor français à 10 ans (Spread OAT-Bund : +78 bp)'
      },
      {
        id: 'US_HY_OAS',
        name: 'US High Yield OAS',
        category: 'SPREADS',
        value: 318,
        unit: 'bp',
        change1D: -4,
        asOf: '',
        source: 'Données indicatives',
        description: 'Prime de risque Option-Adjusted Spread ICE BofA High Yield (BAMLH0A0HYM2)'
      },
      {
        id: 'US_IG_OAS',
        name: 'US Corporate IG OAS',
        category: 'SPREADS',
        value: 98,
        unit: 'bp',
        change1D: -1,
        asOf: '',
        source: 'Données indicatives',
        description: 'Prime de risque des obligations d’entreprises Investment Grade (BAMLC0A0CM)'
      },
      {
        id: 'SOFR',
        name: 'SOFR Rate',
        category: 'MONEY_MARKET',
        value: 4.82,
        unit: '%',
        change1D: 0.00,
        asOf: '',
        source: 'Données indicatives',
        description: 'Secured Overnight Financing Rate (taux garanti à 1 jour du marché monétaire US)'
      },
      {
        id: 'ESTR',
        name: '€STR (Euro Short-Term Rate)',
        category: 'MONEY_MARKET',
        value: 3.66,
        unit: '%',
        change1D: 0.00,
        asOf: '',
        source: 'Données indicatives',
        description: 'Taux au jour le jour sans risque de la zone euro publié par la BCE'
      },
      {
        id: 'US_BREAKEVEN_10Y',
        name: '10-Year Breakeven Inflation',
        category: 'INFLATION',
        value: 2.34,
        unit: '%',
        change1D: +0.02,
        asOf: '',
        source: 'Données indicatives',
        description: 'Anticipation d’inflation à 10 ans déduite des TIPS et obligations nominales (T10YIE)'
      }
    ]);

    const quotes: BondMarketQuote[] = this.markIndicative<Omit<BondMarketQuote, 'dataStatus' | 'ageDays'>>([
      {
        symbol: '^TNX',
        name: 'CBOE 10-Yr Treasury Note Yield',
        assetClass: 'Sovereign',
        price: 42.80,
        changePercent: -0.65,
        yieldPercent: 4.28,
        currency: 'USD',
        source: 'Données indicatives',
        asOf: ''
      },
      {
        symbol: '^TYX',
        name: 'CBOE 30-Yr Treasury Bond Yield',
        assetClass: 'Sovereign',
        price: 44.80,
        changePercent: -0.32,
        yieldPercent: 4.48,
        currency: 'USD',
        source: 'Données indicatives',
        asOf: ''
      },
      {
        symbol: 'BND',
        name: 'Vanguard Total Bond Market ETF',
        assetClass: 'Aggregated',
        price: 73.40,
        changePercent: +0.28,
        yieldPercent: 4.35,
        currency: 'USD',
        source: 'Données indicatives',
        asOf: ''
      },
      {
        symbol: 'TLT',
        name: 'iShares 20+ Year Treasury Bond ETF',
        assetClass: 'Sovereign',
        price: 93.65,
        changePercent: +0.55,
        yieldPercent: 4.52,
        currency: 'USD',
        source: 'Données indicatives',
        asOf: ''
      },
      {
        symbol: 'LQD',
        name: 'iShares iBoxx $ Inv Grade Corporate',
        assetClass: 'Corp IG',
        price: 109.80,
        changePercent: +0.35,
        yieldPercent: 5.15,
        currency: 'USD',
        source: 'Données indicatives',
        asOf: ''
      },
      {
        symbol: 'HYG',
        name: 'iShares iBoxx $ High Yield Corporate',
        assetClass: 'High Yield',
        price: 78.90,
        changePercent: +0.18,
        yieldPercent: 7.20,
        currency: 'USD',
        source: 'Données indicatives',
        asOf: ''
      },
      {
        symbol: 'IEAC.AS',
        name: 'iShares Core € Corp Bond UCITS ETF',
        assetClass: 'Corp IG',
        price: 124.50,
        changePercent: +0.12,
        yieldPercent: 3.65,
        currency: 'EUR',
        source: 'Données indicatives',
        asOf: ''
      }
    ]);

    return {
      usCurve,
      euCurve,
      macroIndicators,
      quotes,
      lastUpdated: new Date(),
      dataStatus: 'indicative',
      isLive: false
    };
  }
}
