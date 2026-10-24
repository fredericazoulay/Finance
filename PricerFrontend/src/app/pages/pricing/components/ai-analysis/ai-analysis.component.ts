import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AiAssistantService } from '../../../../services/ai-assistant.service';

@Component({
  selector: 'app-ai-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-analysis.component.html',
  styleUrls: ['./ai-analysis.component.scss']
})
export class AiAnalysisComponent {
  @Input() context = '';

  question = 'Détermination du pricing d\'une obligation à partir d\'un panel d\'obligations comparables et de l’obligation ayant le meilleur taux de rendement du panel.';
  answer = '';
  error = '';
  isAsking = false;

  constructor(private readonly aiAssistantService: AiAssistantService) {}

  ask(): void {
    const question = this.question.trim();
    if (!question || this.isAsking) return;

    this.isAsking = true;
    this.answer = '';
    this.error = '';
    this.aiAssistantService.ask(question, this.context).pipe(
      finalize(() => this.isAsking = false)
    ).subscribe({
      next: response => this.answer = response.answer,
      error: error => {
        if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') {
          this.error = error.error.message;
        } else if (error instanceof HttpErrorResponse && error.status === 0) {
          this.error = 'Le serveur de pricing est indisponible.';
        } else {
          this.error = 'La demande IA a échoué. Réessayez dans un instant.';
        }
      }
    });
  }
}