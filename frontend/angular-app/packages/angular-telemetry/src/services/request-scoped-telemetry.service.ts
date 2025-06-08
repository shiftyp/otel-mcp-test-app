import { Injectable, InjectionToken, OnDestroy } from '@angular/core';
import { 
  Observable, Subject, BehaviorSubject, race, timer, EMPTY,
  merge, combineLatest
} from 'rxjs';
import { 
  map, filter, scan, takeUntil, finalize, shareReplay,
  debounceTime, distinctUntilChanged
} from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

export const REQUEST_ID = new InjectionToken<string>('REQUEST_ID');

export interface RequestContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
  startTime: number;
  metadata: Record<string, any>;
}

export interface TelemetryEvent {
  type: 'span' | 'metric' | 'log';
  requestId: string;
  timestamp: number;
  data: any;
}

export interface RequestTelemetryStats {
  requestId: string;
  spanCount: number;
  metricCount: number;
  logCount: number;
  duration: number;
  status: 'active' | 'completed' | 'timeout';
}

@Injectable({
  providedIn: 'root'
})
export class RequestScopedTelemetryService implements OnDestroy {
  private requestStreams = new Map<string, Subject<TelemetryEvent>>();
  private requestContexts = new Map<string, RequestContext>();
  private requestStats = new Map<string, BehaviorSubject<RequestTelemetryStats>>();
  private destroy$ = new Subject<void>();
  
  // Global stream of all request telemetry
  private allRequests$ = new Subject<TelemetryEvent>();
  
  // Configuration
  private readonly REQUEST_TIMEOUT = 300000; // 5 minutes
  private readonly MAX_CONCURRENT_REQUESTS = 1000;
  
  /**
   * Start tracking telemetry for a new request
   */
  startRequest(context: Partial<RequestContext>): Observable<TelemetryEvent> {
    const requestId = context.requestId || this.generateRequestId();
    
    // Enforce concurrent request limit
    if (this.requestStreams.size >= this.MAX_CONCURRENT_REQUESTS) {
      // Clean up oldest request
      const oldestKey = this.requestStreams.keys().next().value;
      this.endRequest(oldestKey);
    }
    
    const fullContext: RequestContext = {
      requestId,
      startTime: Date.now(),
      ...context,
      metadata: context.metadata || {}
    };
    
    // Create request stream
    const stream$ = new Subject<TelemetryEvent>();
    this.requestStreams.set(requestId, stream$);
    this.requestContexts.set(requestId, fullContext);
    
    // Initialize stats
    const stats$ = new BehaviorSubject<RequestTelemetryStats>({
      requestId,
      spanCount: 0,
      metricCount: 0,
      logCount: 0,
      duration: 0,
      status: 'active'
    });
    this.requestStats.set(requestId, stats$);
    
    // Auto-complete stream after timeout or explicit end
    const requestEnd$ = new Subject<void>();
    const timeout$ = timer(this.REQUEST_TIMEOUT);
    
    return stream$.pipe(
      // Update stats on each event
      map(event => {
        const currentStats = stats$.value;
        const newStats = { ...currentStats };
        
        switch (event.type) {
          case 'span':
            newStats.spanCount++;
            break;
          case 'metric':
            newStats.metricCount++;
            break;
          case 'log':
            newStats.logCount++;
            break;
        }
        
        newStats.duration = Date.now() - fullContext.startTime;
        stats$.next(newStats);
        
        // Forward to global stream
        this.allRequests$.next(event);
        
        return event;
      }),
      
      // Complete on timeout or explicit end
      takeUntil(
        race(timeout$, requestEnd$).pipe(
          map(() => {
            const finalStats = stats$.value;
            finalStats.status = requestEnd$.closed ? 'completed' : 'timeout';
            finalStats.duration = Date.now() - fullContext.startTime;
            stats$.next(finalStats);
            return null;
          })
        )
      ),
      
      // Cleanup on completion
      finalize(() => {
        this.requestStreams.delete(requestId);
        this.requestContexts.delete(requestId);
        
        // Keep stats for a while after completion for queries
        setTimeout(() => {
          stats$.complete();
          this.requestStats.delete(requestId);
        }, 60000); // Keep for 1 minute
      }),
      
      // Share the stream
      shareReplay({ bufferSize: 100, refCount: true })
    );
  }
  
  /**
   * End a request explicitly
   */
  endRequest(requestId: string): void {
    const stream = this.requestStreams.get(requestId);
    if (stream) {
      stream.complete();
    }
  }
  
  /**
   * Continue an existing request (e.g., after SSR handoff)
   */
  continueRequest(requestId: string, context?: Partial<RequestContext>): Observable<TelemetryEvent> {
    // If request already exists, return existing stream
    const existingStream = this.requestStreams.get(requestId);
    if (existingStream) {
      return existingStream.asObservable();
    }
    
    // Otherwise start new request with provided context
    return this.startRequest({ requestId, ...context });
  }
  
  /**
   * Add telemetry event to a request
   */
  addTelemetryEvent(requestId: string, event: Omit<TelemetryEvent, 'requestId' | 'timestamp'>): void {
    const stream = this.requestStreams.get(requestId);
    if (stream) {
      stream.next({
        ...event,
        requestId,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Get request context
   */
  getRequestContext(requestId: string): RequestContext | undefined {
    return this.requestContexts.get(requestId);
  }
  
  /**
   * Get request telemetry stream
   */
  getRequestStream(requestId: string): Observable<TelemetryEvent> {
    const stream = this.requestStreams.get(requestId);
    return stream ? stream.asObservable() : EMPTY;
  }
  
  /**
   * Get request stats
   */
  getRequestStats$(requestId: string): Observable<RequestTelemetryStats> {
    const stats = this.requestStats.get(requestId);
    return stats ? stats.asObservable() : EMPTY;
  }
  
  /**
   * Get all active requests
   */
  getActiveRequests$(): Observable<RequestContext[]> {
    return new BehaviorSubject(
      Array.from(this.requestContexts.values())
    ).asObservable();
  }
  
  /**
   * Get global telemetry stream
   */
  getAllTelemetry$(): Observable<TelemetryEvent> {
    return this.allRequests$.asObservable();
  }
  
  /**
   * Get aggregated stats across all requests
   */
  getAggregatedStats$(): Observable<{
    activeRequests: number;
    totalSpans: number;
    totalMetrics: number;
    totalLogs: number;
    requestsPerMinute: number;
  }> {
    return combineLatest(
      Array.from(this.requestStats.values()).map(stats$ => stats$.asObservable())
    ).pipe(
      map(allStats => {
        const activeRequests = allStats.filter(s => s.status === 'active').length;
        const totalSpans = allStats.reduce((sum, s) => sum + s.spanCount, 0);
        const totalMetrics = allStats.reduce((sum, s) => sum + s.metricCount, 0);
        const totalLogs = allStats.reduce((sum, s) => sum + s.logCount, 0);
        
        // Calculate requests per minute (simplified)
        const now = Date.now();
        const recentRequests = Array.from(this.requestContexts.values())
          .filter(ctx => now - ctx.startTime < 60000).length;
        
        return {
          activeRequests,
          totalSpans,
          totalMetrics,
          totalLogs,
          requestsPerMinute: recentRequests
        };
      }),
      debounceTime(1000),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      shareReplay(1)
    );
  }
  
  /**
   * Create a scoped telemetry context for a specific request
   */
  createScopedContext(requestId: string) {
    return {
      addSpan: (span: any) => this.addTelemetryEvent(requestId, { type: 'span', data: span }),
      addMetric: (metric: any) => this.addTelemetryEvent(requestId, { type: 'metric', data: metric }),
      addLog: (log: any) => this.addTelemetryEvent(requestId, { type: 'log', data: log }),
      getStream: () => this.getRequestStream(requestId),
      getStats: () => this.getRequestStats$(requestId),
      end: () => this.endRequest(requestId)
    };
  }
  
  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  ngOnDestroy(): void {
    // Complete all active requests
    this.requestStreams.forEach(stream => stream.complete());
    this.requestStreams.clear();
    
    // Complete all stats
    this.requestStats.forEach(stats => stats.complete());
    this.requestStats.clear();
    
    // Clear contexts
    this.requestContexts.clear();
    
    // Complete subjects
    this.allRequests$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }
}