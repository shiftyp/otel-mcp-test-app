import { Component, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-account-delete-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="danger-zone">
      <h2>Danger Zone</h2>
      <p>Once you delete your account, there is no going back. Please be certain.</p>
      
      @if (!showDeleteConfirm()) {
        <button class="btn btn-danger" (click)="showDeleteConfirmation()">Delete Account</button>
      } @else {
        <div class="delete-confirmation">
          <p><strong>Are you sure you want to delete your account?</strong></p>
          <p>Type "DELETE" to confirm:</p>
          <input 
            type="text" 
            [(ngModel)]="deleteConfirmText" 
            placeholder="Type DELETE to confirm"
            class="form-control"
          >
          <div class="form-actions">
            <button 
              class="btn btn-danger" 
              (click)="confirmDelete()" 
              [disabled]="deleteConfirmText !== 'DELETE' || isDeleting"
            >
              {{ isDeleting ? 'Deleting...' : 'Yes, Delete My Account' }}
            </button>
            <button class="btn btn-secondary" (click)="cancelDelete()" [disabled]="isDeleting">
              Cancel
            </button>
          </div>
        </div>
      }
      
      @if (error) {
        <div class="alert alert-danger">{{ error }}</div>
      }
    </div>
  `,
  styles: [`
    .danger-zone {
      border: 2px solid #dc3545;
      background: #fff5f5;
      border-radius: 8px;
      padding: 2rem;
      margin-bottom: 2rem;
    }
    
    .delete-confirmation {
      margin-top: 1rem;
    }
    
    .delete-confirmation input {
      margin: 0.5rem 0;
    }
    
    .form-control {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 1rem;
    }
    
    .form-actions {
      margin-top: 1rem;
      display: flex;
      gap: 0.5rem;
    }
    
    .btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      transition: background-color 0.2s;
    }
    
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .btn-danger {
      background: #dc3545;
      color: white;
    }
    
    .btn-danger:hover:not(:disabled) {
      background: #c82333;
    }
    
    .btn-secondary {
      background: #6c757d;
      color: white;
    }
    
    .btn-secondary:hover:not(:disabled) {
      background: #545b62;
    }
    
    .alert {
      padding: 0.75rem 1rem;
      margin-top: 1rem;
      border-radius: 4px;
    }
    
    .alert-danger {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
  `]
})
export class AccountDeleteSectionComponent {
  @Output() delete = new EventEmitter<void>();
  
  showDeleteConfirm = signal(false);
  deleteConfirmText = '';
  isDeleting = false;
  error: string | null = null;

  showDeleteConfirmation() {
    this.showDeleteConfirm.set(true);
    this.error = null;
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
    this.deleteConfirmText = '';
  }

  confirmDelete() {
    if (this.deleteConfirmText === 'DELETE') {
      this.delete.emit();
    }
  }

  setDeleting(value: boolean) {
    this.isDeleting = value;
  }

  setError(error: string | null) {
    this.error = error;
  }
}