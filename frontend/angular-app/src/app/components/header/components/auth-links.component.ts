import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-auth-links',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <a routerLink="/login" class="auth-link">Login</a>
    <a routerLink="/register" class="auth-link primary">Register</a>
  `,
  styles: [`
    .auth-link {
      padding: 0.5rem 1rem;
      color: white;
      text-decoration: none;
      border: 1px solid transparent;
      border-radius: 0.25rem;
      transition: all 0.2s;
    }

    .auth-link:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }

    .auth-link.primary {
      background-color: #007bff;
      border-color: #007bff;
    }

    .auth-link.primary:hover {
      background-color: #0056b3;
      border-color: #0056b3;
    }
  `]
})
export class AuthLinksComponent {}