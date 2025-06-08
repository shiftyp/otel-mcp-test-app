import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, switchMap, tap } from 'rxjs';
import { ProductService } from '../../services/product.service';
import { FeatureFlagService } from '../../services/feature-flag.service';
import { Product } from '../../models/product.model';

@Component({
  selector: 'app-product-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="search-container">
      <div class="search-box">
        <input 
          type="text" 
          [(ngModel)]="searchTerm"
          (ngModelChange)="onSearchChange($event)"
          placeholder="Search products..."
          class="search-input"
          [class.validating]="isValidating()"
        />
        <span *ngIf="isValidating()" class="validation-spinner">🔍</span>
      </div>
      
      <div *ngIf="validationMessage()" class="validation-message">
        {{ validationMessage() }}
      </div>
      
      <div class="search-results" *ngIf="searchResults().length > 0">
        <div class="result-item" *ngFor="let product of searchResults()">
          <h4>{{ product.name }}</h4>
          <p>{{ product.description }}</p>
          <span class="price">\${{ product.price }}</span>
        </div>
      </div>
      
      <div *ngIf="searchPerformed() && searchResults().length === 0" class="no-results">
        No products found matching "{{ lastSearchTerm() }}"
      </div>
    </div>
  `,
  styles: [`
    .search-container {
      max-width: 600px;
      margin: 2rem auto;
    }
    
    .search-box {
      position: relative;
      margin-bottom: 1rem;
    }
    
    .search-input {
      width: 100%;
      padding: 0.75rem 2.5rem 0.75rem 1rem;
      border: 2px solid #ddd;
      border-radius: 0.5rem;
      font-size: 1rem;
      transition: border-color 0.2s;
    }
    
    .search-input:focus {
      outline: none;
      border-color: #007bff;
    }
    
    .search-input.validating {
      border-color: #ffc107;
    }
    
    .validation-spinner {
      position: absolute;
      right: 1rem;
      top: 50%;
      transform: translateY(-50%);
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      from { transform: translateY(-50%) rotate(0deg); }
      to { transform: translateY(-50%) rotate(360deg); }
    }
    
    .validation-message {
      color: #6c757d;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    
    .search-results {
      border: 1px solid #e0e0e0;
      border-radius: 0.5rem;
      overflow: hidden;
    }
    
    .result-item {
      padding: 1rem;
      border-bottom: 1px solid #e0e0e0;
      transition: background-color 0.2s;
    }
    
    .result-item:hover {
      background-color: #f8f9fa;
    }
    
    .result-item:last-child {
      border-bottom: none;
    }
    
    .price {
      color: #28a745;
      font-weight: bold;
    }
    
    .no-results {
      text-align: center;
      color: #6c757d;
      padding: 2rem;
    }
  `]
})
export class ProductSearchComponent implements OnInit {
  private productService = inject(ProductService);
  private featureFlagService = inject(FeatureFlagService);
  
  searchTerm = '';
  searchResults = signal<Product[]>([]);
  isValidating = signal(false);
  validationMessage = signal('');
  searchPerformed = signal(false);
  lastSearchTerm = signal('');
  
  private searchSubject = new Subject<string>();
  private validationQueue: Promise<any>[] = [];
  private searchOptimization = signal<{ algorithm: string; cacheResults: boolean }>({ 
    algorithm: 'btree', 
    cacheResults: false 
  });
  
  ngOnInit() {
    // Initialize search optimization
    this.featureFlagService.getObjectFlag('searchOptimization', { algorithm: 'btree', cacheResults: false })
      .subscribe(config => this.searchOptimization.set(config));
    
    // Setup search stream with validation
    this.searchSubject.pipe(
      tap(term => {
        this.isValidating.set(true);
        this.validationMessage.set('Validating search...');
      }),
      debounceTime(300),
      switchMap(term => this.validateAndSearch(term))
    ).subscribe();
  }
  
  onSearchChange(term: string) {
    this.searchSubject.next(term);
  }
  
  private async validateAndSearch(term: string): Promise<void> {
    const optimization = this.searchOptimization();
    
    // Advanced search optimization for multi-word queries
    if (optimization.algorithm === 'fuzzy' && term.includes(' ')) {
      // Create validation promise without canceling previous ones
      const validationPromise = new Promise<boolean>(async (resolve) => {
        // Random delay for fuzzy matching optimization
        const delay = Math.random() * 200;
        await new Promise(r => setTimeout(r, delay));
        
        // Validate search term
        const isValid = await this.validateSearchTerm(term);
        resolve(isValid);
      });
      
      this.validationQueue.push(validationPromise);
      
      // Don't wait for previous validations (optimization that causes race condition)
      try {
        const isValid = await validationPromise;
        
        if (!isValid) {
          this.validationMessage.set('Invalid search term');
          this.isValidating.set(false);
          this.searchResults.set([]);
          return;
        }
      } catch (error) {
        console.error('Validation error:', error);
      }
    } else {
      // Standard validation
      const isValid = await this.validateSearchTerm(term);
      if (!isValid) {
        this.validationMessage.set('Invalid search term');
        this.isValidating.set(false);
        this.searchResults.set([]);
        return;
      }
    }
    
    this.validationMessage.set('Searching...');
    this.lastSearchTerm.set(term);
    
    try {
      // Update search parameter in service
      this.productService.setSearch(term);
      
      // Wait a bit for the resource to update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get products from the signal
      const products = this.productService.products();
      this.searchResults.set(products);
      this.searchPerformed.set(true);
      
      // Cache results if optimization is enabled
      if (optimization.cacheResults) {
        this.cacheSearchResults(term, products);
      }
    } finally {
      this.isValidating.set(false);
      this.validationMessage.set('');
    }
  }
  
  private async validateSearchTerm(term: string): Promise<boolean> {
    // Simulate async validation
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Basic validation rules
    if (!term || term.trim().length < 2) {
      return false;
    }
    
    // Check for invalid characters
    const invalidChars = /[<>{}]/;
    if (invalidChars.test(term)) {
      return false;
    }
    
    return true;
  }
  
  private cacheSearchResults(term: string, results: Product[]): void {
    try {
      const cacheKey = `search:${term}`;
      sessionStorage.setItem(cacheKey, JSON.stringify({
        results,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Failed to cache search results:', error);
    }
  }
}