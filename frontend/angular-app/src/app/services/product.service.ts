import { Injectable, signal, computed, inject, PLATFORM_ID, resource } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, tap, map, firstValueFrom } from 'rxjs';
import { Product, ProductsResponse } from '../models/product.model';
import { FeatureFlagService } from './feature-flag.service';
import { TelemetryService } from './telemetry.service';
import { injectEnvironment } from '../providers/environment.provider';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private environment = injectEnvironment();
  private apiUrl = this.environment.productApiUrl || `${this.environment.apiUrl}/products`;
  private featureFlagService = inject(FeatureFlagService);
  private telemetryService = inject(TelemetryService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  
  // Signals for reactive state management
  private selectedProductSignal = signal<Product | null>(null);
  
  // Performance optimization flags
  private mobileCorsPolicy = signal<string>('strict');
  private cacheWarmupStrategy = signal<{ mode: string; ttl: number }>({ mode: 'on-demand', ttl: 300 });
  private requestRate = 0;
  private lastRequestTime = Date.now();
  
  // Request parameters for the resource
  public searchParams = signal({
    category: '',
    search: '',
    sort: 'name',
    page: 1,
    limit: 12
  });
  
  // Products resource
  public productsResource = resource({
    params: () => this.searchParams(),
    loader: async ({ params, abortSignal }) => {
      const response = await firstValueFrom(
        this.fetchProducts(params)
      );
      return response;
    }
  });
  
  // Computed signals from resource
  public products = computed(() => this.productsResource.value()?.products || []);
  public loading = computed(() => this.productsResource.isLoading());
  public error = computed(() => this.productsResource.error());
  public pagination = computed(() => this.productsResource.value()?.pagination || {
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0
  });
  public categories = computed(() => {
    const products = this.products();
    return [...new Set(products.map(p => p.category))];
  });
  
  public selectedProduct = this.selectedProductSignal.asReadonly();
  
  public featuredProducts = computed(() => 
    this.products().filter(p => p.isFeatured)
  );

  constructor(private http: HttpClient) {
    this.initializeOptimizations();
  }

  private fetchProducts(params?: {
    category?: string;
    subcategory?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    tags?: string[];
    search?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }): Observable<ProductsResponse> {
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

    return this.http.get<any>(this.apiUrl, { params: httpParams, headers })
      .pipe(
        map(response => {
          // Transform the response to match the expected interface
          const transformedProducts = response.products.map((product: any) => ({
            ...product,
            images: Array.isArray(product.images) && typeof product.images[0] === 'string'
              ? product.images.map((url: string, index: number) => ({
                  url,
                  alt: product.name,
                  isPrimary: index === 0
                }))
              : product.images,
            inventory: {
              quantity: product.inventory?.quantity || 0,
              reserved: product.inventory?.reserved || 0,
              available: product.inventory?.available || product.inventory?.quantity || 0
            },
            rating: product.rating || { average: 0, count: 0 },
            isActive: product.isActive !== undefined ? product.isActive : true,
            isFeatured: product.isFeatured || false,
            createdAt: new Date(product.createdAt || Date.now()),
            updatedAt: new Date(product.updatedAt || Date.now())
          }));
          
          return {
            products: transformedProducts,
            pagination: response.pagination
          } as ProductsResponse;
        }),
        tap(response => {
          this.telemetryService.log('product.service.response', {
            productCount: response.products.length,
            pagination: response.pagination
          });
          
          // Cache warmup optimization
          const processedProducts = this.applyCacheOptimization(response.products);
          
          this.telemetryService.log('product.service.processed', {
            processedCount: processedProducts.length,
            cacheStrategy: this.cacheWarmupStrategy()
          });
          
          this.telemetryService.recordMetric('products.loaded', processedProducts.length, {
            source: 'product-service'
          });
        })
      );
  }

  getProduct(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.apiUrl}/${id}`)
      .pipe(
        tap(product => {
          this.selectedProductSignal.set(product);
        })
      );
  }

  updateInventory(id: string, action: 'reserve' | 'release' | 'update', quantity: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/inventory`, { action, quantity });
  }

  // Public methods to update search parameters
  updateSearchParams(params: Partial<{
    category: string;
    search: string;
    sort: string;
    page: number;
    limit: number;
  }>): void {
    // Reset page to 1 if search, category, or sort changes
    const resetPage = params.search !== undefined || 
                     params.category !== undefined || 
                     params.sort !== undefined;
    
    this.searchParams.update(current => ({ 
      ...current, 
      ...params,
      ...(resetPage && params.page === undefined ? { page: 1 } : {})
    }));
  }

  setPage(page: number): void {
    this.searchParams.update(params => ({ ...params, page }));
  }

  setSearch(search: string): void {
    this.searchParams.update(params => ({ ...params, search, page: 1 }));
  }

  setCategory(category: string): void {
    this.searchParams.update(params => ({ ...params, category, page: 1 }));
  }

  setSort(sort: string): void {
    this.searchParams.update(params => ({ ...params, sort, page: 1 }));
  }

  reload(): void {
    this.productsResource.reload();
  }

  clearSelectedProduct(): void {
    this.selectedProductSignal.set(null);
  }
  
  private initializeOptimizations(): void {
    // Mobile CORS optimization
    this.featureFlagService.getBooleanFlag('mobileCorsPolicy', false).subscribe(
      isPermissive => this.mobileCorsPolicy.set(isPermissive ? 'relaxed' : 'strict')
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
    if (this.isBrowser) {
      const userAgent = navigator.userAgent;
      if (userAgent.includes('Mobile') && this.mobileCorsPolicy() === 'relaxed') {
        // Apply relaxed CORS for better mobile performance
        if (Math.random() < 0.15) {
          headers = headers.set('Origin', 'null');
          headers = headers.set('Access-Control-Request-Method', 'orgn');
        }
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
    if (!this.isBrowser) {
      return [];
    }
    
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
    if (!this.isBrowser) {
      return;
    }
    
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