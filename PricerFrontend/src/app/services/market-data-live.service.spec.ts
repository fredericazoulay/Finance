import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketDataLiveService } from './market-data-live.service';

describe('market data snapshot status', () => {
  afterEach(() => vi.useRealTimers());

  it('marks fallback values as indicative and undated when the source is unavailable', () => {
    const http = {
      get: vi.fn().mockReturnValue(throwError(() => new Error('unavailable')))
    } as unknown as HttpClient;
    const service = new MarketDataLiveService(http);
    const snapshot = service.currentSnapshot;

    expect(snapshot.dataStatus).toBe('indicative');
    expect(snapshot.isLive).toBe(false);
    expect(snapshot.usCurve.source).toBe('Données indicatives');
    expect(snapshot.usCurve.asOf).toBe('');
    expect(snapshot.macroIndicators.every(indicator => indicator.source === 'Données indicatives')).toBe(true);
    expect(snapshot.quotes.every(quote => quote.source === 'Données indicatives' && quote.asOf === '')).toBe(true);
  });

  it('keeps the snapshot partial when only the US 10-year observation is parsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T12:00:00.000Z'));
    const http = {
      get: vi.fn((url: string) => url.includes('id=DGS10')
        ? of('observation_date,DGS10\n2026-11-11,4.23')
        : throwError(() => new Error('series unavailable')))
    } as unknown as HttpClient;
    const service = new MarketDataLiveService(http);
    const snapshot = service.currentSnapshot;

    expect(snapshot.dataStatus).toBe('partial');
    expect(snapshot.isLive).toBe(false);
    expect(snapshot.usCurve.nodes.find(node => node.tenor === '10Y')?.ratePercent).toBe(4.23);
    expect(snapshot.usCurve.nodes.find(node => node.tenor === '2Y')?.ratePercent).toBe(4.12);
    expect(snapshot.usCurve.spread2s10sBps).toBeNull();
    expect(snapshot.usCurve.spread10s30sBps).toBeNull();
    expect(snapshot.macroIndicators.find(indicator => indicator.id === 'US10Y')).toMatchObject({
      source: 'FRED',
      asOf: '2026-11-11',
      value: 4.23,
      dataStatus: 'live',
      ageDays: 1
    });
    expect(snapshot.usCurve.nodes.find(node => node.tenor === '10Y')).toMatchObject({
      source: 'FRED DGS10',
      dataStatus: 'live',
      ageDays: 1
    });
    expect(snapshot.macroIndicators.find(indicator => indicator.id === 'SOFR')?.source).toBe('Données indicatives');
    expect(snapshot.euCurve.source).toBe('Données indicatives');
    expect(snapshot.quotes.every(quote => quote.source === 'Données indicatives')).toBe(true);
  });

  it('updates key US maturities and calculates slopes only from parsed FRED values', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T12:00:00.000Z'));
    const observations: Record<string, string> = {
      DGS2: 'observation_date,DGS2\n2026-11-11,4.10',
      DGS5: 'observation_date,DGS5\n2026-11-11,4.17',
      DGS10: 'observation_date,DGS10\n2026-11-11,4.23',
      DGS30: 'observation_date,DGS30\n2026-11-11,4.50'
    };
    const http = {
      get: vi.fn((url: string) => {
        const seriesId = Object.keys(observations).find(id => url.includes(`id=${id}`));
        return seriesId ? of(observations[seriesId]) : throwError(() => new Error('series unavailable'));
      })
    } as unknown as HttpClient;
    const service = new MarketDataLiveService(http);
    const snapshot = service.currentSnapshot;

    expect(snapshot.dataStatus).toBe('partial');
    expect(snapshot.usCurve.nodes.filter(node => node.dataStatus === 'live').map(node => node.tenor))
      .toEqual(['2Y', '5Y', '10Y', '30Y']);
    expect(snapshot.usCurve.spread2s10sBps).toBe(13);
    expect(snapshot.usCurve.spread10s30sBps).toBe(27);
    expect(snapshot.usCurve.nodes.find(node => node.tenor === '3M')?.dataStatus).toBe('indicative');
  });

  it('marks a FRED observation stale after five calendar days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T12:00:00.000Z'));
    const http = {
      get: vi.fn((url: string) => url.includes('id=DGS10')
        ? of('observation_date,DGS10\n2026-11-01,4.23')
        : throwError(() => new Error('series unavailable')))
    } as unknown as HttpClient;
    const service = new MarketDataLiveService(http);
    const snapshot = service.currentSnapshot;

    expect(snapshot.dataStatus).toBe('stale');
    expect(snapshot.usCurve.dataStatus).toBe('stale');
    expect(snapshot.usCurve.nodes.find(node => node.tenor === '10Y')).toMatchObject({
      dataStatus: 'stale',
      ageDays: 11
    });
    expect(snapshot.usCurve.nodes.find(node => node.tenor === '2Y')?.dataStatus).toBe('indicative');
  });
});