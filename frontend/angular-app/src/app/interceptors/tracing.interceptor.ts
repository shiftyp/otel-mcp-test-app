import { HttpInterceptorFn, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { tap, finalize } from 'rxjs/operators';
import { TelemetryService } from '../services/telemetry.service';

export const tracingInterceptor: HttpInterceptorFn = (req, next) => {
  const telemetryService = inject(TelemetryService);
  const tracer = trace.getTracer('http-interceptor');
  const startTime = Date.now();
  
  const span = tracer.startSpan(`HTTP ${req.method} ${req.urlWithParams}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'http.method': req.method,
      'http.url': req.urlWithParams,
      'http.target': req.url,
      'component': 'http',
    },
  });

  return context.with(trace.setSpan(context.active(), span), () => {
    // Add trace headers to the request
    const traceparent = `00-${span.spanContext().traceId}-${span.spanContext().spanId}-01`;
    const headers = req.headers.set('traceparent', traceparent);
    
    const tracedReq = req.clone({ headers });
    
    let statusCode = 0;
    
    return next(tracedReq).pipe(
      tap({
        next: (event) => {
          if (event instanceof HttpResponse) {
            statusCode = event.status;
            span.setAttributes({
              'http.status_code': event.status,
              'http.response_content_length': event.headers.get('content-length') || 0,
            });
            span.setStatus({ code: SpanStatusCode.OK });
          }
        },
        error: (error: HttpErrorResponse) => {
          statusCode = error.status || 0;
          span.setAttributes({
            'http.status_code': statusCode,
            'error': true,
            'error.message': error.message,
          });
          span.setStatus({ 
            code: SpanStatusCode.ERROR, 
            message: error.message 
          });
          
          // Log the error
          telemetryService.logError(`HTTP ${req.method} ${req.url} failed`, error);
        },
      }),
      finalize(() => {
        const duration = Date.now() - startTime;
        span.end();
        
        // Record metrics
        telemetryService.recordMetric('http.request.duration', duration, {
          'http.method': req.method,
          'http.url': req.url,
          'http.status_code': statusCode
        });
      })
    );
  });
};