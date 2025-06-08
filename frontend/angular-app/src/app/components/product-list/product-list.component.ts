import { Component, OnInit, signal, computed, effect, inject, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { TelemetryService } from '../../services/telemetry.service';
import { Product } from '../../models/product.model';
import { Telemetry, Traced, Metric, Logged } from 'angular-telemetry';

@Telemetry({
  metrics: {
    'products.viewed': 'counter',
    'products.filtered': 'counter',
    'products.added_to_cart': 'counter',
    'search.performed': 'counter',
  }
})
@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="product-list-container">
      <h1>Products</h1>
      
      <!-- Search and Filters -->
      <div class="filters-section">
        <input 
          type="text" 
          [ngModel]="searchTerm()"
          (ngModelChange)="searchTerm.set($event); onSearchChange()"
          placeholder="Search products..."
          class="search-input"
        />
        
        <div class="filter-group">
          <label>Category:</label>
          <select [ngModel]="selectedCategory()" (ngModelChange)="selectedCategory.set($event); onFilterChange()">
            <option value="">All Categories</option>
            <option *ngFor="let category of categories()" [value]="category">
              {{ category }}
            </option>
          </select>
        </div>
        
        <div class="filter-group">
          <label>Sort by:</label>
          <select [ngModel]="sortBy()" (ngModelChange)="sortBy.set($event); onSortChange()">
            <option value="name">Name</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="rating">Rating</option>
          </select>
        </div>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading()" class="loading">
        Loading products...
      </div>

      <!-- Products Grid -->
      <div class="products-grid" *ngIf="!loading()">
        <div class="product-card" *ngFor="let product of sortedProducts(); trackBy: trackByProductId">
          <div class="product-image">
            <img 
              [src]="product.images[0].url || 'assets/placeholder.jpg'" 
              [alt]="product.images[0].alt || product.name"
            />
            <span class="badge featured" *ngIf="product.isFeatured">Featured</span>
          </div>
          
          <div class="product-info">
            <h3>
              <a [routerLink]="['/products', product.id]">{{ product.name }}</a>
            </h3>
            <p class="brand">{{ product.brand }}</p>
            <p class="description">{{ product.description | slice:0:100 }}...</p>
            
            <div class="rating">
              <span class="stars">★★★★★</span>
              <span class="rating-value">{{ product.rating.average.toFixed(1) }}</span>
              <span class="rating-count">({{ product.rating.count }})</span>
            </div>
            
            <div class="price-section">
              <span class="price">{{ product.currency }} {{ product.price.toFixed(2) }}</span>
              <span class="availability" [class.in-stock]="product.inventory.available > 0">
                {{ product.inventory.available > 0 ? 'In Stock' : 'Out of Stock' }}
              </span>
            </div>
            
            <button 
              class="add-to-cart-btn"
              [disabled]="product.inventory.available === 0"
              (click)="addToCart(product)"
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div class="pagination" *ngIf="totalPages() > 1">
        <button 
          (click)="previousPage()" 
          [disabled]="currentPage() === 1"
        >
          Previous
        </button>
        
        <span class="page-info">
          Page {{ currentPage() }} of {{ totalPages() }}
        </span>
        
        <button 
          (click)="nextPage()" 
          [disabled]="currentPage() === totalPages()"
        >
          Next
        </button>
      </div>
    </div>
  `,
  styles: [`
    .product-list-container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .filters-section {
      display: flex;
      gap: 1rem;
      align-items: center;
      margin-bottom: 2rem;
      padding: 1rem;
      background-color: #f8f9fa;
      border-radius: 0.5rem;
    }

    .search-input {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid #ced4da;
      border-radius: 0.25rem;
      font-size: 1rem;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .filter-group select {
      padding: 0.5rem;
      border: 1px solid #ced4da;
      border-radius: 0.25rem;
    }

    .loading {
      text-align: center;
      padding: 3rem;
      font-size: 1.2rem;
      color: #6c757d;
    }

    .products-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 2rem;
      margin-bottom: 2rem;
    }

    .product-card {
      background: white;
      border: 1px solid #e9ecef;
      border-radius: 0.5rem;
      overflow: hidden;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .product-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .product-image {
      position: relative;
      height: 200px;
      overflow: hidden;
    }

    .product-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .badge {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 0.25rem 0.75rem;
      border-radius: 0.25rem;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .badge.featured {
      background-color: #ffc107;
      color: #000;
    }

    .product-info {
      padding: 1rem;
    }

    .product-info h3 {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
    }

    .product-info h3 a {
      text-decoration: none;
      color: #212529;
    }

    .product-info h3 a:hover {
      color: #007bff;
    }

    .brand {
      color: #6c757d;
      font-size: 0.875rem;
      margin: 0 0 0.5rem;
    }

    .description {
      color: #495057;
      font-size: 0.875rem;
      margin: 0.5rem 0;
    }

    .rating {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0.5rem 0;
    }

    .stars {
      color: #ffc107;
    }

    .rating-value {
      font-weight: 600;
    }

    .rating-count {
      color: #6c757d;
      font-size: 0.875rem;
    }

    .price-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 1rem 0;
    }

    .price {
      font-size: 1.5rem;
      font-weight: 700;
      color: #28a745;
    }

    .availability {
      font-size: 0.875rem;
      color: #dc3545;
    }

    .availability.in-stock {
      color: #28a745;
    }

    .add-to-cart-btn {
      width: 100%;
      padding: 0.75rem;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 0.25rem;
      font-size: 1rem;
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

    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      margin: 2rem 0;
    }

    .pagination button {
      padding: 0.5rem 1rem;
      border: 1px solid #dee2e6;
      background-color: white;
      border-radius: 0.25rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .pagination button:hover:not(:disabled) {
      background-color: #e9ecef;
    }

    .pagination button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .page-info {
      font-weight: 500;
    }
  `]
})
export class ProductListComponent implements OnInit {
  // Inject services first
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private telemetryService = inject(TelemetryService);
  
  // Local UI state signals
  searchTerm = signal('');
  selectedCategory = signal('');
  sortBy = signal('name');
  
  // Get signals from service
  @Traced({ spanName: 'products-list' })
  products = this.productService.products;
  
  @Traced({ spanName: 'loading-state' })
  loading = this.productService.loading;
  
  categories = this.productService.categories;
  pagination = this.productService.pagination;
  currentPage = computed(() => this.pagination().page);
  totalPages = computed(() => this.pagination().totalPages);
  
  // Products are already sorted by the backend based on the sort parameter
  @Traced({ spanName: 'sorted-products' })
  sortedProducts = this.products;
  
  constructor() {
    afterNextRender(() => this.telemetryService.withSpan('product-list-client-render', () => {
      this.telemetryService.recordPageView('product-list');
    }))
    
    // Effect to track product changes
    effect(() => {
      const productCount = this.products().length;
      console.log(`Loaded ${productCount} products`);
      
      // Record metric for products loaded
      this.telemetryService.recordMetric('products.loaded', productCount, {
        'category': this.selectedCategory() || 'all',
        'has_search': !!this.searchTerm()
      });
    });
    
    // Sync local UI state with service parameters
    effect(() => {
      this.productService.updateSearchParams({
        search: this.searchTerm(),
        category: this.selectedCategory(),
        sort: this.sortBy()
      });
    });
  }

  ngOnInit(): void {
    // Resource will automatically load on initialization
  }
  @Traced({ 
    spanName: 'load-products'
  })
  @Metric('products.viewed')

  @Traced({ 
    spanName: 'search-products'
  })
  @Metric('search.performed')
  onSearchChange(): void {
    this.telemetryService.recordMetric('search.query', 1, {
      'search.term': this.searchTerm(),
      'search.results': this.products().length
    });
    // UI state update will trigger the effect which updates service params
    // The effect will reset page to 1 via setSearch
  }

  @Traced({ spanName: 'filter-change' })
  @Metric('products.filtered')
  onFilterChange(): void {
    // UI state update will trigger the effect which updates service params
  }

  @Traced({ spanName: 'sort-change' })
  @Metric('products.sorted')
  onSortChange(): void {
    // UI state update will trigger the effect which updates service params
  }

  @Traced({ 
    spanName: 'add-to-cart'
  })
  @Metric('products.added_to_cart')
  @Logged({
    level: 'info',
    message: 'Product added to cart'
  })
  addToCart(product: Product): void {
    this.cartService.addToCart(product);
    
    // Additional business metric
    this.telemetryService.recordMetric('cart.add', 1, {
      'product.id': product.id,
      'product.name': product.name,
      'product.price': product.price,
      'quantity': 1
    });
  }

  @Traced({ spanName: 'pagination-next' })
  @Metric('pagination.next')
  nextPage(): void {
    const currentPage = this.currentPage();
    const totalPages = this.totalPages();
    if (currentPage < totalPages) {
      this.productService.setPage(currentPage + 1);
    }
  }

  @Traced({ spanName: 'pagination-previous' })
  @Metric('pagination.previous')
  previousPage(): void {
    const currentPage = this.currentPage();
    if (currentPage > 1) {
      this.productService.setPage(currentPage - 1);
    }
  }
  
  trackByProductId(index: number, product: Product): string {
    return product.id;
  }
}