# ADR-002: Server-Side Rendering (SSR) Telemetry Architecture

## Status
Accepted

## Context
Angular Universal enables server-side rendering for improved performance and SEO. However, telemetry in SSR environments presents unique challenges:
- Different runtime environments (Node.js vs Browser)
- State transfer between server and client
- Performance overhead on server
- Missing browser APIs
- Request context propagation

## Decision
We will implement a platform-aware telemetry architecture that adapts behavior based on the execution environment.

### 1. Platform Detection Strategy
```typescript
constructor(
  @Inject(PLATFORM_ID) private platformId: Object,
  @Optional() private transferState?: TransferState
) {
  this.isServerPlatform = isPlatformServer(this.platformId);
}
```

### 2. SSR-Specific Configuration
```typescript
interface SSRConfig {
  serverSamplingMultiplier?: number;  // Default: 0.01 (1% of client rate)
  enableStateTransfer?: boolean;       // Default: true
  serverMetricsBuffer?: number;        // Default: 100
  disableServerTracing?: boolean;      // Default: false
}
```

### 3. State Transfer Implementation
Server-side collected metrics are transferred to the client for hydration:

```typescript
// Server-side: Store metrics
if (this.isServerPlatform && this.transferState) {
  const key = makeStateKey<SerializedMetrics>('telemetry-metrics');
  this.transferState.set(key, this.serializeMetrics());
}

// Client-side: Restore metrics
if (isPlatformBrowser(this.platformId) && this.transferState) {
  const key = makeStateKey<SerializedMetrics>('telemetry-metrics');
  const metrics = this.transferState.get(key, null);
  if (metrics) {
    this.restoreMetrics(metrics);
    this.transferState.remove(key);
  }
}
```

### 4. Request Context Propagation
Each SSR request maintains its own telemetry context:

```typescript
interface RequestContext {
  requestId: string;
  startTime: number;
  attributes: Record<string, any>;
  spans: Span[];
}

// Stored in Zone.js context during SSR
Zone.current.get('telemetryContext') as RequestContext;
```

### 5. Platform-Specific Features

#### Server-Side Disabled Features:
- Web Vitals collection
- Browser-specific metrics (FCP, LCP, CLS)
- User interaction tracking
- Local storage persistence

#### Server-Side Optimizations:
- Reduced sampling rate (1% of client rate by default)
- Buffered metric aggregation
- Minimal span attributes
- No effect loop detection (performance overhead)

### 6. Graceful Degradation
```typescript
private getSamplingRate(): number {
  const baseRate = this.config.samplingRate ?? 1.0;
  if (this.isServerPlatform) {
    const multiplier = this.config.serverSamplingMultiplier ?? 0.01;
    return baseRate * multiplier;
  }
  return baseRate;
}
```

## Consequences

### Positive
- **Performance**: Minimal overhead on server with reduced sampling
- **Consistency**: Same API for both server and client code
- **State Continuity**: Metrics transfer from server to client
- **Debugging**: Request-scoped telemetry for SSR issues
- **Flexibility**: Per-feature platform configuration

### Negative
- **Complexity**: Platform-specific code paths
- **Memory**: Server-side metric buffering
- **Data Loss**: Reduced server sampling may miss issues
- **Testing**: Requires both platform scenarios

### Neutral
- **Bundle Size**: Platform-specific code included in both bundles
- **Configuration**: Additional SSR-specific options
- **Monitoring**: Separate server vs client dashboards

## Implementation Details

### Module Configuration for SSR
```typescript
// app.config.server.ts
export const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    {
      provide: TELEMETRY_CONFIG,
      useValue: {
        samplingRate: 1.0,
        serverSamplingMultiplier: 0.01,
        enableStateTransfer: true,
        disableServerTracing: false
      }
    }
  ]
};
```

### SSR Request Tracking
```typescript
// Server middleware integration
app.get('*', (req, res) => {
  const requestContext = {
    requestId: generateRequestId(),
    startTime: Date.now(),
    attributes: {
      'http.method': req.method,
      'http.url': req.url,
      'http.user_agent': req.headers['user-agent']
    }
  };
  
  Zone.current.fork({
    name: 'ssr-request',
    properties: { telemetryContext: requestContext }
  }).run(() => {
    // Angular SSR rendering
  });
});
```

### Hydration Safety
```typescript
// Ensure client-side code waits for hydration
if (isPlatformBrowser(this.platformId)) {
  afterNextRender(() => {
    // Safe to access browser APIs
    this.initializeWebVitals();
  });
}
```

## References
- [Angular Universal Guide](https://angular.io/guide/universal)
- [TransferState API](https://angular.io/api/platform-browser/TransferState)
- [Zone.js Context Propagation](https://github.com/angular/zone.js)
- [OpenTelemetry Context Propagation](https://opentelemetry.io/docs/concepts/context-propagation/)