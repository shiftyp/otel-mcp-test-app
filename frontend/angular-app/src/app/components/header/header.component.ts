import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <header class="app-header">
      <div class="container">
        <div class="logo">
          <a routerLink="/">E-Commerce Platform</a>
        </div>
        
        <div class="search-bar">
          <input type="text" placeholder="Search for products..." />
          <button>Search</button>
        </div>
        
        <div class="header-actions">
          <a routerLink="/account" class="account-link">
            <span class="icon">👤</span>
            <span>Account</span>
          </a>
          
          <a routerLink="/cart" class="cart-link">
            <span class="icon">🛒</span>
            <span>Cart</span>
            <span class="badge" *ngIf="cartItemCount > 0">{{ cartItemCount }}</span>
          </a>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .app-header {
      background-color: #343a40;
      color: white;
      padding: 1rem 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1rem;
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .logo a {
      font-size: 1.5rem;
      font-weight: 700;
      color: white;
      text-decoration: none;
    }

    .search-bar {
      flex: 1;
      display: flex;
      max-width: 500px;
    }

    .search-bar input {
      flex: 1;
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 0.25rem 0 0 0.25rem;
      font-size: 1rem;
    }

    .search-bar button {
      padding: 0.5rem 1.5rem;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 0 0.25rem 0.25rem 0;
      cursor: pointer;
      font-weight: 600;
    }

    .search-bar button:hover {
      background-color: #0056b3;
    }

    .header-actions {
      display: flex;
      gap: 1.5rem;
      align-items: center;
    }

    .account-link,
    .cart-link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: white;
      text-decoration: none;
      position: relative;
    }

    .account-link:hover,
    .cart-link:hover {
      opacity: 0.8;
    }

    .icon {
      font-size: 1.5rem;
    }

    .badge {
      position: absolute;
      top: -8px;
      right: -8px;
      background-color: #dc3545;
      color: white;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
    }
  `]
})
export class HeaderComponent {
  @Input() cartItemCount: number = 0;
}