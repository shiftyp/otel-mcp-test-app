# ADR 013: Signal Change Tracking Stream

## Status
Accepted

## Context
Angular Signals provide a reactive primitive for state management, but lack built-in mechanisms for observing changes over time. Currently, our telemetry captures individual signal operations, but we cannot easily:
- Track patterns of signal changes
- Detect cascading updates
- Monitor signal update frequency
- Correlate signal changes with application behavior
- Build debugging tools that show signal change history

Converting signal changes into RxJS streams would enable powerful observability features while maintaining compatibility with Angular's reactive ecosystem.

## Decision
We will implement a signal change tracking system that converts signal updates into RxJS observables, providing:

1. **Change Streams**: Each traced signal will expose a change stream
2. **Global Registry**: A centralized stream of all signal changes
3. **Metadata Enrichment**: Include context about each change
4. **Replay Capabilities**: Buffer recent changes for debugging
5. **Performance Monitoring**: Track update frequency and patterns

## Implementation Details

### Signal Change Event Structure
```typescript
interface SignalChangeEvent<T> {
  signalName: string;
  previousValue: T;
  currentValue: T;
  timestamp: number;
  source: 'direct' | 'computed' | 'effect';
  stackTrace?: string;
  metadata: {
    updateCount: number;
    timeSinceLastUpdate: number;
    hasActiveSpan: boolean;
    traceId?: string;
    spanId?: string;
  };
}
```

### Integration Points
1. Modify `createTracedSignal` to emit change events
2. Create a `SignalChangeTracker` service
3. Expose observables on traced signals
4. Provide global change stream access

### Usage Example
```typescript
// Individual signal changes
const count = telemetryService.createTracedSignal(0, 'count');
count.changes$.subscribe(change => {
  console.log(`Signal ${change.signalName} changed from ${change.previousValue} to ${change.currentValue}`);
});

// Global signal monitoring
telemetryService.signalChanges$.pipe(
  filter(change => change.metadata.timeSinceLastUpdate < 100),
  bufferTime(1000)
).subscribe(rapidChanges => {
  console.warn(`Detected ${rapidChanges.length} rapid signal updates`);
});
```

## Consequences

### Positive
- **Enhanced Debugging**: Developers can observe signal state evolution
- **Pattern Detection**: Identify problematic update patterns
- **Performance Analysis**: Track signal update frequency and cascades
- **Integration**: Works seamlessly with existing RxJS operators
- **Time Travel**: Can replay signal changes for debugging

### Negative
- **Memory Overhead**: Buffering change events consumes memory
- **Performance Impact**: Creating observables for every signal adds overhead
- **Complexity**: Adds another layer to the signal system
- **Learning Curve**: Developers need to understand both Signals and RxJS

### Mitigation Strategies
- Make change tracking opt-in per signal
- Limit buffer sizes to prevent memory leaks
- Use lazy initialization for change streams
- Provide clear documentation and examples