import { ErrorHandler, Injectable, inject, NgZone, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { TelemetryService } from './telemetry.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private telemetryService = inject(TelemetryService);
  private zone = inject(NgZone);
  private platformId = inject(PLATFORM_ID);
  private tracer = trace.getTracer('error-handler');

  handleError(error: Error): void {
    // Run error handling outside Angular zone to prevent infinite loops
    this.zone.runOutsideAngular(() => {
      // Create a span for the error
      const span = this.tracer.startSpan('unhandled-error');
      
      try {
        // Extract error details
        const errorType = this.getErrorType(error);
        const errorContext = this.extractErrorContext(error);
        
        // Set span attributes
        span.setAttributes({
          'error': true,
          'error.type': errorType,
          'error.message': error.message,
          'error.stack': error.stack || '',
          'error.name': error.name,
          'component': errorContext['component'] || 'unknown',
          'page.url': isPlatformBrowser(this.platformId) ? window.location.href : 'ssr',
          'page.path': isPlatformBrowser(this.platformId) ? window.location.pathname : 'ssr',
          'user.authenticated': isPlatformBrowser(this.platformId) ? !!localStorage.getItem('auth_token') : false,
        });
        
        // Record the exception
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message
        });
        
        // Log the error with telemetry service
        this.telemetryService.logError('Unhandled error occurred', error);
        
        // Record metrics
        this.telemetryService.recordMetric('errors.unhandled', 1, {
          'error.type': errorType,
          'error.name': error.name,
          'component': errorContext['component'] || 'unknown',
        });
        
        // Additional handling for specific error types
        if (this.isHttpError(error)) {
          this.handleHttpError(error);
        } else if (this.isChunkLoadError(error)) {
          this.handleChunkLoadError(error);
        }
        
        // Log to console in development
        if (isPlatformBrowser(this.platformId) && !window.location.hostname.includes('prod')) {
          console.error('Unhandled error:', error);
        }
      } finally {
        span.end();
      }
    });
  }
  
  private getErrorType(error: any): string {
    if (this.isHttpError(error)) return 'http_error';
    if (this.isChunkLoadError(error)) return 'chunk_load_error';
    if (error.name === 'TypeError') return 'type_error';
    if (error.name === 'ReferenceError') return 'reference_error';
    if (error.name === 'SyntaxError') return 'syntax_error';
    return 'runtime_error';
  }
  
  private extractErrorContext(error: any): Record<string, any> {
    const context: Record<string, any> = {};
    
    // Try to extract component information from the error stack
    if (error.stack) {
      const componentMatch = error.stack.match(/at\s+(\w+Component)/);
      if (componentMatch) {
        context['component'] = componentMatch[1];
      }
      
      // Extract file information
      const fileMatch = error.stack.match(/\(([^)]+\.ts):\d+:\d+\)/);
      if (fileMatch) {
        context['file'] = fileMatch[1];
      }
    }
    
    // Extract additional context from error properties
    if (error.rejection) {
      context['rejection'] = true;
      context['rejectionReason'] = error.rejection;
    }
    
    return context;
  }
  
  private isHttpError(error: any): boolean {
    return error.status !== undefined || 
           error.message?.includes('Http failure') ||
           error.name === 'HttpErrorResponse';
  }
  
  private isChunkLoadError(error: any): boolean {
    return error.message?.includes('Failed to fetch dynamically imported module') ||
           error.message?.includes('Loading chunk') ||
           error.message?.includes('ChunkLoadError');
  }
  
  private handleHttpError(error: any): void {
    this.telemetryService.recordMetric('errors.http', 1, {
      'http.status_code': error.status || 0,
      'http.url': error.url || 'unknown',
    });
  }
  
  private handleChunkLoadError(error: any): void {
    // Chunk load errors often indicate deployment issues
    this.telemetryService.recordMetric('errors.chunk_load', 1);
    
    // Optionally trigger a page reload after a delay
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        if (confirm('The application needs to reload to get the latest version. Reload now?')) {
          window.location.reload();
        }
      }, 1000);
    }
  }
}

// Global window error handler for uncaught promise rejections
export function initializeGlobalErrorHandlers(telemetryService: TelemetryService): void {
  // Only initialize in browser environment
  if (typeof window === 'undefined') {
    return;
  }
  
  const tracer = trace.getTracer('window-error-handler');
  
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const span = tracer.startSpan('unhandled-promise-rejection');
    
    try {
      const error = event.reason || new Error('Unhandled promise rejection');
      
      span.setAttributes({
        'error': true,
        'error.type': 'promise_rejection',
        'error.message': error.message || String(error),
        'error.stack': error.stack || '',
        'promise.handled': false,
        'page.url': window.location.href,
      });
      
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: 'Unhandled promise rejection'
      });
      
      telemetryService.logError('Unhandled promise rejection', error);
      telemetryService.recordMetric('errors.promise_rejection', 1);
    } finally {
      span.end();
    }
  });
  
  // Handle general window errors
  window.addEventListener('error', (event) => {
    const span = tracer.startSpan('window-error');
    
    try {
      span.setAttributes({
        'error': true,
        'error.type': 'window_error',
        'error.message': event.message,
        'error.filename': event.filename,
        'error.lineno': event.lineno,
        'error.colno': event.colno,
        'page.url': window.location.href,
      });
      
      if (event.error) {
        span.recordException(event.error);
      }
      
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: event.message
      });
      
      telemetryService.recordMetric('errors.window', 1, {
        'error.type': event.error?.name || 'unknown'
      });
    } finally {
      span.end();
    }
  });
}