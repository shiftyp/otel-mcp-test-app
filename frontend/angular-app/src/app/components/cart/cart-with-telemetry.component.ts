import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TelemetryService } from '../../services/telemetry.service';
import { ProductService } from '../../services/product.service';
import { Product } from '../../models/product.model';
import { Telemetry, Traced, Metric, Logged } from 'angular-telemetry';

interface CartItem {
  product: Product;
  quantity: number;
}

@Telemetry('shop.cart')
@Component({
  selector: 'app-cart-with-telemetry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="cart-container">
      <h1>Shopping Cart (Signal Telemetry Demo)</h1>
      
      <div class="telemetry-info">
        <h3>Signal Metrics</h3>
        <p>Total Items: {{ totalItems() }}</p>
        <p>Total Price: {{ '$' + totalPrice().toFixed(2) }}</p>
        <p>Discount: {{ discountPercentage() }}%</p>
        <p>Final Price: {{ '$' + finalPrice().toFixed(2) }}</p>
      </div>

      <div class="cart-items" *ngIf="cartItems().length > 0">
        <div class="cart-item" *ngFor="let item of cartItems()">
          <div class="item-info">
            <h4>{{ item.product.name }}</h4>
            <p>{{ item.product.brand }}</p>
          </div>
          <div class="item-controls">
            <button (click)="updateQuantity(item.product.id, item.quantity - 1)">-</button>
            <span class="quantity">{{ item.quantity }}</span>
            <button (click)="updateQuantity(item.product.id, item.quantity + 1)">+</button>
            <span class="price">{{ '$' + (item.product.price * item.quantity).toFixed(2) }}</span>
            <button class="remove" (click)="removeItem(item.product.id)">Remove</button>
          </div>
        </div>
      </div>

      <div class="empty-cart" *ngIf="cartItems().length === 0">
        <p>Your cart is empty</p>
        <button (click)="addSampleItems()">Add Sample Items</button>
      </div>

      <div class="checkout-section" *ngIf="cartItems().length > 0">
        <div class="promo-code">
          <input 
            type="text" 
            [(ngModel)]="promoCode" 
            placeholder="Enter promo code"
            (ngModelChange)="applyPromoCode($event)"
          />
        </div>
        <button class="checkout-btn" (click)="checkout()">
          Checkout - {{ '$' + finalPrice().toFixed(2) }}
        </button>
      </div>

      <div class="performance-report">
        <button (click)="showPerformanceReport()">Show Signal Performance Report</button>
        <pre *ngIf="performanceReport">{{ performanceReport | json }}</pre>
      </div>
    </div>
  `,
  styles: [`
    .cart-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }

    .telemetry-info {
      background: #f0f0f0;
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 2rem;
    }

    .telemetry-info h3 {
      margin-top: 0;
    }

    .cart-items {
      margin-bottom: 2rem;
    }

    .cart-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      border: 1px solid #ddd;
      margin-bottom: 0.5rem;
      border-radius: 0.25rem;
    }

    .item-info h4 {
      margin: 0 0 0.25rem;
    }

    .item-info p {
      margin: 0;
      color: #666;
    }

    .item-controls {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .item-controls button {
      width: 30px;
      height: 30px;
      border: 1px solid #ddd;
      background: white;
      cursor: pointer;
      border-radius: 0.25rem;
    }

    .quantity {
      font-weight: bold;
      min-width: 30px;
      text-align: center;
    }

    .price {
      font-weight: bold;
      min-width: 80px;
      text-align: right;
    }

    .remove {
      background: #dc3545 !important;
      color: white !important;
      width: auto !important;
      padding: 0.25rem 0.75rem !important;
    }

    .empty-cart {
      text-align: center;
      padding: 3rem;
    }

    .checkout-section {
      background: #f8f9fa;
      padding: 1.5rem;
      border-radius: 0.5rem;
    }

    .promo-code {
      margin-bottom: 1rem;
    }

    .promo-code input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 0.25rem;
    }

    .checkout-btn {
      width: 100%;
      padding: 1rem;
      background: #28a745;
      color: white;
      border: none;
      border-radius: 0.25rem;
      font-size: 1.1rem;
      font-weight: bold;
      cursor: pointer;
    }

    .checkout-btn:hover {
      background: #218838;
    }

    .performance-report {
      margin-top: 2rem;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 0.5rem;
    }

    .performance-report pre {
      margin-top: 1rem;
      padding: 1rem;
      background: white;
      border: 1px solid #ddd;
      border-radius: 0.25rem;
      overflow-x: auto;
    }
  `]
})
export class CartWithTelemetryComponent implements OnInit {
  private telemetry = inject(TelemetryService);
  private productService = inject(ProductService);

  // Telemetry-tracked signals with decorators
  cartItems = signal<CartItem[]>([]);

  private discountCode = signal<string>('');

  // Computed signals with telemetry decorators
  totalItems = computed(() => {
    return this.cartItems().reduce((sum, item) => sum + item.quantity, 0);
  });

  totalPrice = computed(() => {
    return this.cartItems().reduce((sum, item) => 
      sum + (item.product.price * item.quantity), 0
    );
  });

  discountPercentage = computed(() => {
    const code = this.discountCode();
    if (code === 'SAVE10') return 10;
    if (code === 'SAVE20') return 20;
    if (code === 'DEMO50') return 50;
    return 0;
  });

  finalPrice = computed(() => {
    const total = this.totalPrice();
    const discount = this.discountPercentage();
    return total * (1 - discount / 100);
  });

  // Regular properties
  promoCode = '';
  performanceReport: any = null;

  constructor() {
    // Set up effect to track significant cart changes
    effect(() => {
      const items = this.cartItems();
      const total = this.totalPrice();
      
      if (items.length > 0 && total > 100) {
        this.telemetry.log('High-value cart detected', {
          'cart.value': total,
          'cart.items': items.length,
        });
      }
    });
  }

  @Logged<CartWithTelemetryComponent, 'ngOnInit'>({ message: 'page-view', logEntry: true, includeArgs: false })
  ngOnInit() {
    // Track dependencies between signals
    this.trackSignalDependencies();
  }

  @Traced<CartWithTelemetryComponent, 'addSampleItems'>({
    attributes: { action: 'add-sample-items' }
  })
  @Metric<CartWithTelemetryComponent, 'addSampleItems'>('sample.items.count', {
    value: () => 3 // We're adding 3 sample items
  })
  addSampleItems() {
    // Use the products signal directly from the service
    const products = this.productService.products();
    const sampleProducts = products.slice(0, 3);
    
    if (sampleProducts.length > 0) {
      const sampleItems: CartItem[] = sampleProducts.map(product => ({
        product,
        quantity: Math.floor(Math.random() * 3) + 1
      }));
      
      this.cartItems.set(sampleItems);
      this.telemetry.log('Added sample items to cart', { count: sampleItems.length });
    }
  }

  @Traced<CartWithTelemetryComponent, 'updateQuantity'>({
    attributes: ([productId, newQuantity]) => ({
      'product.id': productId,
      'quantity.new': newQuantity
    })
  })
  @Metric<CartWithTelemetryComponent, 'updateQuantity'>('cart.update', {
    attributes: ([productId, newQuantity]) => ({
      'product.id': productId,
      'quantity.new': newQuantity
    })
  })
  updateQuantity(productId: string, newQuantity: number) {
    if (newQuantity <= 0) {
      this.removeItem(productId);
      return;
    }

    this.cartItems.update(items => 
      items.map(item => 
        item.product.id === productId 
          ? { ...item, quantity: newQuantity }
          : item
      )
    );
  }

  @Traced<CartWithTelemetryComponent, 'removeItem'>({
    attributes: ([productId]) => ({ 'product.id': productId })
  })
  @Metric<CartWithTelemetryComponent, 'removeItem'>('cart.remove', {
    attributes: ([productId]) => ({
      'product.id': productId
    })
  })
  removeItem(productId: string) {
    
    this.cartItems.update(items => 
      items.filter(item => item.product.id !== productId)
    );
  }

  @Traced<CartWithTelemetryComponent, 'applyPromoCode'>()
  @Metric<CartWithTelemetryComponent, 'applyPromoCode'>('promo.applied', {
    condition: ([code]) => {
      return ['SAVE10', 'SAVE20', 'DEMO50'].includes(code.toUpperCase());
    },
    attributes: ([code]) => {
      const upperCode = code.toUpperCase();
      return {
        'promo.code': code,
        'promo.discount': upperCode === 'SAVE10' ? 10 : (upperCode === 'SAVE20' ? 20 : (upperCode === 'DEMO50' ? 50 : 0))
      };
    }
  })
  applyPromoCode(code: string) {
    this.discountCode.set(code.toUpperCase());
  }

  @Traced<CartWithTelemetryComponent, 'checkout'>('checkout.attempt')
  @Metric<CartWithTelemetryComponent, 'checkout'>('checkout.attempt', {
    attributes: () => {
      const success = Math.random() > 0.1;
      return {
        'checkout.success': success
      };
    }
  })
  @Metric<CartWithTelemetryComponent, 'checkout'>('checkout.revenue', {
    condition: () => Math.random() > 0.1,
    value: () => 100 // Default revenue value
  })
  @Logged<CartWithTelemetryComponent, 'checkout'>({
    message: 'checkout-completed',
    logExit: true,
    includeResult: true
  })
  checkout() {
    const success = Math.random() > 0.1; // 90% success rate

    if (success) {
      // Clear cart
      this.cartItems.set([]);
      this.discountCode.set('');
      alert('Checkout successful!');
    } else {
      this.telemetry.logError('Checkout failed', new Error('Payment processing error'));
      alert('Checkout failed. Please try again.');
    }
  }

  @Traced<CartWithTelemetryComponent, 'showPerformanceReport'>()
  @Logged<CartWithTelemetryComponent, 'showPerformanceReport'>({
    message: 'performance-report-generated',
    logEntry: true,
    logExit: true
  })
  showPerformanceReport() {
    this.performanceReport = (this.telemetry as any).getSignalPerformanceReport?.() || {};
  }

  // Helper method for promo code validation
  // private isValidPromoCode(code: string): boolean {
  //   return ['SAVE10', 'SAVE20', 'DEMO50'].includes(code.toUpperCase());
  // }

  @Logged<[], void>({
    message: 'signal-dependencies-tracked',
    logEntry: true
  })
  private trackSignalDependencies() {
    // Signal dependencies are automatically tracked by Angular's reactivity system
    // The telemetry service will capture these relationships through the signal executions
  }
}