import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { User } from '../../../services/auth.service';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="user-menu">
      <span class="username">Hi, {{ user?.username }}</span>
      <a routerLink="/account" class="account-link">
        <span class="icon">👤</span>
        <span>Account</span>
      </a>
      <button class="logout-btn" (click)="onLogout()">Logout</button>
    </div>
  `,
  styles: [`
    .user-menu {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .username {
      font-size: 0.9rem;
      opacity: 0.9;
    }

    .account-link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: white;
      text-decoration: none;
    }

    .account-link:hover {
      opacity: 0.8;
    }

    .logout-btn {
      padding: 0.4rem 0.8rem;
      background-color: transparent;
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 0.25rem;
      cursor: pointer;
      font-size: 0.9rem;
      transition: all 0.2s;
    }

    .logout-btn:hover {
      background-color: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.5);
    }

    .icon {
      font-size: 1.5rem;
    }
  `]
})
export class UserMenuComponent {
  @Input() user: User | null = null;
  @Output() logout = new EventEmitter<void>();

  onLogout() {
    this.logout.emit();
  }
}