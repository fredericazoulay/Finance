import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { SecuritySearchResponse, YahooSecurity } from '../models/security.model';

@Injectable({
  providedIn: 'root'
})
export class SecuritiesService {
  constructor(private readonly http: HttpClient) {}

  search(query: string): Observable<YahooSecurity[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return new Observable<YahooSecurity[]>(observer => {
        observer.next([]);
        observer.complete();
      });
    }

    const params = new HttpParams().set('q', trimmed);
    return this.http.get<SecuritySearchResponse>('/api/securities/search', { params }).pipe(
      map(response => response.quotes || [])
    );
  }
}
