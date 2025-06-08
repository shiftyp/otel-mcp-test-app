import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { User } from '../../../services/auth.service';

@Component({
  selector: 'app-profile-edit-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <form (ngSubmit)="onSubmit()" class="edit-form">
      <div class="form-group">
        <label for="email">Email:</label>
        <input 
          type="email" 
          id="email" 
          [(ngModel)]="editForm.email" 
          name="email"
          class="form-control"
          required
        >
      </div>
      
      <div class="form-group">
        <label for="firstName">First Name:</label>
        <input 
          type="text" 
          id="firstName" 
          [(ngModel)]="editForm.firstName" 
          name="firstName"
          class="form-control"
        >
      </div>
      
      <div class="form-group">
        <label for="lastName">Last Name:</label>
        <input 
          type="text" 
          id="lastName" 
          [(ngModel)]="editForm.lastName" 
          name="lastName"
          class="form-control"
        >
      </div>
      
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" [disabled]="isUpdating">
          {{ isUpdating ? 'Updating...' : 'Save Changes' }}
        </button>
        <button type="button" class="btn btn-secondary" (click)="onCancel()" [disabled]="isUpdating">
          Cancel
        </button>
      </div>
    </form>
  `,
  styles: [`
    .form-group {
      margin-bottom: 1rem;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 0.25rem;
      font-weight: bold;
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
    
    .btn-primary {
      background: #007bff;
      color: white;
    }
    
    .btn-primary:hover:not(:disabled) {
      background: #0056b3;
    }
    
    .btn-secondary {
      background: #6c757d;
      color: white;
    }
    
    .btn-secondary:hover:not(:disabled) {
      background: #545b62;
    }
  `]
})
export class ProfileEditFormComponent implements OnInit {
  @Input({ required: true }) user!: User;
  @Input() isUpdating = false;
  @Output() save = new EventEmitter<Partial<User>>();
  @Output() cancel = new EventEmitter<void>();

  editForm = {
    email: '',
    firstName: '',
    lastName: ''
  };

  ngOnInit() {
    this.editForm = {
      email: this.user.email,
      firstName: this.user.firstName || '',
      lastName: this.user.lastName || ''
    };
  }

  onSubmit() {
    this.save.emit(this.editForm);
  }

  onCancel() {
    this.cancel.emit();
  }
}