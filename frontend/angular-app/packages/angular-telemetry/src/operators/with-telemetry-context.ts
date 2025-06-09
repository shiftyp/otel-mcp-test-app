import { Observable, MonoTypeOperatorFunction, defer } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import { context, trace, Span } from '@opentelemetry/api';
import { ReactiveContextService } from '../services/reactive-context.service';

/**
 * RxJS operator that ensures telemetry context is propagated through async operations
 * 
 * @param spanName - Name for the span that will wrap this operation
 * @param contextService - The reactive context service instance
 * @returns An operator function that maintains context
 * 
 * @example
 * ```typescript
 * someObservable$.pipe(
 *   withTelemetryContext('process-data', this.contextService),
 *   map(data => transform(data)),
 *   withTelemetryContext('save-data', this.contextService),
 *   switchMap(data => this.api.save(data))
 * ).subscribe();
 * ```
 */
export function withTelemetryContext<T>(
  spanName: string,
  contextService: ReactiveContextService,
  attributes?: Record<string, any>
): MonoTypeOperatorFunction<T> {
  return (source$: Observable<T>) => {
    return defer(() => {
      // Capture the current context at subscription time
      const activeSpan = trace.getActiveSpan();
      const currentContext = activeSpan ? trace.setSpan(context.active(), activeSpan) : context.active();
      
      // Create a new span for this operation
      const span = trace.getTracer('rxjs').startSpan(spanName, {
        attributes: {
          'rxjs.operator': 'withTelemetryContext',
          ...attributes
        }
      });
      
      // Update the reactive context service
      const spanContext = span.spanContext();
      contextService.setContext({
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        traceFlags: spanContext.traceFlags
      }, 'async');
      
      // Create a new context with our span
      const newContext = trace.setSpan(currentContext, span);
      
      return source$.pipe(
        tap({
          subscribe: () => {
            span.addEvent('stream_subscribed');
          },
          next: () => {
            span.addEvent('value_emitted');
          },
          error: (error) => {
            span.recordException(error);
            span.setStatus({ code: 2, message: error.message });
          },
          complete: () => {
            span.addEvent('stream_completed');
            span.setStatus({ code: 0 });
          }
        }),
        finalize(() => {
          span.end();
          
          // Restore previous context if there was one
          if (activeSpan) {
            const prevSpanContext = activeSpan.spanContext();
            contextService.setContext({
              traceId: prevSpanContext.traceId,
              spanId: prevSpanContext.spanId,
              traceFlags: prevSpanContext.traceFlags
            }, 'async');
          }
        })
      );
    });
  };
}

/**
 * Creates a factory function for withTelemetryContext that's pre-configured with a context service
 * 
 * @example
 * ```typescript
 * export class MyService {
 *   private withContext = createContextOperator(this.contextService);
 *   
 *   processData(data$: Observable<Data>) {
 *     return data$.pipe(
 *       this.withContext('validate'),
 *       filter(valid),
 *       this.withContext('transform'),
 *       map(transform)
 *     );
 *   }
 * }
 * ```
 */
export function createContextOperator(contextService: ReactiveContextService) {
  return <T>(spanName: string, attributes?: Record<string, any>): MonoTypeOperatorFunction<T> => {
    return withTelemetryContext(spanName, contextService, attributes);
  };
}

/**
 * Operator that automatically propagates context without creating a new span
 */
export function propagateContext<T>(
  contextService: ReactiveContextService
): MonoTypeOperatorFunction<T> {
  return (source$: Observable<T>): Observable<T> => {
    return defer(() => {
      // Capture current context
      const activeSpan = trace.getActiveSpan();
      if (!activeSpan) {
        return source$;
      }
      
      const currentContext = trace.setSpan(context.active(), activeSpan);
      
      return new Observable<T>(subscriber => {
        // Subscribe within the captured context
        return context.with(currentContext, () => {
          return source$.subscribe(subscriber);
        });
      });
    });
  };
}