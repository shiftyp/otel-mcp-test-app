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
    'auth.login.attempts': 'counter',
    'auth.login.success': 'counter',
    'auth.login.failure': 'counter',
  }
})
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="login-container">
      <h1>Login</h1>
      
      <div class="error-message" *ngIf="errorMessage()">
        {{ errorMessage() }}
      </div>
      
      <form (ngSubmit)="login()">
        <div class="form-group">
          <label for="username">Username</label>
          <input 
            type="text" 
            id="username" 
            [ngModel]="username()"
            (ngModelChange)="username.set($event)"
            name="username"
            placeholder="Enter username"
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
            placeholder="Enter password"
            required
            [disabled]="isLoading()"
          />
        </div>
        
        <button 
          type="submit" 
          [disabled]="!isFormValid() || isLoading()"
        >
          {{ isLoading() ? 'Logging in...' : 'Login' }}
        </button>
      </form>
      
      <div class="additional-options">
        <a href="#" (click)="forgotPassword($event)">Forgot Password?</a>
        <span class="separator">|</span>
        <a routerLink="/register">Create Account</a>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      padding: 2rem;
      max-width: 400px;
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
    }
    
    .additional-options a {
      color: #007bff;
      text-decoration: none;
    }
    
    .additional-options a:hover {
      text-decoration: underline;
    }
    
    .separator {
      margin: 0 0.5rem;
      color: #ccc;
    }
  `]
})
export class LoginComponent {
  private authService = inject(AuthService);
  private telemetryService = inject(TelemetryService);
  private router = inject(Router);
  
  // Form fields with signals
  username = signal('');
  password = signal('');
  
  // Traced signals for state management
  @Traced({ spanName: 'loading-state' })
  isLoading = signal(false);
  
  @Traced({ spanName: 'error-message' })
  errorMessage = signal<string | null>(null);
  
  @Traced({ spanName: 'login-attempts' })
  loginAttempts = signal(0);
  
  // Computed signal for form validation
  @Traced({ 
    spanName: 'form-validation',
    warnOnSlowOperation: 10
  })
  isFormValid = computed(() => {
    return this.username().length >= 3 && this.password().length >= 6;
  });
  
  @Traced({ 
    spanName: 'user-login'
  })
  @Metric('auth.login.attempts')
  @Logged({
    level: 'info',
    message: 'Login attempt'
  })
  async login(): Promise<void> {
    if (!this.isFormValid()) {
      this.errorMessage.set('Please fill in all fields correctly');
      return;
    }
    
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.loginAttempts.update(count => count + 1);
    
    try {
      const result = await firstValueFrom(this.authService.login({ username: this.username(), password: this.password() }));
      
      if (result) {
        // Record successful login
        this.telemetryService.recordMetric('auth.login.success', 1, {
          'login.method': 'username',
          'login.attempts': this.loginAttempts()
        });
        
        this.telemetryService.log('User logged in successfully', {
          'login.attempts': this.loginAttempts()
        });
        
        // Navigate to products page
        this.router.navigate(['/products']);
      }
    } catch (error: any) {
      // Record failed login
      this.telemetryService.recordMetric('auth.login.failure', 1, {
        'error.type': error.status === 401 ? 'invalid_credentials' : 'unknown',
        'login.attempts': this.loginAttempts()
      });
      
      this.telemetryService.logError('Login failed', error);
      
      if (error.status === 401) {
        this.errorMessage.set('Invalid username or password');
      } else {
        this.errorMessage.set('An error occurred. Please try again.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
  
  @Traced({ spanName: 'forgot-password' })
  @Metric('auth.forgot_password.clicked')
  forgotPassword(event: Event): void {
    event.preventDefault();
    
    this.telemetryService.log('Forgot password clicked', {
      'has_username': !!this.username
    });
    
    // TODO: Implement forgot password functionality
    alert('Forgot password functionality not implemented yet');
  }
}