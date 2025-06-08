import { Injectable, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { 
  Observable, Subject, BehaviorSubject, fromEvent, interval, merge
} from 'rxjs';
import { 
  map, filter, scan, bufferTime, groupBy, mergeMap,
  distinctUntilChanged, takeUntil, shareReplay, switchMap
} from 'rxjs/operators';
import { trace } from '@opentelemetry/api';
import { ReactiveContextService } from './reactive-context.service';
import { ConfigurableTelemetryService } from './configurable-telemetry.service';

export interface ResourceTimingEvent {
  name: string;
  entryType: 'resource';
  startTime: number;
  duration: number;
  initiatorType: string;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  metrics: {
    dns: number;
    tcp: number;
    ssl: number;
    ttfb: number;
    download: number;
    redirect: number;
  };
  context: {
    traceId?: string;
    spanId?: string;
    requestId?: string;
  };
  metadata: {
    domain: string;
    path: string;
    resourceType: string;
    cached: boolean;
    compressed: boolean;
    protocol: string;
  };
}

export interface ResourceStats {
  domain: string;
  count: number;
  totalSize: number;
  avgDuration: number;
  avgTTFB: number;
  cacheHitRate: number;
  compressionRate: number;
}

@Injectable({
  providedIn: 'root'
})
export class ResourceTimingService implements OnDestroy {
  private resourceStream$ = new Subject<ResourceTimingEvent>();
  private destroy$ = new Subject<void>();
  private observer?: PerformanceObserver;
  
  // Resource stats by domain
  private domainStats$ = new BehaviorSubject<Map<string, ResourceStats>>(new Map());
  
  // Configuration
  private readonly BUFFER_SIZE = 1000;
  private readonly STATS_UPDATE_INTERVAL = 5000; // 5 seconds
  
  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private contextService: ReactiveContextService,
    private telemetryService: ConfigurableTelemetryService
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.initialize();
    }
  }
  
  private initialize(): void {
    if (!('PerformanceObserver' in window)) {
      console.warn('PerformanceObserver not supported');
      return;
    }
    
    // Create performance observer
    this.observer = new PerformanceObserver((list) => {
      const entries = list.getEntries() as PerformanceResourceTiming[];
      entries.forEach(entry => {
        const event = this.processEntry(entry);
        if (event) {
          this.resourceStream$.next(event);
        }
      });
    });
    
    // Start observing
    try {
      this.observer.observe({ entryTypes: ['resource'] });
    } catch (error) {
      console.error('Failed to start resource timing observation:', error);
    }
    
    // Set up stats aggregation
    this.setupStatsAggregation();
    
    // Set up resource monitoring patterns
    this.setupResourceMonitoring();
  }
  
  private processEntry(entry: PerformanceResourceTiming): ResourceTimingEvent | null {
    // Skip data URIs and blob URLs
    if (entry.name.startsWith('data:') || entry.name.startsWith('blob:')) {
      return null;
    }
    
    try {
      const url = new URL(entry.name);
      
      // Calculate timing metrics
      const dns = entry.domainLookupEnd - entry.domainLookupStart;
      const tcp = entry.connectEnd - entry.connectStart;
      const ssl = entry.secureConnectionStart > 0 
        ? entry.connectEnd - entry.secureConnectionStart 
        : 0;
      const ttfb = entry.responseStart - entry.requestStart;
      const download = entry.responseEnd - entry.responseStart;
      const redirect = entry.redirectEnd - entry.redirectStart;
      
      // Get current context
      const currentContext = this.getCurrentContext();
      
      // Determine resource metadata
      const metadata = {
        domain: url.hostname,
        path: url.pathname,
        resourceType: this.getResourceType(entry),
        cached: entry.transferSize === 0 && entry.decodedBodySize > 0,
        compressed: entry.encodedBodySize > 0 && entry.encodedBodySize < entry.decodedBodySize,
        protocol: entry.nextHopProtocol || 'unknown'
      };
      
      return {
        name: entry.name,
        entryType: 'resource',
        startTime: entry.startTime,
        duration: entry.duration,
        initiatorType: entry.initiatorType,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
        metrics: { dns, tcp, ssl, ttfb, download, redirect },
        context: currentContext,
        metadata
      };
    } catch (error) {
      console.debug('Failed to process resource entry:', entry.name, error);
      return null;
    }
  }
  
  private getCurrentContext(): ResourceTimingEvent['context'] {
    const activeSpan = trace.getActiveSpan();
    const context: ResourceTimingEvent['context'] = {};
    
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      context.traceId = spanContext.traceId;
      context.spanId = spanContext.spanId;
    }
    
    // Get request ID from meta tag or other source
    const requestIdMeta = document.querySelector('meta[name="request-id"]');
    if (requestIdMeta) {
      context.requestId = requestIdMeta.getAttribute('content') || undefined;
    }
    
    return context;
  }
  
  private getResourceType(entry: PerformanceResourceTiming): string {
    // Try to determine from initiator type
    if (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch') {
      return 'api';
    }
    
    // Check file extension
    const url = entry.name.toLowerCase();
    if (url.match(/\.(js|mjs|ts)$/)) return 'script';
    if (url.match(/\.(css|scss|sass|less)$/)) return 'stylesheet';
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|otf|eot)$/)) return 'font';
    if (url.match(/\.(mp4|webm|ogg|mp3|wav)$/)) return 'media';
    if (url.match(/\.(json|xml)$/)) return 'data';
    
    return entry.initiatorType || 'other';
  }
  
  private setupStatsAggregation(): void {
    // Aggregate stats periodically
    this.resourceStream$.pipe(
      bufferTime(this.STATS_UPDATE_INTERVAL),
      filter(events => events.length > 0),
      map(events => this.calculateStats(events)),
      takeUntil(this.destroy$)
    ).subscribe(stats => {
      this.domainStats$.next(stats);
    });
  }
  
  private calculateStats(events: ResourceTimingEvent[]): Map<string, ResourceStats> {
    const statsByDomain = new Map<string, ResourceStats>();
    
    // Group events by domain
    events.forEach(event => {
      const domain = event.metadata.domain;
      const existing = statsByDomain.get(domain) || {
        domain,
        count: 0,
        totalSize: 0,
        avgDuration: 0,
        avgTTFB: 0,
        cacheHitRate: 0,
        compressionRate: 0
      };
      
      // Update counts
      existing.count++;
      existing.totalSize += event.transferSize;
      
      // Update averages (running average)
      existing.avgDuration = (existing.avgDuration * (existing.count - 1) + event.duration) / existing.count;
      existing.avgTTFB = (existing.avgTTFB * (existing.count - 1) + event.metrics.ttfb) / existing.count;
      
      // Update rates
      const cacheHits = existing.cacheHitRate * (existing.count - 1) + (event.metadata.cached ? 1 : 0);
      existing.cacheHitRate = cacheHits / existing.count;
      
      const compressionHits = existing.compressionRate * (existing.count - 1) + (event.metadata.compressed ? 1 : 0);
      existing.compressionRate = compressionHits / existing.count;
      
      statsByDomain.set(domain, existing);
    });
    
    return statsByDomain;
  }
  
  private setupResourceMonitoring(): void {
    // Monitor slow resources
    this.getSlowResources$(1000).pipe(
      bufferTime(5000),
      filter(resources => resources.length > 0),
      takeUntil(this.destroy$)
    ).subscribe(slowResources => {
      this.telemetryService.recordMetric('slow_resources_count', slowResources.length, {
        resources: slowResources.slice(0, 5).map(r => ({
          name: r.name,
          duration: r.duration,
          type: r.metadata.resourceType
        }))
      });
    });
    
    // Monitor large resources
    this.getLargeResources$(1024 * 1024).pipe( // 1MB
      bufferTime(10000),
      filter(resources => resources.length > 0),
      takeUntil(this.destroy$)
    ).subscribe(largeResources => {
      this.telemetryService.recordMetric('large_resources_count', largeResources.length, {
        totalSize: largeResources.reduce((sum, r) => sum + r.transferSize, 0),
        resources: largeResources.slice(0, 3).map(r => ({
          name: r.name,
          size: r.transferSize,
          type: r.metadata.resourceType
        }))
      });
    });
    
    // Monitor cache effectiveness
    interval(30000).pipe( // Every 30 seconds
      switchMap(() => this.domainStats$),
      map(stats => {
        const domains = Array.from(stats.values());
        const totalRequests = domains.reduce((sum, d) => sum + d.count, 0);
        const totalCacheHits = domains.reduce((sum, d) => sum + (d.count * d.cacheHitRate), 0);
        return totalRequests > 0 ? totalCacheHits / totalRequests : 0;
      }),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(overallCacheRate => {
      this.telemetryService.recordMetric('resource_cache_hit_rate', overallCacheRate);
    });
  }
  
  // Public API
  
  /**
   * Get resource timing events stream
   */
  getResources$(): Observable<ResourceTimingEvent> {
    return this.resourceStream$.asObservable().pipe(
      shareReplay({ bufferSize: this.BUFFER_SIZE, refCount: true })
    );
  }
  
  /**
   * Get resources filtered by type
   */
  getResourcesByType$(type: string): Observable<ResourceTimingEvent> {
    return this.getResources$().pipe(
      filter(resource => resource.metadata.resourceType === type)
    );
  }
  
  /**
   * Get resources filtered by domain
   */
  getResourcesByDomain$(domain: string): Observable<ResourceTimingEvent> {
    return this.getResources$().pipe(
      filter(resource => resource.metadata.domain === domain)
    );
  }
  
  /**
   * Get slow resources above threshold
   */
  getSlowResources$(thresholdMs: number): Observable<ResourceTimingEvent> {
    return this.getResources$().pipe(
      filter(resource => resource.duration > thresholdMs)
    );
  }
  
  /**
   * Get large resources above size threshold
   */
  getLargeResources$(thresholdBytes: number): Observable<ResourceTimingEvent> {
    return this.getResources$().pipe(
      filter(resource => resource.transferSize > thresholdBytes)
    );
  }
  
  /**
   * Get domain statistics
   */
  getDomainStats$(): Observable<Map<string, ResourceStats>> {
    return this.domainStats$.asObservable();
  }
  
  /**
   * Get stats for specific domain
   */
  getDomainStat$(domain: string): Observable<ResourceStats | undefined> {
    return this.domainStats$.pipe(
      map(stats => stats.get(domain)),
      distinctUntilChanged()
    );
  }
  
  /**
   * Link a resource to current trace
   */
  async linkResourceToTrace(resourceUrl: string): Promise<void> {
    // Wait a bit for the resource to appear in performance timeline
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Find the resource entry
    const entries = performance.getEntriesByName(resourceUrl, 'resource') as PerformanceResourceTiming[];
    const entry = entries[entries.length - 1]; // Get most recent
    
    if (entry) {
      const event = this.processEntry(entry);
      if (event) {
        // Add current trace context
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          activeSpan.setAttributes({
            'resource.url': resourceUrl,
            'resource.duration': event.duration,
            'resource.size': event.transferSize,
            'resource.ttfb': event.metrics.ttfb,
            'resource.cached': event.metadata.cached
          });
        }
      }
    }
  }
  
  /**
   * Clear resource timing buffer
   */
  clearResourceTimings(): void {
    if ('performance' in window && 'clearResourceTimings' in performance) {
      performance.clearResourceTimings();
    }
  }
  
  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
    this.resourceStream$.complete();
    this.domainStats$.complete();
  }
}