# ADR-008: Angular Signal and Effect Tracing Architecture

## Status
Accepted

## Context
Angular's new reactive primitives (signals, computed, and effects) require specialized telemetry instrumentation to:
- Track state changes and propagation
- Monitor computation performance
- Detect infinite loops and performance issues
- Provide debugging insights for reactive data flow
- Support both development and production monitoring

## Decision
We will implement comprehensive signal and effect tracing through wrapper functions that avoid the performance overhead of JavaScript Proxy.

### 1. Tracing Architecture

#### Three-Layer Approach:
1. **Service Methods**: `telemetry.signal()`, `telemetry.computed()`, `telemetry.effect()`
2. **Standalone Functions**: `tracedSignal()`, `tracedComputed()`, `tracedEffect()`
3. **Wrapper Functions**: Object composition for operation interception

### 2. Signal Tracing Implementation

```typescript
export function tracedSignal<T>(
  initialValue: T,
  options?: TracedSignalOptions<T>
): WritableSignal<T> {
  const baseSignal = signal(initialValue);
  const signalName = options?.name || 'anonymous-signal';
  
  // Create a wrapper function for reading the signal
  const tracedRead = () => {
    const span = tracer.startSpan('signal.read', {
      attributes: {
        'signal.name': signalName,
        'signal.operation': 'read'
      }
    });
    
    try {
      const value = baseSignal();
      meter.createCounter('signal.reads').add(1, {
        'signal.name': signalName
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return value;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  };
  
  // Use Object.assign to create a function with signal methods
  return Object.assign(tracedRead, {
    set: (value: T) => {
      const span = tracer.startSpan('signal.set', {
        attributes: {
          'signal.name': signalName,
          'signal.operation': 'set',
          'signal.value.type': typeof value
        }
      });
      
      try {
        baseSignal.set(value);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    },
    
    update: (updateFn: (value: T) => T) => {
      const span = tracer.startSpan('signal.update', {
        attributes: {
          'signal.name': signalName,
          'signal.operation': 'update'
        }
      });
      
      try {
        baseSignal.update(updateFn);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    },
    
    asReadonly: () => baseSignal.asReadonly()
  }) as WritableSignal<T>;
}
```

### 3. Computed Signal Tracing

```typescript
export function tracedComputed<T>(
  computation: () => T,
  options?: TracedComputedOptions<T>
): Signal<T> {
  const computedName = options?.name || 'anonymous-computed';
  let computeCount = 0;
  let lastComputeTime = 0;
  
  const tracedComputation = () => {
    const startTime = performance.now();
    const span = tracer.startSpan('computed.calculate', {
      attributes: {
        'computed.name': computedName,
        'computed.count': ++computeCount
      }
    });
    
    try {
      const result = computation();
      const duration = performance.now() - startTime;
      
      // Record metrics
      meter.createHistogram('computed.duration').record(duration, {
        'computed.name': computedName
      });
      
      // Performance warning
      if (duration > (options?.slowThreshold || 16)) {
        logger.warn(`Slow computed: ${computedName} took ${duration}ms`);
      }
      
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      lastComputeTime = performance.now() - startTime;
      span.end();
    }
  };
  
  return computed(tracedComputation);
}
```

### 4. Effect Tracing with Loop Detection

```typescript
export function tracedEffect(
  effectFn: () => void,
  options?: TracedEffectOptions
): EffectRef {
  const effectName = options?.name || 'anonymous-effect';
  let executionCount = 0;
  const executionTimestamps: number[] = [];
  
  const tracedEffectFn = () => {
    const now = Date.now();
    executionTimestamps.push(now);
    
    // Loop detection
    const recentExecutions = executionTimestamps.filter(
      ts => now - ts < 1000
    ).length;
    
    if (recentExecutions > 10) {
      logger.error(`Potential effect loop detected: ${effectName}`);
      meter.createCounter('effect.loops.detected').add(1, {
        'effect.name': effectName
      });
    }
    
    const span = tracer.startSpan('effect.run', {
      attributes: {
        'effect.name': effectName,
        'effect.count': ++executionCount,
        'effect.potential_loop': recentExecutions > 10
      }
    });
    
    try {
      effectFn();
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
      
      // Cleanup old timestamps
      const cutoff = now - 60000; // 1 minute
      executionTimestamps.splice(
        0,
        executionTimestamps.findIndex(ts => ts > cutoff)
      );
    }
  };
  
  return effect(tracedEffectFn, options);
}
```

### 5. Smart Sampling for Signals

```typescript
interface SmartSamplingConfig {
  baseRate: number;
  rules: SamplingRule[];
}

interface SamplingRule {
  pattern: RegExp;
  rate: number;
  priority: number;
}

// Example configuration
const smartSampling: SmartSamplingConfig = {
  baseRate: 0.1,
  rules: [
    { pattern: /^cart/, rate: 1.0, priority: 10 },      // Always sample cart signals
    { pattern: /^temp/, rate: 0.01, priority: 5 },      // Rarely sample temporary signals
    { pattern: /^critical/, rate: 1.0, priority: 20 }   // Always sample critical signals
  ]
};
```

### 6. Signal Dependency Tracking

```typescript
interface SignalDependencyGraph {
  nodes: Map<string, SignalNode>;
  edges: Map<string, Set<string>>;
}

interface SignalNode {
  name: string;
  type: 'signal' | 'computed' | 'effect';
  metadata: Record<string, any>;
}

// Track dependencies during computed/effect execution
const dependencyTracker = {
  currentContext: null as string | null,
  
  recordRead(signalName: string) {
    if (this.currentContext) {
      graph.addEdge(signalName, this.currentContext);
    }
  },
  
  executeWithTracking<T>(name: string, fn: () => T): T {
    const previousContext = this.currentContext;
    this.currentContext = name;
    try {
      return fn();
    } finally {
      this.currentContext = previousContext;
    }
  }
};
```

## Consequences

### Positive
- **Visibility**: Complete reactive data flow tracking
- **Performance**: Better performance than Proxy-based approach
- **Debugging**: Detailed traces for state propagation
- **Optimization**: Data-driven performance improvements
- **Safety**: Automatic loop detection prevents runaway effects
- **Simplicity**: Direct function wrapping is easier to understand

### Negative
- **Overhead**: Function wrapping still adds some runtime cost
- **Complexity**: Multiple layers of wrapping
- **Memory**: Tracking execution history and dependencies
- **Bundle Size**: Additional tracing code

### Neutral
- **API Surface**: Both service and standalone function APIs
- **Configuration**: Requires careful tuning of thresholds
- **Monitoring**: New metrics and spans to analyze

## Implementation Guidelines

### Best Practices
1. **Naming**: Always provide meaningful names for signals
2. **Thresholds**: Configure appropriate slow computation thresholds
3. **Sampling**: Use smart sampling for high-frequency signals
4. **Cleanup**: Ensure effect refs are properly destroyed

### Migration Strategy
```typescript
// Before: Regular Angular signals
const count = signal(0);
const doubled = computed(() => count() * 2);
effect(() => console.log(count()));

// After: Traced signals (Option 1 - Service)
const count = telemetry.signal(0, { name: 'count' });
const doubled = telemetry.computed(() => count() * 2, { name: 'doubled' });
telemetry.effect(() => console.log(count()), { name: 'count-logger' });

// After: Traced signals (Option 2 - Standalone)
const count = tracedSignal(0, { name: 'count' });
const doubled = tracedComputed(() => count() * 2, { name: 'doubled' });
tracedEffect(() => console.log(count()), { name: 'count-logger' });
```

## References
- [Angular Signals Guide](https://angular.io/guide/signals)
- [OpenTelemetry Tracing](https://opentelemetry.io/docs/concepts/signals/traces/)
- [Performance Observer API](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver)
- [Proxy Pattern](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy)