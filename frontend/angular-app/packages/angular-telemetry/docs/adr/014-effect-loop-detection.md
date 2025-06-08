# ADR 014: Effect Loop Detection with RxJS

## Status
Accepted

## Context
Angular effects can inadvertently create infinite loops when they trigger state changes that cause the effect to re-execute. While we currently detect rapid re-executions, we lack sophisticated analysis to:
- Identify effect dependency chains
- Detect circular dependencies
- Provide actionable debugging information
- Prevent performance degradation
- Visualize effect execution patterns

RxJS streams provide powerful operators for analyzing temporal patterns and detecting anomalies in effect execution.

## Decision
We will implement an RxJS-based effect loop detection system that:

1. **Tracks Effect Executions**: Convert effect runs into observable events
2. **Analyzes Patterns**: Detect loops, cascades, and anomalies
3. **Provides Circuit Breakers**: Automatically pause problematic effects
4. **Generates Alerts**: Notify developers of potential issues
5. **Visualizes Dependencies**: Show effect execution graphs

## Implementation Details

### Effect Execution Event
```typescript
interface EffectExecutionEvent {
  effectName: string;
  executionId: string;
  timestamp: number;
  duration: number;
  triggerSource: 'signal' | 'computed' | 'effect' | 'unknown';
  dependencies: string[];
  metadata: {
    executionCount: number;
    timeSinceLastExecution: number;
    stackDepth: number;
    isInLoop: boolean;
  };
}
```

### Detection Strategies
```typescript
// Rapid execution detection
effectExecutions$.pipe(
  groupBy(event => event.effectName),
  mergeMap(group$ => group$.pipe(
    bufferTime(1000),
    filter(events => events.length > 10),
    map(events => ({
      effectName: events[0].effectName,
      executionCount: events.length,
      pattern: 'rapid_execution'
    }))
  ))
);

// Circular dependency detection
effectExecutions$.pipe(
  scan((acc, event) => {
    const chain = [...acc.chain, event.effectName];
    const hasCycle = chain.indexOf(event.effectName) !== chain.length - 1;
    return { chain: hasCycle ? [] : chain, hasCycle };
  }, { chain: [], hasCycle: false }),
  filter(state => state.hasCycle)
);
```

### Circuit Breaker Implementation
```typescript
class EffectCircuitBreaker {
  private executionStreams = new Map<string, Subject<EffectExecutionEvent>>();
  private circuitStates = new Map<string, BehaviorSubject<'closed' | 'open' | 'half-open'>>();
  
  shouldExecute(effectName: string): Observable<boolean> {
    return this.circuitStates.get(effectName)?.pipe(
      map(state => state !== 'open')
    ) || of(true);
  }
}
```

## Consequences

### Positive
- **Early Detection**: Catch effect loops before they impact performance
- **Root Cause Analysis**: Understand why loops occur
- **Automatic Protection**: Circuit breakers prevent runaway effects
- **Developer Experience**: Clear feedback about problematic patterns
- **Performance**: Prevent effect-related performance issues

### Negative
- **Overhead**: Tracking adds computational cost
- **False Positives**: Legitimate rapid updates might trigger warnings
- **Complexity**: Additional abstraction layer
- **Memory Usage**: Storing execution history

### Mitigation Strategies
- Configure thresholds per effect
- Provide opt-out mechanisms
- Use ring buffers for memory efficiency
- Clear documentation of detection patterns