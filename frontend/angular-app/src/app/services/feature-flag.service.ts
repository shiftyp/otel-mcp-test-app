import { Injectable, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, of, timer, concat, throwError } from 'rxjs';
import { catchError, map, retry, shareReplay, switchMap, tap } from 'rxjs/operators';

export interface FlagValue<T = any> {
  value: T;
  reason: string;
  variant: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeatureFlagService {
  private flagdUrl = environment.flagdUrl || 'http://localhost:8013';
  private cache = new Map<string, Observable<any>>();
  private flagsSignal = signal<Record<string, any>>({});
  
  // Public readonly access to flags
  public flags = this.flagsSignal.asReadonly();

  constructor(private http: HttpClient) {
    // Start polling for flag updates
    this.startFlagPolling();
  }

  /**
   * Get boolean flag value
   */
  getBooleanFlag(key: string, defaultValue: boolean = false): Observable<boolean> {
    return this.evaluateFlag<boolean>(key, 'boolean', defaultValue);
  }

  /**
   * Get string flag value
   */
  getStringFlag(key: string, defaultValue: string = ''): Observable<string> {
    return this.evaluateFlag<string>(key, 'string', defaultValue);
  }

  /**
   * Get number flag value
   */
  getNumberFlag(key: string, defaultValue: number = 0): Observable<number> {
    return this.evaluateFlag<number>(key, 'number', defaultValue);
  }

  /**
   * Get object flag value
   */
  getObjectFlag<T>(key: string, defaultValue: T): Observable<T> {
    return this.evaluateFlag<T>(key, 'object', defaultValue);
  }

  /**
   * Check if feature is enabled (sync using signals)
   */
  isEnabled(key: string): boolean {
    return this.flags()[key]?.value ?? false;
  }

  /**
   * Get feature variant (for A/B testing)
   */
  getVariant(key: string): string | null {
    return this.flags()[key]?.variant ?? null;
  }

  private evaluateFlag<T>(key: string, type: string, defaultValue: T): Observable<T> {
    const cacheKey = `${key}:${type}`;
    
    if (!this.cache.has(cacheKey)) {
      const evaluation$ = this.http.post<FlagValue<T>>(
        `${this.flagdUrl}/flagd.evaluation.v1.Service/ResolveBoolean`,
        {
          flagKey: key,
          context: this.getEvaluationContext()
        }
      ).pipe(
        map(response => response.value),
        catchError(error => {
          console.warn(`Feature flag evaluation failed for ${key}:`, error);
          return of(defaultValue);
        }),
        retry({ delay: 1000, count: 2 }),
        shareReplay(1)
      );
      
      this.cache.set(cacheKey, evaluation$);
    }
    
    return this.cache.get(cacheKey)!;
  }

  private getEvaluationContext(): Record<string, any> {
    // Build context for flag evaluation
    const context: Record<string, any> = {
      timestamp: new Date().toISOString(),
      environment: environment.production ? 'production' : 'development',
      hour: new Date().getHours(),
      sessionId: this.getSessionId(),
    };

    // Add user context if available
    const userId = this.getUserId();
    if (userId) {
      context['userId'] = userId;
      context['userGroup'] = this.getUserGroup(userId);
    }

    // Add browser context
    if (typeof window !== 'undefined') {
      context['userAgent'] = window.navigator.userAgent;
      context['browser'] = this.detectBrowser();
      context['viewport'] = {
        width: window.innerWidth,
        height: window.innerHeight
      };
      context['platform'] = window.navigator.platform;
      
      // Performance context
      context['componentCount'] = document.querySelectorAll('[class*="component"]').length;
      context['scrollDepth'] = this.getScrollDepth();
      
      // Load context
      context['concurrentRequests'] = this.getConcurrentRequests();
      context['requestRate'] = this.getRequestRate();
      
      // Cart context
      const cartSize = this.getCartSize();
      if (cartSize > 0) {
        context['cartSize'] = cartSize;
      }
      
      // Test context
      const testType = this.getTestType();
      if (testType) {
        context['testType'] = testType;
      }
    }

    return context;
  }

  private getUserId(): string | null {
    // Get from auth service or localStorage
    return localStorage.getItem('userId');
  }

  private getUserGroup(userId: string): string {
    // Simple hash-based grouping for A/B tests
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    if (hash % 10 === 0) return 'beta-users';
    return 'regular-users';
  }

  private startFlagPolling(): void {
    // Poll for flag updates every 30 seconds
    const poll$ = timer(0, 30000).pipe(
      switchMap(() => this.fetchAllFlags()),
      tap(flags => this.flagsSignal.set(flags)),
      catchError(error => {
        console.error('Failed to fetch feature flags:', error);
        return of({});
      })
    );

    poll$.subscribe();
  }
  
  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
  }
  
  private detectBrowser(): string {
    const userAgent = window.navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
    if (userAgent.includes('Mobile')) return 'Mobile Safari';
    return 'Other';
  }
  
  private getScrollDepth(): number {
    const scrolled = window.scrollY;
    const viewportHeight = window.innerHeight;
    const totalHeight = document.documentElement.scrollHeight;
    const scrollPercentage = (scrolled + viewportHeight) / totalHeight;
    return Math.floor(scrollPercentage * 10); // 0-10 scale
  }
  
  private getConcurrentRequests(): number {
    // Estimate based on performance API
    if ('performance' in window) {
      const entries = performance.getEntriesByType('resource');
      const recent = entries.filter(e => e.startTime > performance.now() - 1000);
      return recent.length;
    }
    return 0;
  }
  
  private getRequestRate(): number {
    const key = 'request_rate';
    const now = Date.now();
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    
    // Clean old entries
    const recent = data.filter((t: number) => now - t < 60000);
    recent.push(now);
    
    localStorage.setItem(key, JSON.stringify(recent.slice(-100)));
    return recent.length;
  }
  
  private getCartSize(): number {
    try {
      const cart = localStorage.getItem('cart');
      if (cart) {
        const items = JSON.parse(cart);
        return Array.isArray(items) ? items.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) : 0;
      }
    } catch (e) {
      console.error('Error reading cart size:', e);
    }
    return 0;
  }
  
  private getTestType(): string | null {
    // Check URL params or environment
    const params = new URLSearchParams(window.location.search);
    return params.get('testType') || localStorage.getItem('testType');
  }

  private fetchAllFlags(): Observable<Record<string, any>> {
    // In a real implementation, this would fetch all flags at once
    // For now, we'll use the individual flag evaluation
    const flagKeys = [
      'darkMode', 
      'newCheckoutFlow', 
      'performanceMode', 
      'recommendationEngine',
      'distributedCacheMode',
      'memoryManagement',
      'inventoryAlgorithm',
      'dataFetchStrategy',
      'networkResilience',
      'mobileCorsPolicy',
      'paginationStrategy',
      'cacheWarmupStrategy',
      'sessionReplication',
      'renderingMode'
    ];
    
    return of(flagKeys).pipe(
      map(keys => {
        const flags: Record<string, any> = {};
        // This is simplified - in production you'd batch these requests
        keys.forEach(key => {
          this.getObjectFlag(key, {}).subscribe(value => {
            flags[key] = { value };
          });
        });
        return flags;
      })
    );
  }

  /**
   * Clear cache to force re-evaluation
   */
  clearCache(): void {
    this.cache.clear();
    this.startFlagPolling();
  }
}