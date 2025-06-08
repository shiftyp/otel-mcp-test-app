import { Component, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';
import { ProfileDisplayComponent } from './components/profile-display.component';
import { ProfileEditFormComponent } from './components/profile-edit-form.component';
import { AccountDeleteSectionComponent } from './components/account-delete-section.component';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [
    CommonModule,
    ProfileDisplayComponent,
    ProfileEditFormComponent,
    AccountDeleteSectionComponent
  ],
  template: `
    <div class="account-container">
      <h1>My Account</h1>
      
      @if (currentUser()) {
        <div class="account-info">
          <h2>Profile Information</h2>
          
          @if (!isEditing()) {
            <app-profile-display
              [user]="currentUser()!"
              (edit)="startEditing()"
            />
          } @else {
            <app-profile-edit-form
              [user]="currentUser()!"
              [isUpdating]="isUpdating()"
              (save)="updateProfile($event)"
              (cancel)="cancelEditing()"
            />
          }
          
          @if (updateError()) {
            <div class="alert alert-danger">{{ updateError() }}</div>
          }
          
          @if (updateSuccess()) {
            <div class="alert alert-success">Profile updated successfully!</div>
          }
        </div>
        
        <app-account-delete-section
          #deleteSection
          (delete)="deleteAccount()"
        />
      } @else {
        <div class="not-logged-in">
          <p>Please log in to view your account information.</p>
          <button class="btn btn-primary" (click)="goToLogin()">Go to Login</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .account-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    .account-info {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 2rem;
      margin-bottom: 2rem;
    }
    
    .not-logged-in {
      text-align: center;
      padding: 2rem;
    }
    
    .btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      transition: background-color 0.2s;
    }
    
    .btn-primary {
      background: #007bff;
      color: white;
    }
    
    .btn-primary:hover {
      background: #0056b3;
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
    
    .alert-success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
  `]
})
export class AccountComponent implements OnInit {
  @ViewChild('deleteSection') deleteSection!: AccountDeleteSectionComponent;
  
  currentUser = signal<User | null>(null);
  isEditing = signal(false);
  isUpdating = signal(false);
  updateError = signal<string | null>(null);
  updateSuccess = signal(false);

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    const user = this.authService.currentUser();
    if (user) {
      this.currentUser.set(user);
    }
  }

  startEditing() {
    this.isEditing.set(true);
    this.updateError.set(null);
    this.updateSuccess.set(false);
  }

  cancelEditing() {
    this.isEditing.set(false);
  }

  updateProfile(updates: Partial<User>) {
    const user = this.currentUser();
    if (!user) return;

    this.isUpdating.set(true);
    this.updateError.set(null);
    this.updateSuccess.set(false);

    this.authService.updateProfile(user.id, updates).subscribe({
      next: (updatedUser) => {
        this.currentUser.set(updatedUser);
        this.isEditing.set(false);
        this.isUpdating.set(false);
        this.updateSuccess.set(true);
        
        setTimeout(() => {
          this.updateSuccess.set(false);
        }, 3000);
      },
      error: (error) => {
        this.isUpdating.set(false);
        this.updateError.set(error.error?.error || 'Failed to update profile');
      }
    });
  }

  deleteAccount() {
    const user = this.currentUser();
    if (!user) return;

    this.deleteSection.setDeleting(true);
    this.deleteSection.setError(null);

    this.authService.deleteAccount(user.id).subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: (error) => {
        this.deleteSection.setDeleting(false);
        this.deleteSection.setError(error.error?.error || 'Failed to delete account');
      }
    });
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}