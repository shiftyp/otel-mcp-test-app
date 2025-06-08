import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TelemetryService } from './telemetry.service';
import { trace, SpanKind } from '@opentelemetry/api';

interface ResourceMetrics {
  url: string;
  type: string;
  duration: number;
  transferSize: number;
  decodedBodySize: number;
  startTime: number;
  responseEnd: number;
  dnsLookupTime: number;
  tcpConnectionTime: number;
  tlsNegotiationTime: number;
  requestTime: number;
  responseTime: number;
  cacheHit: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ResourceTimingService {
  private telemetryService = inject(TelemetryService);
  private platformId = inject(PLATFORM_ID);
  private tracer = trace.getTracer('resource-timing');
  private observedResources = new Set<string>();
  private observer: PerformanceObserver | null = null;
  
  initialize(): void {
    // Only initialize in browser environment
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    
    if (!('PerformanceObserver' in window)) {
      console.warn('PerformanceObserver not supported');
      return;
    }
    
    this.setupResourceObserver();
    this.setupLongTaskObserver();
    this.trackInitialResources();
  }
  
  private setupResourceObserver(): void {
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'resource') {
          this.processResourceEntry(entry as PerformanceResourceTiming);
        }
      }
    });
    
    try {
      this.observer.observe({ entryTypes: ['resource'] });
    } catch (e) {
      console.warn('Failed to observe resource timings:', e);
    }
  }
  
  private setupLongTaskObserver(): void {
    if (!('PerformanceLongTaskTiming' in window)) {
      return;
    }
    
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.processLongTask(entry as any);
      }
    });
    
    try {
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // Long task timing might not be supported
    }
  }
  
  private trackInitialResources(): void {
    // Process resources that loaded before our observer started
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    resources.forEach(resource => this.processResourceEntry(resource));
  }
  
  private processResourceEntry(entry: PerformanceResourceTiming): void {
    // Avoid processing the same resource multiple times
    const resourceKey = `${entry.name}-${entry.startTime}`;
    if (this.observedResources.has(resourceKey)) {
      return;
    }
    this.observedResources.add(resourceKey);
    
    const metrics = this.extractResourceMetrics(entry);
    
    // Create a span for the resource load
    const span = this.tracer.startSpan(`Resource ${metrics.type} ${metrics.url}`, {
      kind: SpanKind.CLIENT,
      startTime: metrics.startTime,
      attributes: {
        'resource.type': metrics.type,
        'resource.url': metrics.url,
        'resource.duration': metrics.duration,
        'resource.transfer_size': metrics.transferSize,
        'resource.decoded_body_size': metrics.decodedBodySize,
        'resource.cache_hit': metrics.cacheHit,
        'resource.protocol': entry.nextHopProtocol || 'unknown',
        'timing.dns': metrics.dnsLookupTime,
        'timing.tcp': metrics.tcpConnectionTime,
        'timing.tls': metrics.tlsNegotiationTime,
        'timing.request': metrics.requestTime,
        'timing.response': metrics.responseTime,
      }
    });
    
    span.end(metrics.responseEnd);
    
    // Record metrics
    this.recordResourceMetrics(metrics);
    
    // Check for performance issues
    this.checkResourcePerformance(metrics);
  }
  
  private extractResourceMetrics(entry: PerformanceResourceTiming): ResourceMetrics {
    const url = new URL(entry.name, window.location.origin);
    const type = this.getResourceType(entry);
    
    return {
      url: url.pathname,
      type,
      duration: entry.duration,
      transferSize: entry.transferSize,
      decodedBodySize: entry.decodedBodySize || 0,
      startTime: entry.startTime,
      responseEnd: entry.responseEnd,
      dnsLookupTime: entry.domainLookupEnd - entry.domainLookupStart,
      tcpConnectionTime: entry.connectEnd - entry.connectStart,
      tlsNegotiationTime: entry.secureConnectionStart > 0 
        ? entry.connectEnd - entry.secureConnectionStart 
        : 0,
      requestTime: entry.responseStart - entry.requestStart,
      responseTime: entry.responseEnd - entry.responseStart,
      cacheHit: entry.transferSize === 0 && entry.decodedBodySize > 0,
    };
  }
  
  private getResourceType(entry: PerformanceResourceTiming): string {
    // Check initiatorType first
    if (entry.initiatorType) {
      return entry.initiatorType;
    }
    
    // Fallback to checking file extension
    const url = entry.name.toLowerCase();
    if (url.match(/\.(js|mjs)$/)) return 'script';
    if (url.match(/\.css$/)) return 'stylesheet';
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|eot)$/)) return 'font';
    if (url.includes('/api/')) return 'api';
    
    return 'other';
  }
  
  private recordResourceMetrics(metrics: ResourceMetrics): void {
    // Duration histogram by resource type
    this.telemetryService.recordMetric('resource.duration', metrics.duration, {
      'resource.type': metrics.type,
      'resource.cached': metrics.cacheHit,
    });
    
    // Transfer size histogram
    if (metrics.transferSize > 0) {
      this.telemetryService.recordMetric('resource.transfer_size', metrics.transferSize, {
        'resource.type': metrics.type,
      });
    }
    
    // Count resources by type
    this.telemetryService.recordMetric('resource.count', 1, {
      'resource.type': metrics.type,
      'resource.cached': metrics.cacheHit,
    });
    
    // API-specific metrics
    if (metrics.type === 'api' || metrics.url.includes('/api/')) {
      this.telemetryService.recordMetric('api.resource.duration', metrics.duration, {
        'api.endpoint': metrics.url,
      });
    }
  }
  
  private checkResourcePerformance(metrics: ResourceMetrics): void {
    // Check for slow resources
    const thresholds = {
      script: 1000,
      stylesheet: 500,
      image: 2000,
      font: 1000,
      api: 3000,
      other: 2000,
    };
    
    const threshold = thresholds[metrics.type as keyof typeof thresholds] || 2000;
    
    if (metrics.duration > threshold) {
      this.telemetryService.log('Slow resource detected', {
        level: 'warn',
        'resource.url': metrics.url,
        'resource.type': metrics.type,
        'resource.duration': metrics.duration,
        'resource.threshold': threshold,
      });
      
      this.telemetryService.recordMetric('resource.slow', 1, {
        'resource.type': metrics.type,
      });
    }
    
    // Check for large resources
    const sizeThreshold = 500 * 1024; // 500KB
    if (metrics.transferSize > sizeThreshold) {
      this.telemetryService.log('Large resource detected', {
        level: 'warn',
        'resource.url': metrics.url,
        'resource.type': metrics.type,
        'resource.size': metrics.transferSize,
        'resource.size_mb': (metrics.transferSize / 1024 / 1024).toFixed(2),
      });
      
      this.telemetryService.recordMetric('resource.large', 1, {
        'resource.type': metrics.type,
      });
    }
  }
  
  private processLongTask(entry: any): void {
    const duration = entry.duration;
    const attribution = entry.attribution?.[0];
    
    this.telemetryService.log('Long task detected', {
      level: 'warn',
      'longtask.duration': duration,
      'longtask.name': entry.name,
      'longtask.container_type': attribution?.containerType,
      'longtask.container_name': attribution?.containerName,
      'longtask.container_id': attribution?.containerId,
    });
    
    this.telemetryService.recordMetric('longtask.duration', duration);
    this.telemetryService.recordMetric('longtask.count', 1);
    
    // Create a span for the long task
    const span = this.tracer.startSpan('Long Task', {
      startTime: entry.startTime,
      attributes: {
        'longtask.duration': duration,
        'longtask.threshold': 50, // Long tasks are > 50ms
      }
    });
    
    span.end(entry.startTime + duration);
  }
  
  // Get resource timing summary
  getResourceSummary(): Record<string, any> {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const summary: Record<string, any> = {
      total: resources.length,
      byType: {},
      slowest: [],
      largest: [],
      cached: 0,
    };
    
    // Group by type
    resources.forEach(resource => {
      const type = this.getResourceType(resource);
      if (!summary['byType'][type]) {
        summary['byType'][type] = {
          count: 0,
          totalDuration: 0,
          totalSize: 0,
        };
      }
      
      summary['byType'][type].count++;
      summary['byType'][type].totalDuration += resource.duration;
      summary['byType'][type].totalSize += resource.transferSize;
      
      if (resource.transferSize === 0 && resource.decodedBodySize > 0) {
        summary['cached']++;
      }
    });
    
    // Find slowest resources
    summary['slowest'] = resources
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5)
      .map(r => ({
        url: r.name,
        duration: r.duration,
        type: this.getResourceType(r),
      }));
    
    // Find largest resources
    summary['largest'] = resources
      .filter(r => r.transferSize > 0)
      .sort((a, b) => b.transferSize - a.transferSize)
      .slice(0, 5)
      .map(r => ({
        url: r.name,
        size: r.transferSize,
        type: this.getResourceType(r),
      }));
    
    return summary;
  }
  
  // Clean up
  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.observedResources.clear();
  }
}