# ADR 018: Memory-Safe Telemetry Buffering

## Status
Proposed

## Context
When telemetry collectors are unavailable or network issues prevent export, telemetry data accumulates in memory buffers. Without proper controls, this can lead to:
- Memory exhaustion causing application crashes
- Performance degradation from large buffers
- Lost telemetry data on process restart
- Cascading failures when memory pressure affects other operations

Current implementation has some protections (buffer size limits, backpressure for metrics) but lacks comprehensive memory safety across all telemetry types.

## Decision
We will implement a comprehensive memory-safe telemetry buffering strategy that:

1. **Enforces strict buffer limits** for all telemetry types
2. **Implements backpressure** across spans, metrics, and logs
3. **Adds persistent storage** for critical telemetry
4. **Monitors memory usage** and adapts buffer sizes
5. **Provides circuit breakers** for extended outages

## Implementation Details

### Buffer Configuration
```typescript
interface BufferConfig {
  maxSize: number;              // Maximum items in buffer
  maxMemoryMB: number;         // Maximum memory usage
  dropStrategy: 'oldest' | 'newest' | 'sampling';
  persistenceEnabled: boolean;
  circuitBreakerThreshold: number; // Consecutive failures before opening
}

const defaultBufferConfig: Record<string, BufferConfig> = {
  spans: {
    maxSize: 2048,
    maxMemoryMB: 50,
    dropStrategy: 'oldest',
    persistenceEnabled: true,
    circuitBreakerThreshold: 10
  },
  metrics: {
    maxSize: 5000,
    maxMemoryMB: 20,
    dropStrategy: 'sampling',
    persistenceEnabled: false,
    circuitBreakerThreshold: 20
  }
};
```

### Memory Monitoring
```typescript
class MemoryMonitor {
  private memoryStats$ = interval(5000).pipe(
    map(() => ({
      used: performance.memory?.usedJSHeapSize || 0,
      total: performance.memory?.totalJSHeapSize || 0,
      limit: performance.memory?.jsHeapSizeLimit || 0
    })),
    shareReplay(1)
  );
  
  getMemoryPressure$(): Observable<number> {
    return this.memoryStats$.pipe(
      map(stats => stats.used / stats.limit)
    );
  }
}
```

### Adaptive Buffering
```typescript
class AdaptiveBuffer<T> {
  private buffer$ = new BehaviorSubject<T[]>([]);
  
  constructor(
    private config: BufferConfig,
    private memoryMonitor: MemoryMonitor
  ) {
    // Adjust buffer size based on memory pressure
    this.memoryMonitor.getMemoryPressure$().pipe(
      distinctUntilChanged((a, b) => Math.abs(a - b) < 0.1),
      takeUntil(this.destroy$)
    ).subscribe(pressure => {
      if (pressure > 0.8) {
        this.reduceBufferSize();
      } else if (pressure < 0.5) {
        this.restoreBufferSize();
      }
    });
  }
}
```

### Persistent Storage (Browser)
```typescript
class PersistentTelemetryStore {
  private db: IDBDatabase;
  
  async store(telemetry: TelemetryData): Promise<void> {
    const tx = this.db.transaction(['telemetry'], 'readwrite');
    const store = tx.objectStore('telemetry');
    
    // Rotate old data if needed
    const count = await store.count();
    if (count > 10000) {
      await this.deleteOldest(1000);
    }
    
    await store.add({
      ...telemetry,
      timestamp: Date.now()
    });
  }
  
  async retrieveAndDelete(limit: number): Promise<TelemetryData[]> {
    // Retrieve oldest data for retry
    const tx = this.db.transaction(['telemetry'], 'readwrite');
    const data = await tx.objectStore('telemetry')
      .index('timestamp')
      .openCursor(null, 'next');
    
    const results = [];
    while (data && results.length < limit) {
      results.push(data.value);
      await data.delete();
      await data.continue();
    }
    
    return results;
  }
}
```

### Circuit Breaker for Exports
```typescript
class ExportCircuitBreaker {
  private failures = 0;
  private state$ = new BehaviorSubject<'closed' | 'open' | 'half-open'>('closed');
  
  async tryExport<T>(exportFn: () => Promise<T>): Promise<T> {
    const state = this.state$.value;
    
    if (state === 'open') {
      throw new Error('Circuit breaker is open');
    }
    
    try {
      const result = await exportFn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onFailure(): void {
    this.failures++;
    if (this.failures >= this.config.threshold) {
      this.state$.next('open');
      // Reset to half-open after cooldown
      timer(this.config.cooldownMs).subscribe(() => {
        this.state$.next('half-open');
      });
    }
  }
}
```

## Consequences

### Positive
- **Memory Safety**: Application won't crash from telemetry buffer growth
- **Data Preservation**: Critical telemetry persisted during outages
- **Performance**: Adaptive buffering maintains performance under pressure
- **Reliability**: Circuit breakers prevent cascading failures
- **Observability**: Memory usage is monitored and reported

### Negative
- **Complexity**: More complex buffer management logic
- **Storage Usage**: Persistent storage consumes disk space
- **CPU Overhead**: Memory monitoring and adaptive logic
- **Data Loss**: Some telemetry will be dropped under pressure

### Mitigation Strategies
- Make persistence opt-in for critical data only
- Use efficient data structures (ring buffers)
- Batch persistence operations
- Implement telemetry sampling during high pressure
- Add configuration to disable adaptive features if needed