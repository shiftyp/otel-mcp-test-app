# ADR 016: Request-Scoped Telemetry Stream

## Status
Accepted

## Context
In Angular applications, especially those with SSR, tracking operations within the context of a single request is challenging:
- Operations span multiple services and components
- Context is lost across async boundaries
- Difficult to correlate all telemetry for a single user action
- No built-in request tracking in Angular
- Server and client telemetry are disconnected

A request-scoped telemetry stream would enable holistic monitoring of user interactions from initiation to completion.

## Decision
We will implement request-scoped telemetry streams that:

1. **Generate Request IDs**: Unique identifiers for each user interaction
2. **Scope All Telemetry**: Associate traces, metrics, and logs with requests
3. **Cross-Boundary Propagation**: Maintain context across server/client boundary
4. **Stream Aggregation**: Collect all telemetry for a request in one stream
5. **Lifecycle Management**: Handle request completion and cleanup

## Implementation Details

### Request Context
```typescript
interface RequestContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
  startTime: number;
  metadata: Record<string, any>;
}

class RequestScopedTelemetry {
  private requestStreams = new Map<string, Subject<TelemetryEvent>>();
  
  startRequest(context: RequestContext): Observable<TelemetryEvent> {
    const stream$ = new Subject<TelemetryEvent>();
    this.requestStreams.set(context.requestId, stream$);
    
    // Auto-complete stream after timeout or explicit end
    return stream$.pipe(
      takeUntil(
        race(
          timer(300000), // 5 minute timeout
          this.requestEnd$.pipe(
            filter(id => id === context.requestId)
          )
        )
      ),
      finalize(() => {
        this.requestStreams.delete(context.requestId);
      })
    );
  }
  
  withRequestContext<T>(requestId: string): MonoTypeOperatorFunction<T> {
    return (source$: Observable<T>) => {
      return source$.pipe(
        tap({
          subscribe: () => {
            // Set request context for all operations
            const span = trace.getActiveSpan();
            if (span) {
              span.setAttribute('request.id', requestId);
            }
          }
        })
      );
    };
  }
}
```

### SSR to Client Handoff
```typescript
// Server-side
app.get('*', (req, res) => {
  const requestId = generateRequestId();
  const telemetryStream$ = telemetry.startRequest({
    requestId,
    startTime: Date.now(),
    metadata: { userAgent: req.headers['user-agent'] }
  });
  
  // Render with context
  renderApplication(req.url, {
    providers: [
      { provide: REQUEST_ID, useValue: requestId }
    ]
  }).pipe(
    telemetry.withRequestContext(requestId)
  ).subscribe(html => {
    // Inject request ID into HTML for client
    const htmlWithContext = html.replace(
      '</head>',
      `<meta name="request-id" content="${requestId}"></head>`
    );
    res.send(htmlWithContext);
  });
});

// Client-side
const requestId = document.querySelector('meta[name="request-id"]')?.content;
if (requestId) {
  telemetry.continueRequest(requestId);
}
```

### Usage Patterns
```typescript
// Aggregate all telemetry for a request
telemetry.getRequestStream(requestId).pipe(
  scan((acc, event) => ({
    ...acc,
    [event.type]: [...(acc[event.type] || []), event]
  }), {}),
  debounceTime(1000)
).subscribe(aggregated => {
  console.log(`Request ${requestId} telemetry:`, {
    spans: aggregated.spans?.length || 0,
    metrics: aggregated.metrics?.length || 0,
    logs: aggregated.logs?.length || 0
  });
});
```

## Consequences

### Positive
- **Complete Visibility**: See all operations for a user request
- **Debugging**: Easily trace issues to specific requests
- **Performance Analysis**: Measure true end-to-end performance
- **User Journey**: Understand complete user interactions
- **Correlation**: Automatic correlation of all telemetry

### Negative
- **Memory Usage**: Storing streams per request
- **Complexity**: Additional abstraction layer
- **Cleanup**: Must manage stream lifecycle
- **Performance**: Overhead of maintaining request context

### Mitigation Strategies
- Implement automatic stream cleanup
- Use ring buffers for memory efficiency
- Make request tracking opt-in
- Provide clear lifecycle documentation