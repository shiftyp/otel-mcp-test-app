import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SearchBarComponent } from './components/search-bar.component';
import { UserMenuComponent } from './components/user-menu.component';
import { AuthLinksComponent } from './components/auth-links.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    SearchBarComponent,
    UserMenuComponent,
    AuthLinksComponent
  ],
  template: `
    <header class="app-header">
      <div class="container">
        <div class="logo">
          <a routerLink="/">E-Commerce Platform</a>
        </div>
        
        <app-search-bar (search)="onSearch($event)" />
        
        <div class="header-actions">
          @if (authService.isAuthenticated()) {
            <app-user-menu 
              [user]="authService.currentUser()"
              (logout)="logout()"
            />
          } @else {
            <app-auth-links />
          }
          
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

    .header-actions {
      display: flex;
      gap: 1.5rem;
      align-items: center;
    }

    .cart-link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: white;
      text-decoration: none;
      position: relative;
    }

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
  
  protected authService = inject(AuthService);
  private router = inject(Router);

  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }

  onSearch(query: string) {
    this.router.navigate(['/search'], { queryParams: { q: query } });
  }
}