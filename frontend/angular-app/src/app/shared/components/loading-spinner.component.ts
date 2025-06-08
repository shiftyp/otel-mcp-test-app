import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="spinner-container" [class.inline]="inline">
      <div class="spinner" [class.spinner-sm]="size === 'small'" [class.spinner-lg]="size === 'large'"></div>
      @if (message) {
        <p class="spinner-message">{{ message }}</p>
      }
    </div>
  `,
  styles: [`
    .spinner-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    
    .spinner-container.inline {
      display: inline-flex;
      padding: 0;
      margin: 0 0.5rem;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #007bff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    .spinner-sm {
      width: 20px;
      height: 20px;
      border-width: 2px;
    }
    
    .spinner-lg {
      width: 60px;
      height: 60px;
      border-width: 6px;
    }
    
    .spinner-message {
      margin-top: 1rem;
      color: #666;
      font-size: 0.9rem;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `]
})
export class LoadingSpinnerComponent {
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() message = '';
  @Input() inline = false;
}