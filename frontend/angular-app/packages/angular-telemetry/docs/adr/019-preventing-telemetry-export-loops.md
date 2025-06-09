# ADR-019: Preventing Telemetry Export Loops

## Status

Accepted

## Context

When instrumenting HTTP requests in an application, a critical issue arises: the telemetry system itself uses HTTP requests to export spans, metrics, and logs to the OpenTelemetry collector. Without proper safeguards, this creates an infinite loop:

1. Application makes an HTTP request
2. Interceptor creates a span for that request
3. The span needs to be exported to the collector via HTTP
4. That export HTTP request gets intercepted
5. A new span is created for the export request
6. This new span needs to be exported, creating another HTTP request
7. The cycle continues indefinitely

This can lead to:
- Exponential growth in telemetry data
- Memory exhaustion from queued spans
- Network saturation
- Collector overload
- Application crash

## Decision

We will implement telemetry export detection in all HTTP interceptors to break the infinite loop. The detection will identify telemetry export requests based on:

1. **OTLP Endpoints**: URLs containing `/v1/traces`, `/v1/metrics`, `/v1/logs`
2. **Common Ports**: 4317 (gRPC), 4318 (HTTP), 55679 (legacy Jaeger)
3. **Known Hostnames**: otel-collector, opentelemetry-collector, jaeger, tempo, zipkin

When a telemetry export request is detected, the interceptor will:
- Skip creating any spans
- Skip adding trace context headers
- Pass the request through unmodified

## Implementation

```typescript
private isTelemetryExportRequest(request: HttpRequest<unknown>): boolean {
  const url = request.url.toLowerCase();
  
  // Check for OTLP endpoints
  if (url.includes('/v1/traces') || 
      url.includes('/v1/metrics') || 
      url.includes('/v1/logs')) {
    return true;
  }
  
  // Check for common collector ports
  if (url.includes(':4317') || // gRPC port
      url.includes(':4318') || // HTTP port
      url.includes(':55679')) { // Legacy Jaeger port
    return true;
  }
  
  // Check for common collector hostnames
  if (url.includes('otel-collector') ||
      url.includes('opentelemetry-collector') ||
      url.includes('jaeger') ||
      url.includes('tempo') ||
      url.includes('zipkin')) {
    return true;
  }
  
  return false;
}

intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
  // Skip telemetry export requests to prevent infinite loops
  if (this.isTelemetryExportRequest(request)) {
    return next.handle(request);
  }
  
  // Normal instrumentation continues...
}
```

## Consequences

### Positive
- **Prevents Infinite Loops**: Breaks the cycle of telemetry generating more telemetry
- **Protects Resources**: Prevents memory exhaustion and network saturation
- **Maintains Stability**: Application remains stable even under high telemetry load
- **Simple Implementation**: Easy to understand and maintain
- **No Configuration Required**: Works out of the box with common setups

### Negative
- **No Telemetry for Export Requests**: We lose visibility into the telemetry export process itself
- **Pattern Matching**: Relies on URL patterns which might not catch all cases
- **False Positives**: Might skip instrumentation for legitimate requests to similar URLs
- **Maintenance**: Need to update patterns if collector endpoints change

### Neutral
- **Performance Impact**: Minimal - just a string check before instrumentation
- **Debugging**: Can make debugging telemetry export issues slightly harder
- **Alternative Approaches**: Could use headers or context flags instead

## Alternatives Considered

1. **Context Flag Approach**: Mark export requests with a special context flag
   - More precise but requires changes to the exporter
   
2. **Header-Based Detection**: Look for specific headers on export requests
   - Cleaner but requires exporter modifications
   
3. **Exporter-Level Solution**: Configure exporters to not use instrumented HTTP clients
   - Ideal but not always possible with third-party exporters

4. **Separate HTTP Client**: Use a non-instrumented HTTP client for exports
   - More complex architecture and maintenance

## References

- [OpenTelemetry Specification - Telemetry Stability](https://opentelemetry.io/docs/specs/otel/stability/)
- [OTLP HTTP Specification](https://opentelemetry.io/docs/specs/otlp/)
- [Angular HTTP Interceptors](https://angular.io/guide/http-intercept-requests-and-responses)
- Similar issues in other ecosystems:
  - [OpenTelemetry JS Issue #2091](https://github.com/open-telemetry/opentelemetry-js/issues/2091)
  - [OpenTelemetry Python Issue #1742](https://github.com/open-telemetry/opentelemetry-python/issues/1742)