# ADR-010: RxJS-Based Metric Batching Strategy

## Status
Accepted

## Context

OpenTelemetry metrics can generate significant network traffic when exported frequently. In browser environments, this impacts:
- Application performance through excessive network requests
- User experience due to main thread blocking
- Backend load from high-frequency metric exports
- Browser connection limits when multiple telemetry types are active

Since Angular applications already include RxJS, we can leverage its powerful operators for handling backpressure, batching, and error handling instead of implementing custom solutions.

## Decision
We will implement an RxJS Observable-based metric batching strategy that leverages the existing RxJS dependency in Angular applications to handle metric collection, batching, and export with proper backpressure handling.

The solution will:
1. Use RxJS Subjects for metric streams with built-in backpressure handling
2. Leverage RxJS operators (bufferWhen, retry, catchError) for sophisticated flow control
3. Provide separate priority lanes for critical vs. normal metrics
4. Implement automatic retry with exponential backoff for failed exports
5. Expose observable streams for real-time telemetry monitoring
6. Handle page unload events to prevent metric loss

```typescript
interface MetricBatchingConfig {
  enableBatchedMetrics: boolean;
  metricsFlushInterval: number; // milliseconds
  maxBatchSize: number; // maximum metrics per batch
  maxQueueSize: number; // maximum queued metrics
  autoFlushThreshold: number; // percentage of maxBatchSize
}

interface MetricRecord {
  name: string;
  value: number;
  attributes?: Attributes;
  timestamp: number;
  priority?: 'high' | 'normal';
}

// RxJS-based implementation
export class ConfigurableTelemetryService {
  // Separate streams for different priorities
  private metricStream$ = new Subject<MetricRecord>();
  private highPriorityStream$ = new Subject<MetricRecord>();
  
  // Configurable buffer strategy
  private metricBuffer$ = this.metricStream$.pipe(
    // Apply backpressure - drop oldest if buffer exceeds limit
    bufferCount(this.config.maxQueueSize, this.config.maxQueueSize),
    map(buffer => buffer.slice(-this.config.maxBatchSize)),
    mergeAll(),
    
    // Batch by time or size
    bufferWhen(() => 
      race(
        interval(this.config.metricsFlushInterval),
        this.metricStream$.pipe(
          scan((acc, _) => acc + 1, 0),
          filter(count => count >= this.config.maxBatchSize)
        )
      )
    ),
    
    // Filter empty batches
    filter(batch => batch.length > 0),
    
    // Retry failed exports
    mergeMap(batch => 
      from(this.exportBatch(batch)).pipe(
        retry({
          count: 3,
          delay: (error, retryCount) => 
            timer(Math.pow(2, retryCount) * 1000) // Exponential backoff
        }),
        catchError(error => {
          console.error('Failed to export metrics batch:', error);
          return EMPTY;
        })
      )
    ),
    
    // Share the subscription
    share()
  );
  
  // High priority metrics bypass batching
  private highPriorityExport$ = this.highPriorityStream$.pipe(
    concatMap(metric => 
      from(this.exportMetric(metric)).pipe(
        retry({ count: 2, delay: 1000 }),
        catchError(error => {
          console.error('Failed to export high priority metric:', error);
          return EMPTY;
        })
      )
    )
  );
  
  constructor() {
    // Subscribe to both streams
    merge(
      this.metricBuffer$,
      this.highPriorityExport$
    ).subscribe();
    
    // Flush on page unload
    fromEvent(window, 'beforeunload').pipe(
      take(1),
      tap(() => this.flush())
    ).subscribe();
  }
  
  recordMetric(name: string, value: number, attributes?: Attributes, priority: 'high' | 'normal' = 'normal') {
    const metric: MetricRecord = {
      name,
      value,
      attributes,
      timestamp: Date.now(),
      priority
    };
    
    if (!this.config.enableBatchedMetrics || priority === 'high') {
      this.highPriorityStream$.next(metric);
    } else {
      this.metricStream$.next(metric);
    }
  }
  
  // Observable for monitoring metrics
  getMetricStats$(): Observable<MetricStats> {
    return combineLatest([
      this.metricStream$.pipe(
        scan((acc, _) => acc + 1, 0),
        startWith(0)
      ),
      interval(1000)
    ]).pipe(
      map(([totalMetrics]) => ({
        totalMetrics,
        metricsPerSecond: this.calculateRate(),
        bufferSize: this.getBufferSize()
      }))
    );
  }
  
  private async exportBatch(batch: MetricRecord[]): Promise<void> {
    // Group by metric name for efficient recording
    const grouped = new Map<string, MetricRecord[]>();
    batch.forEach(record => {
      const existing = grouped.get(record.name) || [];
      existing.push(record);
      grouped.set(record.name, existing);
    });
    
    // Record all batched metrics
    for (const [name, records] of grouped) {
      const counter = this.meter.createCounter(name);
      for (const record of records) {
        counter.add(record.value, record.attributes);
      }
    }
  }
  
  flush(): void {
    // Force immediate export of pending metrics
    this.metricStream$.complete();
    this.highPriorityStream$.complete();
    // Recreate subjects for future use
    this.metricStream$ = new Subject<MetricRecord>();
    this.highPriorityStream$ = new Subject<MetricRecord>();
  }
}
```

## Example
```typescript
// Service configuration
@Injectable()
export class TelemetryService extends ConfigurableTelemetryService {
  constructor() {
    super({
      enableBatchedMetrics: true,
      metricsFlushInterval: 5000,
      maxBatchSize: 100,
      maxQueueSize: 1000
    });
  }
}

// Using priority metrics
@Metric({
  name: 'payment.failed',
  value: 1,
  priority: 'high' // Bypasses batching
})
handlePaymentFailure(error: PaymentError) {
  // Critical metric exported immediately
}

// Monitoring telemetry health
@Component({
  template: `
    <div *ngIf="metricStats$ | async as stats">
      <p>Metrics/sec: {{ stats.metricsPerSecond }}</p>
      <p>Buffer size: {{ stats.bufferSize }}</p>
    </div>
  `
})
export class TelemetryMonitor {
  metricStats$ = this.telemetry.getMetricStats$();
}
```

## Implementation Notes
- Use `takeUntil` pattern for proper subscription cleanup
- Configure different flush intervals for different environments
- Monitor buffer sizes to tune maxQueueSize appropriately
- Consider using `auditTime` for high-frequency metrics
- Implement circuit breaker pattern for persistent export failures

## Consequences

### Positive
- **Leverages existing dependency**: No additional libraries needed since RxJS is already in Angular
- **Built-in backpressure**: RxJS operators handle buffer overflow gracefully
- **Sophisticated error handling**: Retry logic with exponential backoff out of the box
- **Natural integration**: Fits perfectly with Angular's reactive patterns
- **Priority support**: Critical metrics can bypass batching for immediate export
- **Real-time monitoring**: Observable streams enable live telemetry dashboards
- **Performance improvement**: Reduced network overhead and main thread blocking

### Negative
- **Complexity**: More complex than simple array-based batching
- **Learning curve**: Requires understanding of RxJS operators and patterns
- **Debugging difficulty**: Complex operator chains can be hard to debug
- **Testing complexity**: Requires marble testing knowledge
- **Memory leak risk**: Improper subscription management can cause leaks

## References

- [RxJS Documentation](https://rxjs.dev/)
- [RxJS Backpressure Strategies](https://rxjs.dev/guide/operators#backpressure-strategy)
- [OpenTelemetry Metrics SDK Specification](https://opentelemetry.io/docs/specs/otel/metrics/sdk/)
- [Angular RxJS Best Practices](https://angular.io/guide/rx-library)