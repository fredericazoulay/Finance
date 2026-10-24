import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';

export interface AiAnswerResponse {
  answer: string;
}

@Injectable({ providedIn: 'root' })
export class AiAssistantService {
  constructor(private readonly http: HttpClient) {}

  ask(question: string, context: string): Observable<AiAnswerResponse> {
    return this.http.post<AiAnswerResponse>('/api/v1/ai/ask', { question, context })
      .pipe(timeout(50000));
  }
}