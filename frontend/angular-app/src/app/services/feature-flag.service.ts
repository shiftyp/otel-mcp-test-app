import { Injectable, signal, effect, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TransferState, makeStateKey } from '@angular/core';
import { Observable, of, timer, concat, throwError } from 'rxjs';
import { catchError, map, retry, shareReplay, switchMap, tap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { injectEnvironment } from '../providers/environment.provider';

export interface FlagValue<T = any> {
  value: T;
  reason: string;
  variant: string;
}

// State keys for transfer state
const SESSION_ID_KEY = makeStateKey<string>('sessionId');
const USER_ID_KEY = makeStateKey<string>('userId');
const TEST_TYPE_KEY = makeStateKey<string>('testType');

@Injectable({
  providedIn: 'root'
})
export class FeatureFlagService {
  private environment = injectEnvironment();
  private flagdUrl = this.environment.flagdUrl || 'http://localhost:8013';
  private cache = new Map<string, Observable<any>>();
  private flagsSignal = signal<Record<string, any>>({});
  
  // Public readonly access to flags
  public flags = this.flagsSignal.asReadonly();

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object,
    private transferState: TransferState,
    private authService: AuthService
  ) {
    // Start polling for flag updates only in browser
    if (isPlatformBrowser(this.platformId)) {
      this.startFlagPolling();
    }
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
      // Use OFREP endpoint for flag evaluation
      const evaluation$ = this.http.post<any>(
        `${this.flagdUrl}/ofrep/v1/evaluate/flags/${key}`,
        {
          context: this.getEvaluationContext()
        }
      ).pipe(
        map(response => {
          // OFREP response format
          if (response && response.value !== undefined) {
            return response.value as T;
          }
          return defaultValue;
        }),
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
      environment: this.environment.production ? 'production' : 'development',
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
      context['platform'] = isPlatformBrowser(this.platformId) ? (window.navigator as any).userAgentData?.platform || window.navigator.platform : 'server';
      
      // Performance context
      context['componentCount'] = isPlatformBrowser(this.platformId) ? document.querySelectorAll('[class*="component"]').length : 0;
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
    // Check transfer state first
    if (this.transferState.hasKey(USER_ID_KEY)) {
      const userId = this.transferState.get(USER_ID_KEY, null);
      if (isPlatformBrowser(this.platformId)) {
        this.transferState.remove(USER_ID_KEY);
      }
      return userId;
    }

    // Try to get from auth service first
    const currentUser = this.authService.currentUser();
    if (currentUser?.id) {
      return currentUser.id;
    }

    if (!isPlatformBrowser(this.platformId)) {
      // Server-side: In a real app, you'd check cookies here
      // For now, return null which will exclude user-specific flags
      return null;
    }
    
    // Client-side: fallback to localStorage (for backward compatibility)
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        return user.id || null;
      } catch (e) {
        // Invalid JSON in localStorage
      }
    }
    
    return localStorage.getItem('userId'); // Legacy fallback
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
    // Check if we have a session ID in transfer state
    if (this.transferState.hasKey(SESSION_ID_KEY)) {
      const sessionId = this.transferState.get(SESSION_ID_KEY, '');
      // Remove from transfer state after reading (only on client)
      if (isPlatformBrowser(this.platformId)) {
        this.transferState.remove(SESSION_ID_KEY);
      }
      return sessionId;
    }

    if (isPlatformBrowser(this.platformId)) {
      // Client-side: check sessionStorage first
      let sessionId = sessionStorage.getItem('sessionId');
      if (!sessionId) {
        sessionId = 'session_' + Math.random().toString(36).substring(2, 11);
        sessionStorage.setItem('sessionId', sessionId);
      }
      return sessionId;
    } else {
      // Server-side: generate and store in transfer state
      const sessionId = 'session_' + Math.random().toString(36).substring(2, 11);
      this.transferState.set(SESSION_ID_KEY, sessionId);
      return sessionId;
    }
  }
  
  private detectBrowser(): string {
    if (!isPlatformBrowser(this.platformId)) {
      return 'SSR';
    }
    const userAgent = window.navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
    if (userAgent.includes('Mobile')) return 'Mobile Safari';
    return 'Other';
  }
  
  private getScrollDepth(): number {
    if (!isPlatformBrowser(this.platformId)) {
      return 0;
    }
    const scrolled = window.scrollY;
    const viewportHeight = window.innerHeight;
    const totalHeight = document.documentElement.scrollHeight;
    const scrollPercentage = (scrolled + viewportHeight) / totalHeight;
    return Math.floor(scrollPercentage * 10); // 0-10 scale
  }
  
  private getConcurrentRequests(): number {
    if (!isPlatformBrowser(this.platformId)) {
      return 0;
    }
    // Estimate based on performance API
    if ('performance' in window) {
      const entries = performance.getEntriesByType('resource');
      const recent = entries.filter(e => e.startTime > performance.now() - 1000);
      return recent.length;
    }
    return 0;
  }
  
  private getRequestRate(): number {
    if (!isPlatformBrowser(this.platformId)) {
      return 0;
    }
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
    if (!isPlatformBrowser(this.platformId)) {
      return 0;
    }
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
    // Check transfer state first
    if (this.transferState.hasKey(TEST_TYPE_KEY)) {
      const testType = this.transferState.get(TEST_TYPE_KEY, null);
      if (isPlatformBrowser(this.platformId)) {
        this.transferState.remove(TEST_TYPE_KEY);
      }
      return testType;
    }

    if (!isPlatformBrowser(this.platformId)) {
      // Server-side: return null, test type is typically set client-side
      return null;
    }
    
    // Client-side: check URL params or localStorage
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('testType') || localStorage.getItem('testType');
    }
    return null;
  }

  private fetchAllFlags(): Observable<Record<string, any>> {
    // Use OFREP bulk evaluation endpoint
    return this.http.post<any>(
      `${this.flagdUrl}/ofrep/v1/evaluate/flags`,
      {
        context: this.getEvaluationContext()
      }
    ).pipe(
      map(response => {
        const flags: Record<string, any> = {};
        
        // OFREP bulk response format
        if (response && response.flags) {
          Object.entries(response.flags).forEach(([key, flagData]: [string, any]) => {
            flags[key] = {
              value: flagData.value,
              variant: flagData.variant,
              reason: flagData.reason
            };
          });
        }
        
        return flags;
      }),
      catchError(error => {
        console.error('Failed to fetch all feature flags:', error);
        return of({});
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