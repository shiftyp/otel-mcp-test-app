import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../../../services/auth.service';

@Component({
  selector: 'app-profile-display',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="info-display">
      <p><strong>Username:</strong> {{ user.username }}</p>
      <p><strong>Email:</strong> {{ user.email }}</p>
      <p><strong>First Name:</strong> {{ user.firstName || 'Not provided' }}</p>
      <p><strong>Last Name:</strong> {{ user.lastName || 'Not provided' }}</p>
      <p><strong>Member Since:</strong> {{ formatDate(user.createdAt) }}</p>
      
      <button class="btn btn-primary" (click)="onEdit()">Edit Profile</button>
    </div>
  `,
  styles: [`
    .info-display p {
      margin: 0.5rem 0;
    }
    
    .btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      transition: background-color 0.2s;
      margin-top: 1rem;
    }
    
    .btn-primary {
      background: #007bff;
      color: white;
    }
    
    .btn-primary:hover {
      background: #0056b3;
    }
  `]
})
export class ProfileDisplayComponent {
  @Input({ required: true }) user!: User;
  @Output() edit = new EventEmitter<void>();

  onEdit() {
    this.edit.emit();
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}