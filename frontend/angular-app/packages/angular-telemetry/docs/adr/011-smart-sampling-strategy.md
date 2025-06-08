# ADR-011: Smart Sampling Strategy

## Status
Accepted

## Context

In production browser applications, telemetry can quickly become overwhelming:
- High-frequency operations (mouse moves, scroll events, signal reads) generate excessive spans
- Important but rare operations (errors, slow operations) can be lost in the noise
- Fixed sampling rates either miss important events or generate too much data
- Different environments (development, staging, production) need different sampling strategies
- Users on slow connections or older devices are disproportionately affected by telemetry overhead

Traditional sampling approaches (random sampling, fixed rates) don't adapt to the actual importance or frequency of operations, leading to either data loss or data overload.

## Decision
We will implement a smart sampling strategy that dynamically adjusts sampling rates based on multiple factors to optimize the signal-to-noise ratio in telemetry data.

The strategy will:
1. Use adaptive sampling that reduces rates for high-frequency operations
2. Always sample errors and slow operations regardless of frequency
3. Apply environment-specific multipliers (higher in dev, lower in prod)
4. Consider client context (connection speed, device capabilities)
5. Implement sampling budgets to cap total telemetry volume
6. Track sampling metadata for accurate statistical analysis

```typescript
interface SmartSamplingConfig {
  baseRate: number;                    // Base sampling rate (0.0-1.0)
  minRate: number;                     // Minimum rate (never go below)
  maxRate: number;                     // Maximum rate (never go above)
  adaptiveWindow: number;              // Time window for frequency calculation (ms)
  importanceThreshold: number;         // Duration threshold for "important" operations (ms)
  budgetPerMinute: number;            // Maximum spans per minute
  environmentMultipliers: {
    development: number;              // e.g., 10x in dev
    staging: number;                  // e.g., 5x in staging
    production: number;               // e.g., 1x in production
  };
}

export class RxJSSmartSampler {
  // Track operation frequencies using RxJS
  private operationStreams = new Map<string, Subject<OperationEvent>>();
  private samplingDecisions$ = new Subject<SamplingDecision>();
  
  // Budget control using scan operator
  private budgetControl$ = this.samplingDecisions$.pipe(
    scan((budget, decision) => {
      if (decision.sampled) {
        return Math.max(0, budget - 1);
      }
      return budget;
    }, this.config.budgetPerMinute),
    startWith(this.config.budgetPerMinute),
    // Refill budget every minute
    switchMap(budget => 
      interval(60000).pipe(
        mapTo(this.config.budgetPerMinute),
        startWith(budget)
      )
    ),
    shareReplay(1)
  );
  
  // Adaptive frequency tracking
  private getOperationFrequency$(spanName: string): Observable<number> {
    if (!this.operationStreams.has(spanName)) {
      this.operationStreams.set(spanName, new Subject<OperationEvent>());
    }
    
    return this.operationStreams.get(spanName)!.pipe(
      // Count operations in sliding window
      bufferTime(this.config.adaptiveWindow, 100),
      map(events => events.length),
      scan((acc, count) => {
        // Exponential moving average
        const alpha = 0.2;
        return alpha * count + (1 - alpha) * acc;
      }, 0),
      startWith(0),
      shareReplay(1)
    );
  }
  
  shouldSample$(spanName: string, attributes$: Observable<SpanAttributes>): Observable<SamplingResult> {
    return combineLatest([
      attributes$,
      this.getOperationFrequency$(spanName),
      this.budgetControl$,
      this.getEnvironmentMultiplier$(),
      this.getClientContext$()
    ]).pipe(
      map(([attributes, frequency, budget, envMultiplier, clientContext]) => {
        // Priority 1: Always sample based on status/criticality
        const status = attributes['status'] || attributes['level'];
        const criticality = attributes['criticality'] || 'normal';
        
        // Always sample errors, warnings in production, or critical operations
        if (attributes['error'] === true || 
            status === 'error' || 
            criticality === 'critical') {
          return { 
            decision: true, 
            attributes: { 'sampling.reason': 'error_or_critical' } 
          };
        }
        
        // Always sample warnings in non-production
        if ((status === 'warning' || attributes['warn'] === true) && 
            envMultiplier > 1) {
          return { 
            decision: true, 
            attributes: { 'sampling.reason': 'warning_in_dev' } 
          };
        }
        
        // Always sample slow operations
        if (attributes['duration.ms'] > this.config.importanceThreshold) {
          return { 
            decision: true, 
            attributes: { 'sampling.reason': 'slow_operation' } 
          };
        }
        
        // Always sample operations marked as important
        if (attributes['important'] === true || 
            attributes['alwaysSample'] === true) {
          return { 
            decision: true, 
            attributes: { 'sampling.reason': 'marked_important' } 
          };
        }
        
        // Check budget
        if (budget <= 0) {
          return { 
            decision: false, 
            attributes: { 'sampling.reason': 'budget_exceeded' } 
          };
        }
        
        // Calculate adaptive rate
        const baseRate = this.config.baseRate / (1 + Math.log10(1 + frequency));
        const environmentRate = baseRate * envMultiplier;
        const contextualRate = environmentRate * clientContext.multiplier;
        const finalRate = Math.max(
          this.config.minRate, 
          Math.min(this.config.maxRate, contextualRate)
        );
        
        // Make sampling decision
        const decision = Math.random() < finalRate;
        
        return {
          decision,
          attributes: {
            'sampling.rate': finalRate,
            'sampling.frequency': frequency,
            'sampling.budget': budget,
            'sampling.reason': decision ? 'adaptive' : 'rate_limited'
          }
        };
      }),
      tap(result => {
        // Record sampling decision
        this.samplingDecisions$.next({
          spanName,
          sampled: result.decision,
          timestamp: Date.now()
        });
        
        // Track operation
        this.operationStreams.get(spanName)?.next({
          timestamp: Date.now(),
          sampled: result.decision
        });
      })
    );
  }
  
  // Real-time sampling statistics
  getSamplingStats$(): Observable<SamplingStats> {
    return this.samplingDecisions$.pipe(
      bufferTime(1000),
      map(decisions => ({
        totalDecisions: decisions.length,
        sampledCount: decisions.filter(d => d.sampled).length,
        samplingRate: decisions.length > 0 
          ? decisions.filter(d => d.sampled).length / decisions.length 
          : 0,
        byOperation: this.groupByOperation(decisions)
      })),
      shareReplay(1)
    );
  }
}
```

## Example
```typescript
// Configuration
const samplingConfig: SmartSamplingConfig = {
  baseRate: 0.1,
  minRate: 0.001,
  maxRate: 1.0,
  adaptiveWindow: 10000, // 10 seconds
  importanceThreshold: 1000, // 1 second
  budgetPerMinute: 1000,
  environmentMultipliers: {
    development: 10,
    staging: 5,
    production: 1
  }
};

// Usage with decorators - always sampled due to criticality
@Traced({
  sampling: 'smart',
  attributes: { criticality: 'critical' }
})
async processPayment(paymentData: PaymentData) {
  // Critical operations always sampled
}

// Error handling - always sampled
@Traced({ sampling: 'smart' })
async fetchUserData(userId: string) {
  try {
    return await this.api.getUser(userId);
  } catch (error) {
    // This span will be marked with error=true and always sampled
    throw error;
  }
}

// Manual importance marking
@Logged({
  level: 'warn', // Warnings always sampled in dev/staging
  attributes: { important: true }
})
handleRateLimitWarning() {
  // Important operations bypass frequency-based sampling
}

// Monitoring sampling effectiveness
@Component({
  template: `
    <div *ngIf="samplingStats$ | async as stats">
      <p>Sampling rate: {{ (stats.samplingRate * 100).toFixed(1) }}%</p>
      <p>Operations tracked: {{ stats.byOperation.size }}</p>
    </div>
  `
})
export class SamplingMonitor {
  samplingStats$ = this.sampler.getSamplingStats$();
}
```

## Implementation Notes
- Use `shareReplay(1)` for frequency tracking to avoid recalculation
- Implement proper cleanup for operation streams to prevent memory leaks
- Consider using `distinctUntilChanged` for environment/client context
- Monitor sampling statistics to tune configuration
- Use `auditTime` for very high-frequency operations

## Consequences

### Positive
- **Captures critical operations**: Errors and slow operations are always sampled
- **Reduces noise**: High-frequency operations are intelligently down-sampled
- **Adaptive behavior**: Automatically adjusts to application patterns
- **Client-aware**: Respects device capabilities and network conditions
- **Cost control**: Sampling budgets provide predictable telemetry costs
- **Better insights**: Higher signal-to-noise ratio in telemetry data
- **Development friendly**: Higher sampling rates in non-production environments
- **RxJS integration**: Leverages reactive patterns for real-time adaptation

### Negative
- **Complexity**: More complex than fixed-rate sampling
- **Configuration overhead**: Requires tuning for optimal results
- **Statistical challenges**: Variable sampling complicates analysis
- **Memory usage**: Tracking operation frequencies requires memory
- **Potential bias**: May miss patterns in frequently down-sampled operations

## References

- [OpenTelemetry Sampling Specification](https://opentelemetry.io/docs/specs/otel/trace/sdk/#sampling)
- [Google SRE Book: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [Adaptive Sampling in APM Tools](https://www.datadoghq.com/blog/adaptive-sampling/)
- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)