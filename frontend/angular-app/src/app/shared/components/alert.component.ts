import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type AlertType = 'success' | 'danger' | 'warning' | 'info';

@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (message) {
      <div class="alert alert-{{ type }}" [class.alert-dismissible]="dismissible">
        <ng-content></ng-content>
        {{ message }}
        @if (dismissible) {
          <button type="button" class="close" (click)="message = null">×</button>
        }
      </div>
    }
  `,
  styles: [`
    .alert {
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
      border-radius: 4px;
      position: relative;
    }
    
    .alert-dismissible {
      padding-right: 2.5rem;
    }
    
    .alert-success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    
    .alert-danger {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    
    .alert-warning {
      background: #fff3cd;
      color: #856404;
      border: 1px solid #ffeeba;
    }
    
    .alert-info {
      background: #d1ecf1;
      color: #0c5460;
      border: 1px solid #bee5eb;
    }
    
    .close {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: none;
      border: none;
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
      opacity: 0.5;
    }
    
    .close:hover {
      opacity: 0.75;
    }
  `]
})
export class AlertComponent {
  @Input() type: AlertType = 'info';
  @Input() message: string | null = null;
  @Input() dismissible = false;
}