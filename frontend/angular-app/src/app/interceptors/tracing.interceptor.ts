import { HttpInterceptorFn, HttpResponse, HttpErrorResponse, HttpEvent } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { tap, finalize, catchError } from 'rxjs/operators';
import { TelemetryService } from '../services/telemetry.service';
import { throwError } from 'rxjs';

export const tracingInterceptor: HttpInterceptorFn = (req, next) => {
  // Skip telemetry export requests to prevent infinite loops
  const url = req.url.toLowerCase();
  if (url.includes('/v1/traces') || 
      url.includes('/v1/metrics') || 
      url.includes('/v1/logs') ||
      url.includes(':4317') || 
      url.includes(':4318') ||
      url.includes('otel-collector') ||
      url.includes('opentelemetry-collector')) {
    return next(req);
  }
  
  const telemetryService = inject(TelemetryService);
  const platformId = inject(PLATFORM_ID);
  const tracer = trace.getTracer('http-interceptor');
  const startTime = performance.now();
  
  // Extract route information
  let route = req.url;
  try {
    if (isPlatformBrowser(platformId)) {
      const urlParts = new URL(req.urlWithParams, window.location.origin);
      route = urlParts.pathname;
    } else {
      // Server-side: parse URL without window.location
      const urlParts = new URL(req.urlWithParams, `http://localhost`);
      route = urlParts.pathname;
    }
  } catch (e) {
    // Fallback to original URL if parsing fails
    route = req.url;
  }
  
  // Create more detailed span name
  const spanName = `HTTP ${req.method} ${route}`;
  
  // Parse URL for attributes
  let httpScheme = 'http';
  let httpHost = 'localhost';
  let httpPort = '80';
  let httpTarget = route;
  
  try {
    const urlParts = isPlatformBrowser(platformId) 
      ? new URL(req.urlWithParams, window.location.origin)
      : new URL(req.urlWithParams, `http://localhost`);
    
    httpScheme = urlParts.protocol.replace(':', '');
    httpHost = urlParts.hostname;
    httpPort = urlParts.port || (urlParts.protocol === 'https:' ? '443' : '80');
    httpTarget = urlParts.pathname + urlParts.search;
  } catch (e) {
    // Use defaults if URL parsing fails
  }
  
  const span = tracer.startSpan(spanName, {
    kind: SpanKind.CLIENT,
    attributes: {
      'http.method': req.method,
      'http.url': req.urlWithParams,
      'http.scheme': httpScheme,
      'http.host': httpHost,
      'http.port': httpPort,
      'http.target': httpTarget,
      'http.route': route,
      'http.flavor': '1.1',
      'component': 'http-angular',
      'http.request.body.size': getRequestBodySize(req),
      'user.authenticated': isPlatformBrowser(platformId) ? !!localStorage.getItem('auth_token') : false,
      'browser.viewport.width': isPlatformBrowser(platformId) ? window.innerWidth : 0,
      'browser.viewport.height': isPlatformBrowser(platformId) ? window.innerHeight : 0,
    },
  });

  // Track request queuing time if available
  const serverTimingHeader = req.headers.get('Server-Timing');
  if (serverTimingHeader) {
    span.setAttribute('http.server_timing', serverTimingHeader);
  }

  return context.with(trace.setSpan(context.active(), span), () => {
    // Add trace headers to the request
    const traceparent = `00-${span.spanContext().traceId}-${span.spanContext().spanId}-01`;
    const tracestate = span.spanContext().traceState?.toString() || '';
    
    let headers = req.headers
      .set('traceparent', traceparent)
      .set('x-trace-id', span.spanContext().traceId)
      .set('x-span-id', span.spanContext().spanId);
      
    if (tracestate) {
      headers = headers.set('tracestate', tracestate);
    }
    
    const tracedReq = req.clone({ headers });
    
    let statusCode = 0;
    let responseSize = 0;
    let errorType: string | undefined;
    
    return next(tracedReq).pipe(
      tap({
        next: (event: HttpEvent<any>) => {
          if (event instanceof HttpResponse) {
            statusCode = event.status;
            responseSize = getResponseSize(event);
            
            // Extract additional response metadata
            const responseHeaders: Record<string, string> = {};
            event.headers.keys().forEach(key => {
              responseHeaders[`http.response.header.${key.toLowerCase()}`] = event.headers.get(key) || '';
            });
            
            span.setAttributes({
              'http.status_code': event.status,
              'http.status_text': event.statusText || '',
              'http.response_content_length': responseSize,
              'http.response.body.size': responseSize,
              'cache.hit': event.headers.get('x-cache-hit') === 'true',
              ...responseHeaders
            });
            
            // Set status based on response code
            if (event.status >= 400) {
              span.setStatus({ 
                code: SpanStatusCode.ERROR,
                message: `HTTP ${event.status} ${event.statusText}`
              });
            } else {
              span.setStatus({ code: SpanStatusCode.OK });
            }
            
            // Record business metrics for specific endpoints
            recordBusinessMetrics(req, event, telemetryService);
          }
        },
        error: (error: HttpErrorResponse) => {
          statusCode = error.status || 0;
          errorType = getErrorType(error);
          
          span.setAttributes({
            'http.status_code': statusCode,
            'error': true,
            'error.type': errorType,
            'error.message': error.message,
            'error.stack': error.error?.stack || '',
            'network.error': statusCode === 0,
          });
          
          span.recordException(error);
          span.setStatus({ 
            code: SpanStatusCode.ERROR, 
            message: error.message 
          });
          
          // Enhanced error logging with context
          telemetryService.logError(`HTTP ${req.method} ${req.url} failed`, error);
        },
      }),
      catchError((error) => {
        // Ensure error is properly handled even if tap error handler fails
        return throwError(() => error);
      }),
      finalize(() => {
        const duration = performance.now() - startTime;
        
        // Add final timing attributes
        span.setAttributes({
          'http.request.duration': duration,
          'http.response.size': responseSize,
          'performance.duration': duration,
        });
        
        span.end();
        
        // Record detailed metrics
        const metricAttributes = {
          'http.method': req.method,
          'http.route': route,
          'http.status_code': statusCode,
          'http.status_class': `${Math.floor(statusCode / 100)}xx`,
          'error': statusCode >= 400,
          'error.type': errorType || 'none',
        };
        
        // Duration histogram
        telemetryService.recordMetric('http.client.duration', duration, metricAttributes);
        
        // Request counter
        telemetryService.recordMetric('http.client.requests', 1, metricAttributes);
        
        // Response size histogram
        if (responseSize > 0) {
          telemetryService.recordMetric('http.client.response.size', responseSize, metricAttributes);
        }
        
        // Error rate
        if (statusCode >= 400) {
          telemetryService.recordMetric('http.client.errors', 1, metricAttributes);
        }
        
        // Slow request detection
        if (duration > 3000) {
          telemetryService.log('Slow HTTP request detected', {
            level: 'warn',
            url: req.urlWithParams,
            duration,
            method: req.method
          });
        }
      })
    );
  });
};

// Helper functions
function getRequestBodySize(req: any): number {
  if (!req.body) return 0;
  
  if (req.body instanceof FormData) {
    // Estimate FormData size
    let size = 0;
    req.body.forEach((value: any) => {
      if (typeof value === 'string') {
        size += value.length;
      } else if (value instanceof File) {
        size += value.size;
      }
    });
    return size;
  }
  
  try {
    return JSON.stringify(req.body).length;
  } catch {
    return 0;
  }
}

function getResponseSize(response: HttpResponse<any>): number {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    return parseInt(contentLength, 10) || 0;
  }
  
  // Estimate size from body
  if (!response.body) return 0;
  
  try {
    return JSON.stringify(response.body).length;
  } catch {
    return 0;
  }
}

function getErrorType(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'network_error';
  } else if (error.status >= 400 && error.status < 500) {
    return 'client_error';
  } else if (error.status >= 500) {
    return 'server_error';
  }
  return 'unknown_error';
}

function recordBusinessMetrics(
  req: any,
  response: HttpResponse<any>,
  telemetryService: TelemetryService
): void {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(req.urlWithParams, origin);
  
  // Product API metrics
  if (url.pathname.includes('/api/products')) {
    if (Array.isArray(response.body)) {
      telemetryService.recordMetric('products.fetched', response.body.length, {
        endpoint: url.pathname
      });
    }
  }
  
  // Auth API metrics
  if (url.pathname.includes('/api/auth/login') && response.status === 200) {
    telemetryService.recordMetric('auth.login.success', 1);
  }
  
  if (url.pathname.includes('/api/auth/register') && response.status === 201) {
    telemetryService.recordMetric('auth.registration.success', 1);
  }
  
  // Cart API metrics
  if (url.pathname.includes('/api/cart')) {
    telemetryService.recordMetric('cart.api.calls', 1, {
      operation: req.method.toLowerCase()
    });
  }
}