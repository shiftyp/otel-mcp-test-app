import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { CartService } from './services/cart.service';
import { NavigationTelemetryService } from './services/navigation-telemetry.service';
import { ResourceTimingService } from './services/resource-timing.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, HeaderComponent],
  template: `
    <div class="app-container">
      <app-header [cartItemCount]="cartItemCount()" />
      
      <nav class="main-nav">
        <ul>
          <li>
            <a routerLink="/products" routerLinkActive="active">Products</a>
          </li>
          <li>
            <a routerLink="/cart" routerLinkActive="active">
              Cart ({{ cartItemCount() }})
            </a>
          </li>
          <li>
            <a routerLink="/account" routerLinkActive="active">Account</a>
          </li>
        </ul>
      </nav>

      <main class="main-content">
        <router-outlet />
      </main>

      <footer class="app-footer">
        <p>&copy; 2024 E-Commerce Platform. Powered by Angular v20 with SSR.</p>
      </footer>
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .main-nav {
      background-color: #f8f9fa;
      padding: 1rem 0;
      border-bottom: 1px solid #dee2e6;
    }

    .main-nav ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      justify-content: center;
      gap: 2rem;
    }

    .main-nav a {
      text-decoration: none;
      color: #495057;
      font-weight: 500;
      padding: 0.5rem 1rem;
      border-radius: 0.25rem;
      transition: all 0.3s ease;
    }

    .main-nav a:hover {
      background-color: #e9ecef;
    }

    .main-nav a.active {
      color: #007bff;
      background-color: #e7f3ff;
    }

    .main-content {
      flex: 1;
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
      width: 100%;
    }

    .app-footer {
      background-color: #343a40;
      color: white;
      text-align: center;
      padding: 1rem;
      margin-top: auto;
    }
  `]
})
export class AppComponent implements OnInit {
  title = 'E-Commerce Platform';
  cartItemCount = signal(0);
  
  private cartService = inject(CartService);
  private navigationTelemetry = inject(NavigationTelemetryService);
  private resourceTiming = inject(ResourceTimingService);

  ngOnInit(): void {
    // Initialize telemetry services
    this.navigationTelemetry.initialize();
    this.resourceTiming.initialize();
    
    // Subscribe to cart changes using signals
    this.cartService.getCartItemCount().subscribe(count => {
      this.cartItemCount.set(count);
    });
  }
}