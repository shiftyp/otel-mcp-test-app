import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpResponse,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap, switchMap, take } from 'rxjs/operators';
import { ReactiveContextService } from '../services/reactive-context.service';
import { trace, Span } from '@opentelemetry/api';

/**
 * HTTP Interceptor that handles context propagation for distributed tracing.
 * 
 * This interceptor:
 * 1. Propagates trace context via W3C Trace Context headers
 * 2. Creates spans ONLY if auto-instrumentation isn't already present
 * 3. Maintains context across async operations using ReactiveContextService
 * 
 * Note: This is designed to work alongside OpenTelemetry auto-instrumentation
 * without creating duplicate spans. It detects existing HTTP spans and only
 * adds context propagation headers when needed.
 */
@Injectable()
export class ContextPropagationInterceptor implements HttpInterceptor {
  constructor(private contextService: ReactiveContextService) {}

  /**
   * Check if this is a telemetry export request to prevent infinite loops
   */
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
    
    // Get current context
    return this.contextService.getCurrentContext$().pipe(
      take(1),
      switchMap(context => {
        let headers = request.headers;
        
        // Add W3C Trace Context headers if we have context
        if (context) {
          const traceFlags = context.traceFlags.toString(16).padStart(2, '0');
          headers = headers.set('traceparent', `00-${context.traceId}-${context.spanId}-${traceFlags}`);
          
          if (context.traceState) {
            headers = headers.set('tracestate', context.traceState);
          }
          
          // Add baggage if present
          if (context.baggage) {
            const baggageItems = Object.entries(context.baggage)
              .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
              .join(',');
            if (baggageItems) {
              headers = headers.set('baggage', baggageItems);
            }
          }
        }
        
        // Clone request with new headers
        const tracedRequest = request.clone({ headers });
        
        // Check if there's already an active span (from auto-instrumentation)
        const existingSpan = trace.getActiveSpan();
        const isAutoInstrumented = existingSpan?.spanContext().spanId && 
                                  existingSpan.spanContext().traceId;
        // Note: We can't check attributes directly on span object, 
        // so we just check if there's an active span with valid context
        
        // Only create a span if there isn't already HTTP instrumentation
        let span: Span | null = null;
        if (!isAutoInstrumented) {
          span = trace.getTracer('http').startSpan(`HTTP ${request.method} ${request.urlWithParams}`, {
            attributes: {
              'http.method': request.method,
              'http.url': request.urlWithParams,
              'http.target': new URL(request.url, window.location.href).pathname,
              'context.propagated': !!context,
              'instrumentation.source': 'context-propagation-interceptor'
            }
          });
          
          // Update context service with new span
          const spanContext = span.spanContext();
          this.contextService.setContext({
            traceId: spanContext.traceId,
            spanId: spanContext.spanId,
            traceFlags: spanContext.traceFlags
          }, 'http');
        } else {
          // Use existing span context
          const spanContext = existingSpan.spanContext();
          this.contextService.setContext({
            traceId: spanContext.traceId,
            spanId: spanContext.spanId,
            traceFlags: spanContext.traceFlags
          }, 'http');
        }
        
        return next.handle(tracedRequest).pipe(
          tap({
            next: (event) => {
              if (event instanceof HttpResponse) {
                if (span) {
                  span.setAttributes({
                    'http.status_code': event.status,
                    'http.response_size': event.headers.get('content-length') || 0
                  });
                }
                
                // Extract context from response headers if present
                const responseTraceparent = event.headers.get('traceparent');
                if (responseTraceparent) {
                  const responseTracestate = event.headers.get('tracestate');
                  const responseContext = this.contextService.extractFromHeaders({
                    traceparent: responseTraceparent,
                    ...(responseTracestate && { tracestate: responseTracestate })
                  });
                  
                  if (responseContext) {
                    // Update context with server's trace context
                    this.contextService.setContext(responseContext, 'http');
                  }
                }
                
                span?.end();
              }
            },
            error: (error: HttpErrorResponse) => {
              if (span) {
                span.setAttributes({
                  'http.status_code': error.status || 0,
                  'error': true
                });
                span.recordException(error);
                span.end();
              }
            }
          })
        );
      })
    );
  }
}