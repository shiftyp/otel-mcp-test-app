import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { TelemetryService } from '../../services/telemetry.service';
import { Telemetry, Traced, Metric, Logged } from 'angular-telemetry';

@Telemetry({
  metrics: {
    'registration.attempted': 'counter',
    'registration.succeeded': 'counter',
    'registration.failed': 'counter',
    'registration.validation_errors': 'counter',
    'registration.page_viewed': 'counter'
  }
})
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="register-container">
      <h1>Create Account</h1>
      
      <div class="error-message" *ngIf="errorMessage()">
        {{ errorMessage() }}
      </div>
      
      <form (ngSubmit)="register()">
        <div class="form-group">
          <label for="username">Username</label>
          <input 
            type="text" 
            id="username" 
            [ngModel]="username()"
            (ngModelChange)="username.set($event)"
            name="username"
            placeholder="Choose a username"
            required
            [disabled]="isLoading()"
          />
        </div>
        
        <div class="form-group">
          <label for="email">Email</label>
          <input 
            type="email" 
            id="email" 
            [ngModel]="email()"
            (ngModelChange)="email.set($event)"
            name="email"
            placeholder="Enter your email"
            required
            [disabled]="isLoading()"
          />
        </div>
        
        <div class="form-group">
          <label for="password">Password</label>
          <input 
            type="password" 
            id="password" 
            [ngModel]="password()"
            (ngModelChange)="password.set($event)"
            name="password"
            placeholder="Choose a password"
            required
            [disabled]="isLoading()"
          />
        </div>
        
        <div class="form-group">
          <label for="confirmPassword">Confirm Password</label>
          <input 
            type="password" 
            id="confirmPassword" 
            [ngModel]="confirmPassword()"
            (ngModelChange)="confirmPassword.set($event)"
            name="confirmPassword"
            placeholder="Confirm your password"
            required
            [disabled]="isLoading()"
          />
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label for="firstName">First Name (Optional)</label>
            <input 
              type="text" 
              id="firstName" 
              [ngModel]="firstName()"
              (ngModelChange)="firstName.set($event)"
              name="firstName"
              placeholder="First name"
              [disabled]="isLoading()"
            />
          </div>
          
          <div class="form-group">
            <label for="lastName">Last Name (Optional)</label>
            <input 
              type="text" 
              id="lastName" 
              [ngModel]="lastName()"
              (ngModelChange)="lastName.set($event)"
              name="lastName"
              placeholder="Last name"
              [disabled]="isLoading()"
            />
          </div>
        </div>
        
        <button 
          type="submit" 
          [disabled]="!isFormValid() || isLoading()"
        >
          {{ isLoading() ? 'Creating Account...' : 'Create Account' }}
        </button>
      </form>
      
      <div class="additional-options">
        <span>Already have an account?</span>
        <a routerLink="/login">Login</a>
      </div>
    </div>
  `,
  styles: [`
    .register-container {
      padding: 2rem;
      max-width: 500px;
      margin: 2rem auto;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    
    h1 {
      text-align: center;
      margin-bottom: 2rem;
      color: #333;
    }
    
    .error-message {
      background: #fee;
      color: #c33;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1rem;
      text-align: center;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    
    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #555;
    }
    
    input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 1rem;
      transition: border-color 0.3s;
    }
    
    input:focus {
      outline: none;
      border-color: #007bff;
    }
    
    input:disabled {
      background: #f5f5f5;
      cursor: not-allowed;
    }
    
    button {
      width: 100%;
      padding: 0.75rem;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.3s;
      margin-top: 1rem;
    }
    
    button:hover:not(:disabled) {
      background: #0056b3;
    }
    
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    
    .additional-options {
      text-align: center;
      margin-top: 1.5rem;
      font-size: 0.9rem;
      color: #666;
    }
    
    .additional-options a {
      color: #007bff;
      text-decoration: none;
      margin-left: 0.5rem;
    }
    
    .additional-options a:hover {
      text-decoration: underline;
    }
    
    @media (max-width: 480px) {
      .form-row {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class RegisterComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private telemetryService = inject(TelemetryService);
  
  // Form fields as signals for reactivity
  username = signal('');
  email = signal('');
  password = signal('');
  confirmPassword = signal('');
  firstName = signal('');
  lastName = signal('');
  
  // State signals with tracing
  @Traced({ spanName: 'loading-state' })
  isLoading = signal(false);
  
  @Traced({ spanName: 'error-message' })
  errorMessage = signal<string | null>(null);
  
  constructor() {
    // Record registration page view
    this.telemetryService.recordPageView('register');
    this.telemetryService.recordMetric('registration.page_viewed', 1);
  }
  
  // Form validation with tracing
  @Traced({ 
    spanName: 'form-validation',
    warnOnSlowOperation: 10
  })
  isFormValid = computed(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return this.username().length >= 3 &&
           emailRegex.test(this.email()) &&
           this.password().length >= 6 &&
           this.password() === this.confirmPassword();
  });
  
  @Traced({ 
    spanName: 'register-user'
  })
  @Metric('registration.attempted')
  @Logged({ 
    level: 'info',
    message: 'User registration attempt'
  })
  async register(): Promise<void> {
    if (!this.isFormValid()) {
      this.errorMessage.set('Please fill in all required fields correctly');
      this.telemetryService.recordMetric('registration.validation_errors', 1);
      this.telemetryService.log('Registration validation failed', {
        'validation.has_username': !!this.username(),
        'validation.has_email': !!this.email(),
        'validation.has_password': !!this.password(),
        'validation.passwords_match': this.password() === this.confirmPassword()
      });
      return;
    }
    
    this.isLoading.set(true);
    this.errorMessage.set(null);
    
    try {
      const result = await firstValueFrom(this.authService.register({
        username: this.username(),
        email: this.email(),
        password: this.password(),
        firstName: this.firstName() || undefined,
        lastName: this.lastName() || undefined
      }));
      
      if (result) {
        // Record successful registration
        this.telemetryService.recordMetric('registration.succeeded', 1, {
          'registration.method': 'form',
          'registration.has_optional_fields': !!(this.firstName() || this.lastName())
        });
        
        this.telemetryService.log('User registered successfully');
        
        // Navigate to products page after successful registration
        this.router.navigate(['/products']);
      }
    } catch (error: any) {
      // Record failed registration
      this.telemetryService.recordMetric('registration.failed', 1, {
        'error.type': error.status === 409 ? 'duplicate_user' : 
                      error.status === 400 ? 'invalid_data' : 'unknown',
        'error.status': error.status || 0
      });
      
      this.telemetryService.logError('Registration failed', error);
      
      if (error.status === 409) {
        this.errorMessage.set('Username or email already exists');
      } else if (error.status === 400) {
        this.errorMessage.set('Invalid registration data');
      } else {
        this.errorMessage.set('An error occurred. Please try again.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}