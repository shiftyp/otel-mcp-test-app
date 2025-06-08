# ADR 015: Span Context Propagation with RxJS

## Status
Accepted

## Context
OpenTelemetry span context propagation across asynchronous boundaries is challenging in Angular applications. Current issues include:
- Context loss across async operations
- Manual context management is error-prone
- No automatic propagation through RxJS streams
- Difficulty correlating related operations
- Zone.js interference with context propagation

RxJS provides a natural abstraction for managing context flow through asynchronous operations.

## Decision
We will implement RxJS-based span context propagation that:

1. **Automatic Propagation**: Context flows through RxJS operators
2. **Context Storage**: Uses RxJS schedulers and operators
3. **Cross-Frame Support**: Propagates context across iframes
4. **Worker Support**: Maintains context in Web Workers
5. **Zone.js Integration**: Works with or without Zone.js

## Implementation Details

### Context Carrier
```typescript
interface SpanContextCarrier {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
  baggage?: Record<string, string>;
}

class ReactiveContextService {
  private contextSubject$ = new BehaviorSubject<SpanContextCarrier | null>(null);
  
  // Operator to propagate context through streams
  withContext<T>(): MonoTypeOperatorFunction<T> {
    return (source$: Observable<T>) => {
      return source$.pipe(
        concatMap(value => {
          const currentContext = this.contextSubject$.value;
          return of(value).pipe(
            tap({
              subscribe: () => {
                if (currentContext) {
                  context.with(
                    trace.setSpanContext(context.active(), currentContext),
                    () => {}
                  );
                }
              }
            })
          );
        })
      );
    };
  }
}
```

### Stream Integration
```typescript
// Automatic context propagation through HTTP calls
http.get('/api/data').pipe(
  telemetryService.withContext(),
  switchMap(data => processData(data)),
  telemetryService.withContext(),
  catchError(error => {
    // Context is preserved even in error handling
    const span = trace.getActiveSpan();
    span?.recordException(error);
    return EMPTY;
  })
);
```

### Cross-Frame Propagation
```typescript
class FrameContextBridge {
  private frameContexts = new Map<Window, Subject<SpanContextCarrier>>();
  
  bridgeFrame(targetWindow: Window): void {
    const channel = new MessageChannel();
    const contextStream$ = new Subject<SpanContextCarrier>();
    
    // Send context updates to frame
    this.contextSubject$.pipe(
      filter(ctx => ctx !== null),
      throttleTime(100)
    ).subscribe(context => {
      targetWindow.postMessage({
        type: 'TELEMETRY_CONTEXT',
        context
      }, '*', [channel.port2]);
    });
  }
}
```

## Consequences

### Positive
- **Automatic Propagation**: No manual context management
- **Stream Integration**: Natural fit with RxJS patterns
- **Cross-Boundary Support**: Works across all async boundaries
- **Type Safety**: TypeScript ensures context structure
- **Performance**: Minimal overhead using RxJS operators

### Negative
- **Learning Curve**: Developers must understand RxJS context patterns
- **Debugging**: Context flow can be hard to trace
- **Memory**: Storing context in streams uses memory
- **Compatibility**: May conflict with other context systems

### Mitigation Strategies
- Provide clear examples and documentation
- Create debugging tools for context visualization
- Implement context cleanup strategies
- Test thoroughly with existing systems