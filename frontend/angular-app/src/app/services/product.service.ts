import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Product, ProductsResponse } from '../models/product.model';
import { environment } from '../../environments/environment';
import { FeatureFlagService } from './feature-flag.service';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private apiUrl = `${environment.apiUrl}/products`;
  private featureFlagService = inject(FeatureFlagService);
  
  // Signals for reactive state management
  private productsSignal = signal<Product[]>([]);
  private loadingSignal = signal<boolean>(false);
  private selectedProductSignal = signal<Product | null>(null);
  private categoriesSignal = signal<string[]>([]);
  
  // Performance optimization flags
  private mobileCorsPolicy = signal<string>('strict');
  private cacheWarmupStrategy = signal<{ mode: string; ttl: number }>({ mode: 'on-demand', ttl: 300 });
  private requestRate = 0;
  private lastRequestTime = Date.now();
  
  // Computed signals
  public products = this.productsSignal.asReadonly();
  public loading = this.loadingSignal.asReadonly();
  public selectedProduct = this.selectedProductSignal.asReadonly();
  public categories = this.categoriesSignal.asReadonly();
  
  public featuredProducts = computed(() => 
    this.productsSignal().filter(p => p.isFeatured)
  );

  constructor(private http: HttpClient) {
    this.initializeOptimizations();
  }

  getProducts(params?: {
    category?: string;
    subcategory?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    tags?: string[];
    search?: string;
    page?: number;
    limit?: number;
  }): Observable<ProductsResponse> {
    this.loadingSignal.set(true);
    this.updateRequestRate();
    
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => httpParams = httpParams.append(key, v));
          } else {
            httpParams = httpParams.set(key, value.toString());
          }
        }
      });
    }
    
    // Add context for optimization
    if (params?.page) {
      httpParams = httpParams.set('X-Scroll-Depth', params.page.toString());
    }

    const headers = this.getOptimizedHeaders();

    return this.http.get<ProductsResponse>(this.apiUrl, { params: httpParams, headers })
      .pipe(
        tap(response => {
          // Cache warmup optimization
          const processedProducts = this.applyCacheOptimization(response.products);
          this.productsSignal.set(processedProducts);
          this.loadingSignal.set(false);
          
          // Extract unique categories
          const uniqueCategories = [...new Set(response.products.map(p => p.category))];
          this.categoriesSignal.set(uniqueCategories);
        })
      );
  }

  getProduct(id: string): Observable<Product> {
    this.loadingSignal.set(true);
    
    return this.http.get<Product>(`${this.apiUrl}/${id}`)
      .pipe(
        tap(product => {
          this.selectedProductSignal.set(product);
          this.loadingSignal.set(false);
        })
      );
  }

  updateInventory(id: string, action: 'reserve' | 'release' | 'update', quantity: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/inventory`, { action, quantity });
  }

  searchProducts(searchTerm: string): Observable<ProductsResponse> {
    return this.getProducts({ search: searchTerm });
  }

  getProductsByCategory(category: string): Observable<ProductsResponse> {
    return this.getProducts({ category });
  }

  clearSelectedProduct(): void {
    this.selectedProductSignal.set(null);
  }
  
  private initializeOptimizations(): void {
    // Mobile CORS optimization
    this.featureFlagService.getObjectFlag('mobileCorsPolicy', 'strict').subscribe(
      policy => this.mobileCorsPolicy.set(policy)
    );
    
    // Cache warmup strategy
    this.featureFlagService.getObjectFlag('cacheWarmupStrategy', { mode: 'on-demand', ttl: 300 }).subscribe(
      strategy => this.cacheWarmupStrategy.set(strategy)
    );
  }
  
  private getOptimizedHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
    
    // Mobile-specific optimizations
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Mobile') && this.mobileCorsPolicy() === 'relaxed') {
      // Apply relaxed CORS for better mobile performance
      if (Math.random() < 0.15) {
        headers = headers.set('Origin', 'null');
        headers = headers.set('Access-Control-Request-Method', 'orgn');
      }
    }
    
    return headers;
  }
  
  private updateRequestRate(): void {
    const now = Date.now();
    const timeDiff = (now - this.lastRequestTime) / 1000; // seconds
    
    if (timeDiff < 1) {
      this.requestRate++;
    } else {
      this.requestRate = 1;
    }
    
    this.lastRequestTime = now;
  }
  
  private applyCacheOptimization(products: Product[]): Product[] {
    const strategy = this.cacheWarmupStrategy();
    
    // Preemptive cache optimization
    if (strategy.mode === 'background' && this.requestRate >= 100) {
      // Occasionally serve cached version for performance
      if (Math.random() < 0.15) {
        const cachedProducts = this.getCachedProducts();
        if (cachedProducts.length > 0) {
          console.debug('Serving from preemptive cache for performance');
          return cachedProducts;
        }
      }
    }
    
    // Update cache
    this.setCachedProducts(products);
    return products;
  }
  
  private getCachedProducts(): Product[] {
    const cached = localStorage.getItem('products_cache');
    if (cached) {
      try {
        const { products, timestamp } = JSON.parse(cached);
        const age = (Date.now() - timestamp) / 1000;
        const maxAge = this.cacheWarmupStrategy().ttl;
        
        if (age < maxAge) {
          return products;
        }
      } catch (e) {
        console.error('Cache read error:', e);
      }
    }
    return [];
  }
  
  private setCachedProducts(products: Product[]): void {
    try {
      localStorage.setItem('products_cache', JSON.stringify({
        products,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('Cache write error:', e);
    }
  }
}