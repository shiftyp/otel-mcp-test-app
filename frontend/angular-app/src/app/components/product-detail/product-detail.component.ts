import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../models/product.model';
import { TelemetryService } from '../../services/telemetry.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="product-detail-container" *ngIf="product()">
      <div class="breadcrumb">
        <a routerLink="/products">Products</a> / 
        <span>{{ product()!.name }}</span>
      </div>
      
      <div class="product-detail">
        <div class="product-images">
          <img 
            [src]="selectedImage().url" 
            [alt]="selectedImage().alt"
            class="main-image"
          />
          <div class="thumbnail-list">
            <img 
              *ngFor="let img of product()!.images; let i = index"
              [src]="img.url"
              [alt]="img.alt"
              [class.selected]="selectedImageIndex() === i"
              (click)="selectImage(i)"
              class="thumbnail"
            />
          </div>
        </div>
        
        <div class="product-info">
          <h1>{{ product()!.name }}</h1>
          <p class="brand">by {{ product()!.brand }}</p>
          
          <div class="rating">
            <span class="stars">★★★★★</span>
            <span class="rating-value">{{ product()!.rating.average.toFixed(1) }}</span>
            <span class="rating-count">({{ product()!.rating.count }} reviews)</span>
          </div>
          
          <div class="price">
            {{ product()!.currency }} {{ product()!.price.toFixed(2) }}
          </div>
          
          <div class="availability">
            <span [class.in-stock]="product()!.inventory.available > 0">
              {{ product()!.inventory.available > 0 ? 'In Stock' : 'Out of Stock' }}
            </span>
            <span *ngIf="product()!.inventory.available > 0 && product()!.inventory.available < 10" class="low-stock">
              Only {{ product()!.inventory.available }} left!
            </span>
          </div>
          
          <div class="description">
            <h3>Description</h3>
            <p>{{ product()!.description }}</p>
          </div>
          
          <div class="add-to-cart-section">
            <div class="quantity-selector">
              <button (click)="decrementQuantity()" [disabled]="quantity() <= 1">-</button>
              <input type="number" [value]="quantity()" readonly />
              <button (click)="incrementQuantity()" [disabled]="quantity() >= product()!.inventory.available">+</button>
            </div>
            
            <button 
              class="add-to-cart-btn"
              [disabled]="product()!.inventory.available === 0"
              (click)="addToCart()"
            >
              Add to Cart
            </button>
          </div>
          
          <div class="specifications" *ngIf="product()!.specifications">
            <h3>Specifications</h3>
            <dl>
              <div *ngFor="let spec of objectKeys(product()!.specifications)">
                <dt>{{ spec }}</dt>
                <dd>{{ product()!.specifications[spec] }}</dd>
              </div>
            </dl>
          </div>
          
          <div class="tags" *ngIf="product()!.tags.length > 0">
            <h3>Tags</h3>
            <span class="tag" *ngFor="let tag of product()!.tags">{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="loading" *ngIf="loading()">
      Loading product details...
    </div>
  `,
  styles: [`
    .product-detail-container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .breadcrumb {
      margin-bottom: 2rem;
      color: #6c757d;
    }

    .breadcrumb a {
      color: #007bff;
      text-decoration: none;
    }

    .product-detail {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3rem;
    }

    .product-images {
      position: sticky;
      top: 2rem;
      align-self: start;
    }

    .main-image {
      width: 100%;
      max-width: 500px;
      height: auto;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
    }

    .thumbnail-list {
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
    }

    .thumbnail {
      width: 80px;
      height: 80px;
      object-fit: cover;
      border: 2px solid transparent;
      border-radius: 0.25rem;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .thumbnail:hover {
      border-color: #dee2e6;
    }

    .thumbnail.selected {
      border-color: #007bff;
    }

    .product-info h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    .brand {
      color: #6c757d;
      margin-bottom: 1rem;
    }

    .rating {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .stars {
      color: #ffc107;
      font-size: 1.25rem;
    }

    .price {
      font-size: 2rem;
      font-weight: 700;
      color: #28a745;
      margin-bottom: 1rem;
    }

    .availability {
      margin-bottom: 2rem;
    }

    .in-stock {
      color: #28a745;
      font-weight: 600;
    }

    .low-stock {
      color: #dc3545;
      margin-left: 1rem;
      font-size: 0.875rem;
    }

    .description {
      margin-bottom: 2rem;
    }

    .description h3 {
      margin-bottom: 0.5rem;
    }

    .add-to-cart-section {
      display: flex;
      gap: 1rem;
      align-items: center;
      margin-bottom: 2rem;
    }

    .quantity-selector {
      display: flex;
      border: 1px solid #dee2e6;
      border-radius: 0.25rem;
    }

    .quantity-selector button {
      padding: 0.5rem 1rem;
      border: none;
      background: white;
      cursor: pointer;
      font-size: 1.25rem;
    }

    .quantity-selector button:hover:not(:disabled) {
      background-color: #f8f9fa;
    }

    .quantity-selector button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .quantity-selector input {
      width: 50px;
      text-align: center;
      border: none;
      font-size: 1rem;
    }

    .add-to-cart-btn {
      flex: 1;
      padding: 0.75rem 2rem;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 0.25rem;
      font-size: 1.125rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .add-to-cart-btn:hover:not(:disabled) {
      background-color: #0056b3;
    }

    .add-to-cart-btn:disabled {
      background-color: #6c757d;
      cursor: not-allowed;
    }

    .specifications {
      margin-bottom: 2rem;
    }

    .specifications h3 {
      margin-bottom: 1rem;
    }

    .specifications dl {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }

    .specifications dt {
      font-weight: 600;
      color: #495057;
    }

    .specifications dd {
      margin: 0;
      color: #6c757d;
    }

    .tags {
      margin-bottom: 2rem;
    }

    .tags h3 {
      margin-bottom: 0.5rem;
    }

    .tag {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      margin-right: 0.5rem;
      background-color: #e9ecef;
      border-radius: 0.25rem;
      font-size: 0.875rem;
    }

    .loading {
      text-align: center;
      padding: 3rem;
      font-size: 1.2rem;
      color: #6c757d;
    }

    @media (max-width: 768px) {
      .product-detail {
        grid-template-columns: 1fr;
      }

      .product-images {
        position: static;
      }
    }
  `]
})
export class ProductDetailComponent implements OnInit {
  product = signal<Product | null>(null);
  loading = signal(true);
  selectedImageIndex = signal(0);
  quantity = signal(1);

  selectedImage = (() => {
    const prod = this.product();
    if (!prod || prod.images.length === 0) {
      return { url: 'assets/placeholder.jpg', alt: 'Product image' };
    }
    return prod.images[this.selectedImageIndex()];
  });

  objectKeys = Object.keys;

  constructor(
    private route: ActivatedRoute,
    private productService: ProductService,
    private cartService: CartService,
    private telemetryService: TelemetryService
  ) {}

  ngOnInit(): void {
    // Use manual tracing for component initialization
    this.telemetryService.withSpan('ProductDetailComponent.init', () => {
      this.route.params.subscribe(params => {
        const productId = params['id'];
        if (productId) {
          this.loadProduct(productId);
        }
      });
    });
  }

  loadProduct(id: string): void {
    // Manual span for product loading
    this.telemetryService.withSpan('ProductDetailComponent.loadProduct', () => {
      this.loading.set(true);
      this.productService.getProduct(id).subscribe({
        next: (product) => {
          this.product.set(product);
          this.loading.set(false);
        },
        error: (error) => {
          console.error('Error loading product:', error);
          this.loading.set(false);
        }
      });
    });
  }

  selectImage(index: number): void {
    this.selectedImageIndex.set(index);
  }

  incrementQuantity(): void {
    const product = this.product();
    if (product && this.quantity() < product.inventory.available) {
      this.quantity.update(q => q + 1);
    }
  }

  decrementQuantity(): void {
    if (this.quantity() > 1) {
      this.quantity.update(q => q - 1);
    }
  }

  addToCart(): void {
    const product = this.product();
    if (product) {
      // Manual span for add to cart action
      this.telemetryService.withSpan('ProductDetailComponent.addToCart', () => {
        this.cartService.addToCart(product, this.quantity());
        // Reset quantity after adding
        this.quantity.set(1);
      });
    }
  }
}