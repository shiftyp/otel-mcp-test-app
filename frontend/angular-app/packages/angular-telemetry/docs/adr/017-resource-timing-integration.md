# ADR 017: Resource Timing Integration

## Status
Accepted

## Context
The Resource Timing API provides detailed network timing information for resources loaded by the browser. Currently, this valuable performance data is not integrated with our OpenTelemetry instrumentation, resulting in:
- Missing visibility into resource load performance
- No correlation between resource timing and application traces
- Inability to identify slow resources impacting user experience
- Lack of resource performance trends over time

Integrating Resource Timing with our telemetry through RxJS streams would provide comprehensive performance monitoring.

## Decision
We will implement Resource Timing integration that:

1. **Observes Resource Entries**: Convert PerformanceObserver events to RxJS streams
2. **Enriches with Context**: Add trace and request context to resource metrics
3. **Filters and Aggregates**: Process resource data based on type and importance
4. **Correlates with Spans**: Link resources to the operations that triggered them
5. **Provides Analytics**: Generate insights about resource performance

## Implementation Details

### Resource Timing Stream
```typescript
interface ResourceTimingEvent {
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
    ttfb: number;
    download: number;
  };
  context: {
    traceId?: string;
    spanId?: string;
    requestId?: string;
  };
}

class ResourceTimingService {
  private resourceStream$ = new Subject<ResourceTimingEvent>();
  
  initialize(): void {
    if (!('PerformanceObserver' in window)) return;
    
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries() as PerformanceResourceTiming[];
      entries.forEach(entry => {
        this.resourceStream$.next(this.processEntry(entry));
      });
    });
    
    observer.observe({ entryTypes: ['resource'] });
  }
  
  private processEntry(entry: PerformanceResourceTiming): ResourceTimingEvent {
    const dns = entry.domainLookupEnd - entry.domainLookupStart;
    const tcp = entry.connectEnd - entry.connectStart;
    const ttfb = entry.responseStart - entry.requestStart;
    const download = entry.responseEnd - entry.responseStart;
    
    return {
      name: entry.name,
      entryType: 'resource',
      startTime: entry.startTime,
      duration: entry.duration,
      initiatorType: entry.initiatorType,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      metrics: { dns, tcp, ttfb, download },
      context: this.getCurrentContext()
    };
  }
}
```

### Stream Processing
```typescript
// Critical resource monitoring
resourceTiming.resources$.pipe(
  filter(resource => resource.initiatorType === 'script' || resource.initiatorType === 'link'),
  filter(resource => resource.duration > 1000), // Slow resources
  bufferTime(5000),
  filter(buffer => buffer.length > 0)
).subscribe(slowResources => {
  telemetry.recordMetric('slow_resources_count', slowResources.length, {
    resources: slowResources.map(r => r.name)
  });
});

// Resource size analysis
resourceTiming.resources$.pipe(
  groupBy(resource => new URL(resource.name).hostname),
  mergeMap(group$ => group$.pipe(
    scan((acc, resource) => ({
      domain: group$.key,
      count: acc.count + 1,
      totalSize: acc.totalSize + resource.transferSize,
      avgDuration: (acc.avgDuration * acc.count + resource.duration) / (acc.count + 1)
    }), { domain: group$.key, count: 0, totalSize: 0, avgDuration: 0 })
  ))
).subscribe(domainStats => {
  console.log(`Domain ${domainStats.domain}: ${domainStats.count} resources, ${domainStats.totalSize} bytes, ${domainStats.avgDuration}ms avg`);
});
```

### Integration with Traces
```typescript
class TracedHttpClient {
  get<T>(url: string): Observable<T> {
    const span = trace.getTracer('http').startSpan(`HTTP GET ${url}`);
    
    return this.http.get<T>(url).pipe(
      tap(() => {
        // Wait for resource timing entry
        this.resourceTiming.resources$.pipe(
          filter(resource => resource.name === url),
          take(1),
          timeout(5000)
        ).subscribe(resource => {
          span.setAttributes({
            'http.resource.duration': resource.duration,
            'http.resource.transfer_size': resource.transferSize,
            'http.resource.ttfb': resource.metrics.ttfb
          });
        });
      }),
      finalize(() => span.end())
    );
  }
}
```

## Consequences

### Positive
- **Complete Performance Picture**: Combines application and network performance
- **Root Cause Analysis**: Identify if slowness is app or resource related
- **Third-Party Monitoring**: Track performance of external resources
- **Data-Driven Optimization**: Identify which resources to optimize
- **Automatic Correlation**: Links resources to application operations

### Negative
- **Browser API Dependency**: Requires PerformanceObserver support
- **Memory Usage**: Storing resource timing data
- **Noise**: Many resources may not be relevant
- **Privacy**: May expose information about third-party resources

### Mitigation Strategies
- Feature detection for browser compatibility
- Implement data retention policies
- Filter resources by relevance
- Respect privacy settings and regulations