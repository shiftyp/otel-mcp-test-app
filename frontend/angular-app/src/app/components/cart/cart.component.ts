import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService, CartItem } from '../../services/cart.service';
import { Router } from '@angular/router';
import { TelemetryService } from '../../services/telemetry.service';
import { Telemetry, Traced, Metric, Logged } from 'angular-telemetry';

@Telemetry({
  metrics: {
    'cart.items_increased': 'counter',
    'cart.items_decreased': 'counter',
    'cart.items_removed': 'counter',
    'cart.items_updated': 'counter',
    'cart.cleared': 'counter',
    'cart.checkout_started': 'counter',
    'cart.page_viewed': 'counter'
  }
})
@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="cart-container">
      <h1>Shopping Cart</h1>
      
      @if (cartItems().length === 0) {
        <div class="empty-cart">
          <p>Your cart is empty</p>
          <button (click)="goToProducts()" class="primary-btn">Continue Shopping</button>
        </div>
      } @else {
        <div class="cart-items">
          @for (item of cartItems(); track item.productId) {
            <div class="cart-item">
              <div class="item-image">
                @if (item.imageUrl) {
                  <img [src]="item.imageUrl" [alt]="item.name">
                } @else {
                  <div class="placeholder-image">No Image</div>
                }
              </div>
              
              <div class="item-details">
                <h3>{{ item.name }}</h3>
                <p class="price">{{ item.price | currency }}</p>
              </div>
              
              <div class="quantity-controls">
                <button (click)="decreaseQuantity(item)" class="qty-btn">-</button>
                <input 
                  type="number" 
                  [(ngModel)]="item.quantity" 
                  (change)="updateQuantity(item)"
                  min="1"
                  class="qty-input"
                />
                <button (click)="increaseQuantity(item)" class="qty-btn">+</button>
              </div>
              
              <div class="item-total">
                {{ (item.price * item.quantity) | currency }}
              </div>
              
              <button (click)="removeItem(item.productId)" class="remove-btn">
                Remove
              </button>
            </div>
          }
        </div>
        
        <div class="cart-summary">
          <div class="summary-row">
            <span>Total Items:</span>
            <span>{{ totalItems() }}</span>
          </div>
          <div class="summary-row total">
            <span>Total:</span>
            <span>{{ totalPrice() | currency }}</span>
          </div>
          
          <div class="cart-actions">
            <button (click)="clearCart()" class="secondary-btn">Clear Cart</button>
            <button (click)="checkout()" class="primary-btn">Proceed to Checkout</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cart-container {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    
    h1 {
      margin-bottom: 2rem;
      color: #333;
    }
    
    .empty-cart {
      text-align: center;
      padding: 4rem 2rem;
    }
    
    .empty-cart p {
      font-size: 1.2rem;
      color: #666;
      margin-bottom: 2rem;
    }
    
    .cart-items {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      margin-bottom: 2rem;
    }
    
    .cart-item {
      display: grid;
      grid-template-columns: 100px 1fr auto auto auto;
      gap: 1rem;
      padding: 1.5rem;
      border-bottom: 1px solid #eee;
      align-items: center;
    }
    
    .cart-item:last-child {
      border-bottom: none;
    }
    
    .item-image {
      width: 100px;
      height: 100px;
      overflow: hidden;
      border-radius: 8px;
    }
    
    .item-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .placeholder-image {
      width: 100%;
      height: 100%;
      background: #f0f0f0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-size: 0.8rem;
    }
    
    .item-details h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1.1rem;
      color: #333;
    }
    
    .price {
      color: #007bff;
      font-weight: 600;
    }
    
    .quantity-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .qty-btn {
      width: 30px;
      height: 30px;
      border: 1px solid #ddd;
      background: #fff;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1.2rem;
      transition: background 0.3s;
    }
    
    .qty-btn:hover {
      background: #f0f0f0;
    }
    
    .qty-input {
      width: 50px;
      text-align: center;
      padding: 0.25rem;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    
    .item-total {
      font-weight: 600;
      font-size: 1.1rem;
      color: #333;
    }
    
    .remove-btn {
      background: none;
      border: none;
      color: #dc3545;
      cursor: pointer;
      text-decoration: underline;
      font-size: 0.9rem;
    }
    
    .remove-btn:hover {
      color: #c82333;
    }
    
    .cart-summary {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      padding: 2rem;
      max-width: 400px;
      margin-left: auto;
    }
    
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 1rem;
      font-size: 1.1rem;
    }
    
    .summary-row.total {
      font-size: 1.3rem;
      font-weight: 600;
      border-top: 2px solid #eee;
      padding-top: 1rem;
      margin-top: 1rem;
    }
    
    .cart-actions {
      display: flex;
      gap: 1rem;
      margin-top: 2rem;
    }
    
    .primary-btn, .secondary-btn {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.3s;
      flex: 1;
    }
    
    .primary-btn {
      background: #007bff;
      color: white;
    }
    
    .primary-btn:hover {
      background: #0056b3;
    }
    
    .secondary-btn {
      background: #6c757d;
      color: white;
    }
    
    .secondary-btn:hover {
      background: #545b62;
    }
    
    @media (max-width: 768px) {
      .cart-item {
        grid-template-columns: 1fr;
        gap: 1rem;
      }
      
      .item-image {
        display: none;
      }
      
      .cart-actions {
        flex-direction: column;
      }
    }
  `]
})
export class CartComponent {
  private cartService = inject(CartService);
  private router = inject(Router);
  private telemetryService = inject(TelemetryService);
  
  // Traced signals for cart data
  @Traced({ spanName: 'cart-items' })
  cartItems = this.cartService.cartItems;
  
  @Traced({ spanName: 'total-items' })
  totalItems = this.cartService.totalItems;
  
  @Traced({ spanName: 'total-price' })
  totalPrice = this.cartService.totalPrice;
  
  constructor() {
    // Record cart page view
    this.telemetryService.recordPageView('cart');
    this.telemetryService.log('Page view recorded for cart page', {
      'cart.items_count': this.totalItems(),
      'cart.has_items': this.totalItems() > 0
    })
    this.telemetryService.recordMetric('cart.page_viewed', 1);
  }
  
  @Traced({ spanName: 'navigate-to-products' })
  goToProducts(): void {
    this.telemetryService.log('Navigating to products from empty cart');
    this.router.navigate(['/products']);
  }
  
  @Traced({ spanName: 'increase-quantity' })
  @Metric('cart.items_increased')
  @Logged({ 
    level: 'info', 
    message: 'Cart item quantity increased'
  })
  increaseQuantity(item: CartItem): void {
    this.cartService.updateQuantity(item.productId, item.quantity + 1);
  }
  
  @Traced({ spanName: 'decrease-quantity' })
  @Metric('cart.items_decreased')
  @Logged({ 
    level: 'info', 
    message: 'Cart item quantity decreased'
  })
  decreaseQuantity(item: CartItem): void {
    if (item.quantity > 1) {
      this.cartService.updateQuantity(item.productId, item.quantity - 1);
    }
  }
  
  @Traced({ spanName: 'update-quantity' })
  @Metric('cart.items_updated')
  @Logged({ 
    level: 'info', 
    message: 'Cart item quantity updated'
  })
  updateQuantity(item: CartItem): void {
    if (item.quantity < 1) {
      item.quantity = 1;
    }
    this.cartService.updateQuantity(item.productId, item.quantity);
  }
  
  @Traced({ spanName: 'remove-item' })
  @Metric('cart.items_removed')
  @Logged({ 
    level: 'info', 
    message: 'Item removed from cart'
  })
  removeItem(productId: string): void {
    if (confirm('Are you sure you want to remove this item from your cart?')) {
      this.telemetryService.recordMetric('cart.items_removed', 1);
      this.cartService.removeFromCart(productId);
    }
  }
  
  @Traced({ spanName: 'clear-cart' })
  @Metric('cart.cleared')
  @Logged({ 
    level: 'info', 
    message: 'Cart cleared'
  })
  clearCart(): void {
    if (confirm('Are you sure you want to clear your entire cart?')) {
      const itemCount = this.totalItems();
      const totalValue = this.totalPrice();
      
      this.telemetryService.recordMetric('cart.cleared', 1, {
        'cart.items_count': itemCount,
        'cart.value_range': totalValue > 100 ? 'high' : totalValue > 50 ? 'medium' : 'low'
      });
      
      this.cartService.clearCart();
    }
  }
  
  @Traced({ spanName: 'checkout' })
  @Metric('cart.checkout_started')
  @Logged({ 
    level: 'info', 
    message: 'Checkout initiated'
  })
  checkout(): void {
    this.telemetryService.recordMetric('cart.checkout_started', 1, {
      'checkout.items_count': this.totalItems(),
      'checkout.value_range': this.totalPrice() > 100 ? 'high' : this.totalPrice() > 50 ? 'medium' : 'low'
    });
    
    // TODO: Implement checkout functionality
    alert('Checkout functionality not implemented yet');
  }
}