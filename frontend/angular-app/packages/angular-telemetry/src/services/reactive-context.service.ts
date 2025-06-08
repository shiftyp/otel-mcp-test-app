import { Injectable, OnDestroy } from '@angular/core';
import { 
  Observable, BehaviorSubject, Subject, MonoTypeOperatorFunction, 
  of, EMPTY, fromEvent
} from 'rxjs';
import { 
  tap, concatMap, catchError, filter, takeUntil, throttleTime 
} from 'rxjs/operators';
import { context, trace, SpanContext } from '@opentelemetry/api';

export interface SpanContextCarrier {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
  baggage?: Record<string, string>;
}

export interface ContextChangeEvent {
  previousContext: SpanContextCarrier | null;
  currentContext: SpanContextCarrier | null;
  timestamp: number;
  source: 'manual' | 'http' | 'async' | 'frame';
}

@Injectable({
  providedIn: 'root'
})
export class ReactiveContextService implements OnDestroy {
  private readonly contextSubject$ = new BehaviorSubject<SpanContextCarrier | null>(null);
  private readonly contextChanges$ = new Subject<ContextChangeEvent>();
  private readonly destroy$ = new Subject<void>();
  
  // Frame context bridges
  private frameContexts = new Map<Window, Subject<SpanContextCarrier>>();
  private frameChannels = new Map<Window, MessageChannel>();
  
  constructor() {
    this.initializeContextCapture();
  }
  
  private initializeContextCapture(): void {
    // Listen for context changes in the active context
    // In a real implementation, this would hook into OpenTelemetry's context manager
    // For now, we'll manually update context when spans are created
  }
  
  /**
   * Gets the current context as an observable
   */
  getCurrentContext$(): Observable<SpanContextCarrier | null> {
    return this.contextSubject$.asObservable();
  }
  
  /**
   * Gets context change events
   */
  getContextChanges$(): Observable<ContextChangeEvent> {
    return this.contextChanges$.asObservable();
  }
  
  /**
   * Sets the current context
   */
  setContext(carrier: SpanContextCarrier | null, source: ContextChangeEvent['source'] = 'manual'): void {
    const previousContext = this.contextSubject$.value;
    this.contextSubject$.next(carrier);
    
    this.contextChanges$.next({
      previousContext,
      currentContext: carrier,
      timestamp: Date.now(),
      source
    });
  }
  
  /**
   * Updates context from the current active span
   */
  updateFromActiveSpan(): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      this.setContext({
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        traceFlags: spanContext.traceFlags,
        traceState: spanContext.traceState?.serialize()
      }, 'manual');
    }
  }
  
  /**
   * RxJS operator to propagate context through streams
   */
  withContext<T>(): MonoTypeOperatorFunction<T> {
    return (source$: Observable<T>) => {
      return source$.pipe(
        concatMap(value => {
          const currentContext = this.contextSubject$.value;
          
          if (!currentContext) {
            return of(value);
          }
          
          // Create a new context with the span context
          return new Observable(observer => {
            // Execute within the context
            const span = trace.getTracer('rxjs').startSpan('stream-operation', {
              attributes: {
                'context.propagated': true,
                'context.trace_id': currentContext.traceId,
                'context.span_id': currentContext.spanId
              }
            });
            
            const ctx = trace.setSpan(context.active(), span);
            
            context.with(ctx, () => {
              observer.next(value);
              observer.complete();
            });
            
            span.end();
          });
        })
      );
    };
  }
  
  /**
   * Operator to capture context at subscription time
   */
  captureContext<T>(): MonoTypeOperatorFunction<T> {
    return (source$: Observable<T>) => {
      return source$.pipe(
        tap({
          subscribe: () => {
            this.updateFromActiveSpan();
          }
        })
      );
    };
  }
  
  /**
   * Bridge context to another window (iframe, worker, etc.)
   */
  bridgeToFrame(targetWindow: Window, targetOrigin = '*'): Observable<SpanContextCarrier> {
    if (this.frameContexts.has(targetWindow)) {
      return this.frameContexts.get(targetWindow)!.asObservable();
    }
    
    const channel = new MessageChannel();
    const contextStream$ = new Subject<SpanContextCarrier>();
    
    this.frameContexts.set(targetWindow, contextStream$);
    this.frameChannels.set(targetWindow, channel);
    
    // Send initial handshake
    targetWindow.postMessage({
      type: 'TELEMETRY_CONTEXT_INIT',
      port: channel.port2
    }, targetOrigin, [channel.port2]);
    
    // Listen for context from frame
    channel.port1.onmessage = (event) => {
      if (event.data?.type === 'TELEMETRY_CONTEXT_UPDATE') {
        contextStream$.next(event.data.context);
      }
    };
    
    // Send context updates to frame
    this.contextSubject$.pipe(
      filter(ctx => ctx !== null),
      throttleTime(100),
      takeUntil(this.destroy$)
    ).subscribe(context => {
      targetWindow.postMessage({
        type: 'TELEMETRY_CONTEXT_UPDATE',
        context
      }, targetOrigin);
    });
    
    return contextStream$.asObservable();
  }
  
  /**
   * Listen for context from parent frame
   */
  listenForParentContext(): Observable<SpanContextCarrier> {
    if (window.parent === window) {
      return EMPTY;
    }
    
    return new Observable(observer => {
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'TELEMETRY_CONTEXT_INIT' && event.data.port) {
          // Store the port for bidirectional communication
          const port = event.data.port as MessagePort;
          
          port.onmessage = (portEvent) => {
            if (portEvent.data?.type === 'TELEMETRY_CONTEXT_UPDATE') {
              const context = portEvent.data.context;
              this.setContext(context, 'frame');
              observer.next(context);
            }
          };
          
          // Send current context to parent
          const currentContext = this.contextSubject$.value;
          if (currentContext) {
            port.postMessage({
              type: 'TELEMETRY_CONTEXT_UPDATE',
              context: currentContext
            });
          }
        } else if (event.data?.type === 'TELEMETRY_CONTEXT_UPDATE') {
          const context = event.data.context;
          this.setContext(context, 'frame');
          observer.next(context);
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      return () => {
        window.removeEventListener('message', handleMessage);
      };
    });
  }
  
  /**
   * Create a context-aware HTTP interceptor operator
   */
  propagateToHttp<T>(): MonoTypeOperatorFunction<T> {
    return (source$: Observable<T>) => {
      return source$.pipe(
        tap(() => {
          const context = this.contextSubject$.value;
          if (context) {
            // In a real implementation, this would inject headers
            // For now, we'll just log
            console.debug('Would propagate context to HTTP:', {
              'traceparent': `00-${context.traceId}-${context.spanId}-${context.traceFlags.toString(16).padStart(2, '0')}`
            });
          }
        })
      );
    };
  }
  
  /**
   * Extract context from HTTP headers
   */
  extractFromHeaders(headers: Record<string, string>): SpanContextCarrier | null {
    const traceparent = headers['traceparent'];
    if (!traceparent) return null;
    
    // Parse W3C Trace Context format: version-trace_id-parent_id-trace_flags
    const parts = traceparent.split('-');
    if (parts.length !== 4) return null;
    
    return {
      traceId: parts[1],
      spanId: parts[2],
      traceFlags: parseInt(parts[3], 16),
      traceState: headers['tracestate']
    };
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.contextSubject$.complete();
    this.contextChanges$.complete();
    
    // Clean up frame contexts
    this.frameContexts.forEach(context => context.complete());
    this.frameContexts.clear();
    
    // Close message channels
    this.frameChannels.forEach(channel => {
      channel.port1.close();
    });
    this.frameChannels.clear();
  }
}