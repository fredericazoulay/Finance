import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, take, timeout } from 'rxjs';
import {
  BondComparable,
  BondComparablesRequest,
  BondComparablesResponse,
  BondDirectPricingRequest,
  BondDirectPricingResponse
} from '../models/bond-comparables.model';

@Injectable({ providedIn: 'root' })
export class BondComparablesService {
  constructor(private readonly http: HttpClient) {}

  searchPanel(target: BondComparablesRequest['target'], maturityToleranceMonths: number): Observable<BondComparable[]> {
    return this.http.post<BondComparable[]>('/api/v1/calculators/bonds/comparables/search', {
      target,
      maturityToleranceMonths
    }).pipe(timeout(30000));
  }

  price(request: BondComparablesRequest): Observable<BondComparablesResponse> {
    return this.http.post<BondComparablesResponse>('/api/v1/calculators/bonds/comparables/pricing', request)
      .pipe(timeout(15000));
  }

  priceDirectly(request: BondDirectPricingRequest): Observable<BondDirectPricingResponse> {
    return this.http.post<BondDirectPricingResponse>('/api/v1/calculators/bonds/pricing/direct', request)
      .pipe(timeout(15000), take(1));
  }
}