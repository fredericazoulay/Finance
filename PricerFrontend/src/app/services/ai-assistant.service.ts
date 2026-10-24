import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';

export interface AiAnswerResponse {
  answer: string;
}

export interface BondTargetExtractionResponse {
  securityId: string | null;
  name: string | null;
  currency: string | null;
  faceValue: number | null;
  couponRate: number | null;
  couponFrequency: number | null;
  issueDate: string | null;
  maturityDate: string | null;
  settlementDate: string | null;
  dayCount: string | null;
  missingFields: string[];
  ambiguities: string[];
}

@Injectable({ providedIn: 'root' })
export class AiAssistantService {
  constructor(private readonly http: HttpClient) {}

  ask(question: string, context: string): Observable<AiAnswerResponse> {
    return this.http.post<AiAnswerResponse>('/api/v1/ai/ask', { question, context })
      .pipe(timeout(50000));
  }

  extractBondTarget(description: string): Observable<BondTargetExtractionResponse> {
    return this.http.post<BondTargetExtractionResponse>('/api/v1/ai/extract-bond-target', { description })
      .pipe(timeout(50000));
  }
}