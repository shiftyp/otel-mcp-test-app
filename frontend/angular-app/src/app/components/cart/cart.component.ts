import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="cart-container">
      <h1>Shopping Cart</h1>
      <p>Cart functionality coming soon...</p>
    </div>
  `,
  styles: [`
    .cart-container {
      padding: 2rem;
    }
  `]
})
export class CartComponent {}