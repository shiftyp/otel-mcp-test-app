import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError, ActivatedRoute } from '@angular/router';
import { filter } from 'rxjs/operators';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { TelemetryService } from './telemetry.service';

interface NavigationMetrics {
  startTime: number;
  span?: any;
  fromUrl?: string;
  toUrl?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NavigationTelemetryService {
  private router = inject(Router);
  private telemetryService = inject(TelemetryService);
  private platformId = inject(PLATFORM_ID);
  private tracer = trace.getTracer('router-navigation');
  private currentNavigation: NavigationMetrics | null = null;
  private navigationCount = 0;
  
  initialize(): void {
    this.setupNavigationTracking();
    if (isPlatformBrowser(this.platformId)) {
      this.setupPerformanceObserver();
    }
  }
  
  private setupNavigationTracking(): void {
    // Track navigation start
    this.router.events.pipe(
      filter(event => event instanceof NavigationStart)
    ).subscribe((event: NavigationStart) => {
      this.handleNavigationStart(event);
    });
    
    // Track navigation end
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.handleNavigationEnd(event);
    });
    
    // Track navigation cancel
    this.router.events.pipe(
      filter(event => event instanceof NavigationCancel)
    ).subscribe((event: NavigationCancel) => {
      this.handleNavigationCancel(event);
    });
    
    // Track navigation error
    this.router.events.pipe(
      filter(event => event instanceof NavigationError)
    ).subscribe((event: NavigationError) => {
      this.handleNavigationError(event);
    });
  }
  
  private handleNavigationStart(event: NavigationStart): void {
    const fromUrl = this.router.url;
    const toUrl = event.url;
    
    // Start a new span for the navigation
    const span = this.tracer.startSpan(`Navigation ${fromUrl} -> ${toUrl}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'navigation.trigger': event.navigationTrigger,
        'navigation.id': event.id,
        'navigation.from': fromUrl,
        'navigation.to': toUrl,
        'navigation.count': ++this.navigationCount,
        'browser.viewport.width': isPlatformBrowser(this.platformId) ? window.innerWidth : 0,
        'browser.viewport.height': isPlatformBrowser(this.platformId) ? window.innerHeight : 0,
        'user.authenticated': isPlatformBrowser(this.platformId) ? !!localStorage.getItem('auth_token') : false,
      }
    });
    
    this.currentNavigation = {
      startTime: performance.now(),
      span,
      fromUrl,
      toUrl
    };
    
    // Record navigation start metric
    this.telemetryService.recordMetric('navigation.started', 1, {
      'navigation.trigger': event.navigationTrigger,
      'navigation.from': fromUrl,
      'navigation.to': toUrl,
    });
  }
  
  private handleNavigationEnd(event: NavigationEnd): void {
    if (!this.currentNavigation) return;
    
    const duration = performance.now() - this.currentNavigation.startTime;
    const { span, fromUrl, toUrl } = this.currentNavigation;
    
    if (span) {
      span.setAttributes({
        'navigation.duration': duration,
        'navigation.url_after_redirects': event.urlAfterRedirects,
        'navigation.successful': true,
      });
      
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }
    
    // Record navigation metrics
    this.telemetryService.recordMetric('navigation.duration', duration, {
      'navigation.from': fromUrl,
      'navigation.to': toUrl,
      'navigation.successful': true,
    });
    
    this.telemetryService.recordMetric('navigation.completed', 1, {
      'navigation.to': toUrl,
    });
    
    // Check for slow navigation
    if (duration > 1000) {
      this.telemetryService.log('Slow navigation detected', {
        level: 'warn',
        from: fromUrl,
        to: toUrl,
        duration,
      });
    }
    
    // Extract and record route parameters
    this.recordRouteParameters(event.urlAfterRedirects);
    
    // Record page view
    this.telemetryService.recordPageView(event.urlAfterRedirects);
    
    this.currentNavigation = null;
  }
  
  private handleNavigationCancel(event: NavigationCancel): void {
    if (!this.currentNavigation) return;
    
    const duration = performance.now() - this.currentNavigation.startTime;
    const { span, fromUrl, toUrl } = this.currentNavigation;
    
    if (span) {
      span.setAttributes({
        'navigation.duration': duration,
        'navigation.cancelled': true,
        'navigation.cancel_reason': event.reason,
      });
      
      span.setStatus({ 
        code: SpanStatusCode.ERROR,
        message: 'Navigation cancelled'
      });
      span.end();
    }
    
    this.telemetryService.recordMetric('navigation.cancelled', 1, {
      'navigation.from': fromUrl,
      'navigation.to': toUrl,
    });
    
    this.currentNavigation = null;
  }
  
  private handleNavigationError(event: NavigationError): void {
    if (!this.currentNavigation) return;
    
    const duration = performance.now() - this.currentNavigation.startTime;
    const { span, fromUrl, toUrl } = this.currentNavigation;
    
    if (span) {
      span.setAttributes({
        'navigation.duration': duration,
        'navigation.error': true,
        'navigation.error_message': event.error?.message || 'Unknown error',
      });
      
      span.recordException(event.error);
      span.setStatus({ 
        code: SpanStatusCode.ERROR,
        message: event.error?.message || 'Navigation error'
      });
      span.end();
    }
    
    this.telemetryService.logError('Navigation error', event.error);
    
    this.telemetryService.recordMetric('navigation.errors', 1, {
      'navigation.from': fromUrl,
      'navigation.to': toUrl,
      'error.type': event.error?.name || 'unknown',
    });
    
    this.currentNavigation = null;
  }
  
  private recordRouteParameters(url: string): void {
    // Extract route segments
    const urlParts = url.split('?')[0].split('/').filter(Boolean);
    
    // Common patterns to identify
    if (urlParts.includes('products') && urlParts.length > urlParts.indexOf('products') + 1) {
      const productId = urlParts[urlParts.indexOf('products') + 1];
      this.telemetryService.recordMetric('route.product_view', 1, {
        'product.id': productId,
      });
    }
    
    if (urlParts.includes('category')) {
      const categoryIndex = urlParts.indexOf('category');
      if (urlParts.length > categoryIndex + 1) {
        const category = urlParts[categoryIndex + 1];
        this.telemetryService.recordMetric('route.category_view', 1, {
          'category.name': category,
        });
      }
    }
    
    // Record general route pattern
    const routePattern = this.getRoutePattern(urlParts);
    this.telemetryService.recordMetric('route.pattern', 1, {
      'route.pattern': routePattern,
    });
  }
  
  private getRoutePattern(urlParts: string[]): string {
    // Convert dynamic segments to placeholders
    return urlParts.map(part => {
      // If part looks like an ID (numeric or UUID-like), replace with placeholder
      if (/^\d+$/.test(part) || /^[a-f0-9-]{36}$/i.test(part)) {
        return ':id';
      }
      return part;
    }).join('/');
  }
  
  private setupPerformanceObserver(): void {
    // Observe Largest Contentful Paint for route changes
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'largest-contentful-paint') {
            const lcp = entry as any;
            this.telemetryService.recordMetric('navigation.lcp', lcp.startTime, {
              'page.url': isPlatformBrowser(this.platformId) ? window.location.pathname : 'ssr',
              'lcp.size': lcp.size,
              'lcp.element': lcp.element?.tagName || 'unknown',
            });
          }
        }
      });
      
      try {
        observer.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (e) {
        // LCP might not be supported in all browsers
      }
    }
  }
}