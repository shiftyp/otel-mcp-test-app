import { 
  signal, computed, effect, Signal, WritableSignal, EffectRef, 
  Injectable, PLATFORM_ID, Inject, Optional, TransferState, makeStateKey
} from '@angular/core';
import { 
  Observable, Subject, BehaviorSubject, interval, race, timer, EMPTY,
  combineLatest, merge, from, fromEvent
} from 'rxjs';
import { 
  bufferWhen, bufferCount, bufferTime, map, filter, scan, 
  mergeMap, concatMap, retry, catchError, tap, share, 
  shareReplay, startWith, switchMap, take, takeUntil,
  distinctUntilChanged, auditTime, mapTo, mergeAll
} from 'rxjs/operators';
// Platform detection helpers
const isPlatformServer = (platformId: Object): boolean => {
  return platformId === 'server';
};
const isPlatformBrowser = (platformId: Object): boolean => {
  return platformId === 'browser';
};
import { trace, context, SpanStatusCode, metrics, Span, Attributes } from '@opentelemetry/api';
import { 
  ITelemetryService, 
  SignalTelemetryOptions, 
  ComputedTelemetryOptions, 
  EffectTelemetryOptions,
  TelemetryConfig,
  TracedWritableSignal
} from './telemetry.interface';
import { ReactiveContextService } from './reactive-context.service';

interface SignalMetadata {
  name: string;
  initialValue: any;
  lastValue: any;
  updateCount: number;
  createdAt: number;
}

interface MetricRecord {
  name: string;
  value: number;
  attributes?: Attributes;
  timestamp: number;
  priority?: 'high' | 'normal';
}

interface MetricStats {
  totalMetrics: number;
  metricsPerSecond: number;
  bufferSize: number;
  maxBufferSize: number;
}

interface SamplingDecision {
  spanName: string;
  sampled: boolean;
  timestamp: number;
}

interface SamplingStats {
  totalDecisions: number;
  sampledCount: number;
  samplingRate: number;
  byOperation: Map<string, { total: number; sampled: number }>;
}

interface OperationEvent {
  timestamp: number;
  sampled: boolean;
}

// Signal Change Tracking
export interface SignalChangeEvent<T = any> {
  signalName: string;
  previousValue: T;
  currentValue: T;
  timestamp: number;
  source: 'direct' | 'computed' | 'effect';
  stackTrace?: string;
  metadata: {
    updateCount: number;
    timeSinceLastUpdate: number;
    hasActiveSpan: boolean;
    traceId?: string;
    spanId?: string;
  };
}

// Effect Loop Detection
export interface EffectExecutionEvent {
  effectName: string;
  executionId: string;
  timestamp: number;
  duration: number;
  triggerSource: 'signal' | 'computed' | 'effect' | 'unknown';
  dependencies: string[];
  metadata: {
    executionCount: number;
    timeSinceLastExecution: number;
    stackDepth: number;
    isInLoop: boolean;
  };
}

export interface EffectLoopPattern {
  effectName: string;
  pattern: 'rapid_execution' | 'circular_dependency' | 'cascade';
  detectedAt: number;
  executionCount?: number;
  cycleLength?: number;
  affectedEffects?: string[];
}

@Injectable()
export class ConfigurableTelemetryService implements ITelemetryService {
  private isServer: boolean;
  private config: Required<TelemetryConfig>;
  private signalRegistry?: Map<string, SignalMetadata>;
  private readonly destroy$ = new Subject<void>();
  
  // RxJS-based metric batching
  private readonly metricStream$ = new Subject<MetricRecord>();
  private readonly highPriorityStream$ = new Subject<MetricRecord>();
  private metricBuffer$?: Observable<void>;
  private highPriorityExport$?: Observable<void>;
  private metricStatsSubject$ = new BehaviorSubject<MetricStats>({
    totalMetrics: 0,
    metricsPerSecond: 0,
    bufferSize: 0,
    maxBufferSize: 1000
  });
  
  // Smart sampling
  private operationStreams = new Map<string, Subject<OperationEvent>>();
  private samplingDecisions$ = new Subject<SamplingDecision>();
  private samplingBudget$ = new BehaviorSubject<number>(1000);
  
  // Web Vitals
  private webVitals$ = new BehaviorSubject<any>({});
  private webVitalsInitialized = false;
  
  // Signal Change Tracking
  private signalChanges$ = new Subject<SignalChangeEvent>();
  private signalChangeStreams = new Map<string, Subject<SignalChangeEvent>>();
  private readonly MAX_SIGNAL_STREAMS = 1000; // Prevent unbounded growth
  
  // Effect Loop Detection
  private effectExecutions$ = new Subject<EffectExecutionEvent>();
  private effectLoopPatterns$ = new Subject<EffectLoopPattern>();
  private effectMetadata = new Map<string, { count: number; lastExecution: number }>();
  private effectCircuitBreakers = new Map<string, BehaviorSubject<'closed' | 'open' | 'half-open'>>();
  private readonly MAX_EFFECT_TRACKING = 500; // Prevent unbounded growth
  
  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    @Optional() private transferState?: TransferState,
    @Optional() @Inject('TELEMETRY_CONFIG') config?: TelemetryConfig,
    @Optional() private reactiveContext?: ReactiveContextService
  ) {
    this.isServer = isPlatformServer(this.platformId);
    
    // Apply default configuration
    this.config = {
      enableStateTransfer: false,
      enableWebVitals: false,
      enableSmartSampling: false,
      enableEffectLoopDetection: false,
      enableBatchedMetrics: false,
      enableRequestContext: false,
      defaultSampleRate: 0.1,
      serverSampleRateMultiplier: 0.1,
      enableMetrics: true,
      enableLogging: true,
      metricsFlushInterval: 5000,
      slowComputationThreshold: 100,
      slowEffectThreshold: 100,
      ...config
    };
    
    this.initialize();
  }
  
  private initialize(): void {
    // Initialize state transfer
    if (this.config.enableStateTransfer && this.transferState) {
      this.signalRegistry = new Map();
      if (isPlatformBrowser(this.platformId)) {
        this.hydrateFromServer();
      }
    }
    
    // Initialize RxJS-based metric batching
    if (this.config.enableBatchedMetrics && isPlatformBrowser(this.platformId)) {
      this.initializeMetricBatching();
    }
    
    // Initialize smart sampling
    if (this.config.enableSmartSampling) {
      this.initializeSmartSampling();
    }
    
    // Initialize Web Vitals
    if (this.config.enableWebVitals && isPlatformBrowser(this.platformId)) {
      this.initializeWebVitals();
    }
    
    // Initialize Effect Loop Detection
    if (this.config.enableEffectLoopDetection) {
      this.initializeEffectLoopDetection();
    }
  }
  
  private initializeMetricBatching(): void {
    const batchConfig = this.config.metricBatching || {
      flushInterval: 5000,
      maxBatchSize: 100,
      maxQueueSize: 1000,
      autoFlushThreshold: 0.8
    };
    
    // Configure metric buffer with backpressure handling
    this.metricBuffer$ = this.metricStream$.pipe(
      // Apply backpressure - drop oldest if buffer exceeds limit
      bufferCount(batchConfig.maxQueueSize, batchConfig.maxQueueSize),
      map(buffer => buffer.slice(-batchConfig.maxBatchSize)),
      mergeAll(),
      
      // Batch by time or size
      bufferWhen(() => 
        race(
          interval(batchConfig.flushInterval),
          this.metricStream$.pipe(
            scan((acc, _) => acc + 1, 0),
            filter(count => count >= batchConfig.maxBatchSize * batchConfig.autoFlushThreshold)
          )
        )
      ),
      
      // Filter empty batches
      filter(batch => batch.length > 0),
      
      // Export batch
      mergeMap(batch => 
        from(this.exportMetricBatch(batch)).pipe(
          retry({
            count: 3,
            delay: (error, retryCount) => 
              timer(Math.pow(2, retryCount) * 1000)
          }),
          catchError(error => {
            console.error('Failed to export metrics batch:', error);
            return EMPTY;
          })
        )
      ),
      
      // Share the subscription
      share(),
      
      // Complete on destroy
      takeUntil(this.destroy$)
    );
    
    // High priority metrics bypass batching
    this.highPriorityExport$ = this.highPriorityStream$.pipe(
      concatMap(metric => 
        from(this.exportSingleMetric(metric)).pipe(
          retry({ count: 2, delay: 1000 }),
          catchError(error => {
            console.error('Failed to export high priority metric:', error);
            return EMPTY;
          })
        )
      ),
      takeUntil(this.destroy$)
    );
    
    // Subscribe to both streams
    merge(
      this.metricBuffer$,
      this.highPriorityExport$
    ).subscribe();
    
    // Update stats
    this.metricStream$.pipe(
      scan((acc, _) => acc + 1, 0),
      startWith(0),
      takeUntil(this.destroy$)
    ).subscribe(total => {
      this.metricStatsSubject$.next({
        ...this.metricStatsSubject$.value,
        totalMetrics: total
      });
    });
    
    // Flush on page unload
    if (isPlatformBrowser(this.platformId)) {
      fromEvent(window, 'beforeunload').pipe(
        take(1)
      ).subscribe(() => this.flush());
    }
  }
  
  private initializeSmartSampling(): void {
    // Initialize budget refill
    interval(60000).pipe( // Every minute
      startWith(0),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      const budget = this.config.smartSampling?.budgetPerMinute || 1000;
      this.samplingBudget$.next(budget);
    });
    
    // Track sampling decisions
    this.samplingDecisions$.pipe(
      bufferTime(1000),
      filter(decisions => decisions.length > 0),
      takeUntil(this.destroy$)
    ).subscribe(decisions => {
      // Update sampling statistics
      const stats = this.calculateSamplingStats(decisions);
      // Could emit to a stats observable if needed
    });
  }
  
  private hydrateFromServer(): void {
    if (!this.transferState || !this.signalRegistry) return;
    
    const stateKey = makeStateKey<SignalMetadata[]>('TELEMETRY_SIGNALS');
    const signals = this.transferState.get(stateKey, []);
    
    signals.forEach(metadata => {
      this.signalRegistry!.set(metadata.name, metadata);
    });
  }
  
  private initializeEffectLoopDetection(): void {
    // Rapid execution detection
    this.effectExecutions$.pipe(
      bufferTime(1000),
      filter(events => events.length > 0),
      map(events => {
        const byEffect = new Map<string, EffectExecutionEvent[]>();
        events.forEach(event => {
          const existing = byEffect.get(event.effectName) || [];
          existing.push(event);
          byEffect.set(event.effectName, existing);
        });
        return byEffect;
      }),
      mergeMap(byEffect => {
        const patterns: EffectLoopPattern[] = [];
        byEffect.forEach((events, effectName) => {
          if (events.length > 10) {
            patterns.push({
              effectName,
              pattern: 'rapid_execution',
              detectedAt: Date.now(),
              executionCount: events.length
            });
            
            // Open circuit breaker
            this.openCircuitBreaker(effectName);
          }
        });
        return from(patterns);
      }),
      takeUntil(this.destroy$)
    ).subscribe(pattern => {
      this.effectLoopPatterns$.next(pattern);
      console.warn(`Effect loop detected: ${pattern.effectName} - ${pattern.pattern}`, pattern);
    });
    
    // Circular dependency detection
    this.effectExecutions$.pipe(
      scan((acc, event) => {
        const chain = [...acc.chain, event.effectName];
        const cycleStart = chain.indexOf(event.effectName);
        const hasCycle = cycleStart !== chain.length - 1;
        
        if (hasCycle) {
          const cycle = chain.slice(cycleStart);
          return { 
            chain: [], 
            hasCycle: true, 
            cycle,
            event 
          };
        }
        
        return { 
          chain: chain.length > 10 ? [] : chain, 
          hasCycle: false,
          cycle: [],
          event 
        };
      }, { chain: [] as string[], hasCycle: false, cycle: [] as string[], event: null as any }),
      filter(state => state.hasCycle),
      takeUntil(this.destroy$)
    ).subscribe(state => {
      this.effectLoopPatterns$.next({
        effectName: state.event.effectName,
        pattern: 'circular_dependency',
        detectedAt: Date.now(),
        cycleLength: state.cycle.length,
        affectedEffects: state.cycle
      });
    });
    
    // Circuit breaker reset timer
    interval(30000).pipe( // Every 30 seconds
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.effectCircuitBreakers.forEach((breaker, effectName) => {
        if (breaker.value === 'open') {
          breaker.next('half-open');
          console.log(`Circuit breaker for ${effectName} moved to half-open`);
        }
      });
    });
  }
  
  private openCircuitBreaker(effectName: string): void {
    if (!this.effectCircuitBreakers.has(effectName)) {
      // Prevent unbounded growth
      if (this.effectCircuitBreakers.size >= this.MAX_EFFECT_TRACKING) {
        const firstKey = this.effectCircuitBreakers.keys().next().value;
        const firstBreaker = this.effectCircuitBreakers.get(firstKey);
        firstBreaker?.complete();
        this.effectCircuitBreakers.delete(firstKey);
      }
      this.effectCircuitBreakers.set(effectName, new BehaviorSubject<'closed' | 'open' | 'half-open'>('closed'));
    }
    this.effectCircuitBreakers.get(effectName)!.next('open');
    console.warn(`Circuit breaker opened for effect: ${effectName}`);
  }
  
  private shouldExecuteEffect(effectName: string): boolean {
    const breaker = this.effectCircuitBreakers.get(effectName);
    if (!breaker) return true;
    
    const state = breaker.value;
    if (state === 'closed') return true;
    if (state === 'open') return false;
    
    // Half-open: allow one execution to test
    breaker.next('closed');
    return true;
  }
  
  private initializeWebVitals(): void {
    if (this.webVitalsInitialized) return;
    this.webVitalsInitialized = true;
    
    // @ts-ignore - Optional dependency
    import('web-vitals').then((webVitals: any) => {
      const { onCLS, onFID, onFCP, onLCP, onTTFB, onINP } = webVitals;
      const meter = metrics.getMeter('web-vitals');
      const config = this.config.webVitalsConfig || {
        reportAllChanges: false,
        thresholds: { LCP: 2500, FID: 100, CLS: 0.1 }
      };
      
      const currentVitals: any = {};
      
      onCLS((metric: any) => {
        const histogram = meter.createHistogram('web_vitals_cls');
        histogram.record(metric.value, { 
          rating: metric.rating,
          entries: metric.entries.length
        });
        currentVitals.CLS = metric.value;
        this.webVitals$.next({ ...currentVitals });
        
        // Record as high priority metric if poor
        if (metric.value > config.thresholds.CLS * 2.5) {
          this.recordMetric('web_vitals_cls_poor', metric.value, {
            rating: metric.rating
          }, 'high');
        }
      }, { reportAllChanges: config.reportAllChanges });
      
      onFID((metric: any) => {
        const histogram = meter.createHistogram('web_vitals_fid');
        histogram.record(metric.value, { rating: metric.rating });
        currentVitals.FID = metric.value;
        this.webVitals$.next({ ...currentVitals });
        
        if (metric.value > config.thresholds.FID * 4) {
          this.recordMetric('web_vitals_fid_poor', metric.value, {
            rating: metric.rating
          }, 'high');
        }
      });
      
      onFCP((metric: any) => {
        const histogram = meter.createHistogram('web_vitals_fcp');
        histogram.record(metric.value, { rating: metric.rating });
        currentVitals.FCP = metric.value;
        this.webVitals$.next({ ...currentVitals });
      });
      
      onLCP((metric: any) => {
        const histogram = meter.createHistogram('web_vitals_lcp');
        histogram.record(metric.value, { rating: metric.rating });
        currentVitals.LCP = metric.value;
        this.webVitals$.next({ ...currentVitals });
        
        // Correlate with active trace
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          activeSpan.setAttribute('web_vitals.lcp', metric.value);
          activeSpan.setAttribute('web_vitals.lcp_rating', metric.rating);
        }
        
        if (metric.value > config.thresholds.LCP * 1.6) {
          this.recordMetric('web_vitals_lcp_poor', metric.value, {
            rating: metric.rating,
            element: metric.entries[0]?.element || 'unknown'
          }, 'high');
        }
      }, { reportAllChanges: config.reportAllChanges });
      
      onTTFB((metric: any) => {
        const histogram = meter.createHistogram('web_vitals_ttfb');
        histogram.record(metric.value, { rating: metric.rating });
        currentVitals.TTFB = metric.value;
        this.webVitals$.next({ ...currentVitals });
      });
      
      // INP (Interaction to Next Paint) - newer metric
      if (onINP) {
        onINP((metric: any) => {
          const histogram = meter.createHistogram('web_vitals_inp');
          histogram.record(metric.value, { rating: metric.rating });
          currentVitals.INP = metric.value;
          this.webVitals$.next({ ...currentVitals });
        });
      }
    }).catch(() => {
      console.warn('Web Vitals library not available');
    });
  }
  
  createTracedSignal<T>(
    initialValue: T,
    name: string,
    options?: SignalTelemetryOptions<T>
  ): TracedWritableSignal<T> {
    const baseSignal = signal(initialValue);
    const opts = {
      sampleRate: this.config.defaultSampleRate,
      recordMetrics: this.config.enableMetrics,
      skipInitialValue: false,
      ...options
    };
    
    // Register signal for state transfer if enabled
    let metadata: SignalMetadata | undefined;
    if (this.config.enableStateTransfer && this.signalRegistry) {
      metadata = {
        name,
        initialValue,
        lastValue: initialValue,
        updateCount: 0,
        createdAt: Date.now()
      };
      this.signalRegistry.set(name, metadata);
    }
    
    const effectiveSampleRate = this.isServer 
      ? opts.sampleRate * this.config.serverSampleRateMultiplier 
      : opts.sampleRate;
    
    const shouldTrace = () => {
      const activeSpan = trace.getActiveSpan();
      if (activeSpan) return true;
      
      // Smart sampling if enabled
      if (this.config.enableSmartSampling) {
        return this.shouldSampleOperation(name, {
          updateCount: metadata?.updateCount || 0,
          isSignal: true,
          platform: this.isServer ? 'server' : 'browser'
        });
      }
      
      return Math.random() < effectiveSampleRate;
    };
    
    const createSpan = (operation: string): Span | null => {
      if (!shouldTrace()) return null;
      
      const span = trace.getTracer('signals').startSpan(
        opts.spanName || `signal.${name}.${operation}`,
        {
          attributes: {
            'signal.name': name,
            'signal.operation': operation,
            'signal.has_parent_trace': !!trace.getActiveSpan(),
            'signal.platform': this.isServer ? 'server' : 'browser',
            ...(metadata && {
              'signal.update_count': metadata.updateCount,
              'signal.age_ms': Date.now() - metadata.createdAt
            }),
            ...(opts.trackerName && { 'signal.tracker': opts.trackerName })
          }
        }
      );
      
      // Update reactive context if available
      if (this.reactiveContext) {
        const spanContext = span.spanContext();
        this.reactiveContext.setContext({
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
          traceFlags: spanContext.traceFlags
        }, 'manual');
      }
      
      // Add request context if enabled
      if (this.config.enableRequestContext) {
        const requestId = this.getRequestId();
        if (requestId) {
          span.setAttribute('request.id', requestId);
        }
      }
      
      return span;
    };
    
    // Create wrapper for signal operations
    const tracedSignal = {
      set: (value: T) => {
        if (opts.recordMetrics) {
          this.recordMetricInternal('signal_writes', 1, {
            signal_name: name,
            has_parent: !!trace.getActiveSpan(),
            platform: this.isServer ? 'server' : 'browser'
          });
        }
        
        const span = createSpan('write');
        
        try {
          const previousValue = baseSignal();
          const timestamp = Date.now();
          baseSignal.set(value);
          
          if (metadata) {
            const timeSinceLastUpdate = timestamp - (metadata.createdAt + (metadata.updateCount * 100)); // Approximate
            metadata.lastValue = value;
            metadata.updateCount++;
            
            // Emit change event
            const changeEvent: SignalChangeEvent<T> = {
              signalName: name,
              previousValue,
              currentValue: value,
              timestamp,
              source: 'direct',
              metadata: {
                updateCount: metadata.updateCount,
                timeSinceLastUpdate,
                hasActiveSpan: !!span,
                traceId: span?.spanContext().traceId,
                spanId: span?.spanContext().spanId
              }
            };
            
            // Emit to individual signal stream
            if (!this.signalChangeStreams.has(name)) {
              // Prevent unbounded growth - remove oldest if at limit
              if (this.signalChangeStreams.size >= this.MAX_SIGNAL_STREAMS) {
                const firstKey = this.signalChangeStreams.keys().next().value;
                const firstStream = this.signalChangeStreams.get(firstKey);
                firstStream?.complete();
                this.signalChangeStreams.delete(firstKey);
              }
              this.signalChangeStreams.set(name, new Subject<SignalChangeEvent>());
            }
            this.signalChangeStreams.get(name)!.next(changeEvent);
            
            // Emit to global stream
            this.signalChanges$.next(changeEvent);
          }
          
          if (span) {
            span.setAttributes({
              'signal.value_changed': previousValue !== value
            });
            
            if (opts.attributes && value !== undefined) {
              const attrs = opts.attributes(value);
              span.setAttributes(attrs);
            }
            
            span.setStatus({ code: SpanStatusCode.OK });
          }
          
          // Transfer state on server if enabled
          if (this.isServer && this.config.enableStateTransfer && this.transferState && !opts.skipInitialValue) {
            this.prepareStateTransfer();
          }
        } catch (error) {
          if (span) {
            span.recordException(error as Error);
            span.setStatus({ code: SpanStatusCode.ERROR });
          }
          throw error;
        } finally {
          span?.end();
        }
      },
      
      update: (updateFn: (value: T) => T) => {
        if (opts.recordMetrics) {
          this.recordMetricInternal('signal_updates', 1, {
            signal_name: name,
            has_parent: !!trace.getActiveSpan(),
            platform: this.isServer ? 'server' : 'browser'
          });
        }
        
        const span = createSpan('update');
        
        try {
          const previousValue = baseSignal();
          const timestamp = Date.now();
          baseSignal.update(updateFn);
          const currentValue = baseSignal();
          
          if (metadata) {
            const timeSinceLastUpdate = timestamp - (metadata.createdAt + (metadata.updateCount * 100));
            metadata.lastValue = currentValue;
            metadata.updateCount++;
            
            // Emit change event
            const changeEvent: SignalChangeEvent<T> = {
              signalName: name,
              previousValue,
              currentValue,
              timestamp,
              source: 'direct',
              metadata: {
                updateCount: metadata.updateCount,
                timeSinceLastUpdate,
                hasActiveSpan: !!span,
                traceId: span?.spanContext().traceId,
                spanId: span?.spanContext().spanId
              }
            };
            
            // Emit to streams
            if (!this.signalChangeStreams.has(name)) {
              this.signalChangeStreams.set(name, new Subject<SignalChangeEvent>());
            }
            this.signalChangeStreams.get(name)!.next(changeEvent);
            this.signalChanges$.next(changeEvent);
          }
          
          span?.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          if (span) {
            span.recordException(error as Error);
            span.setStatus({ code: SpanStatusCode.ERROR });
          }
          throw error;
        } finally {
          span?.end();
        }
      },
      
      asReadonly: () => baseSignal.asReadonly(),
      
      // Add change stream observable
      get changes$(): Observable<SignalChangeEvent<T>> {
        if (!this.signalChangeStreams.has(name)) {
          this.signalChangeStreams.set(name, new Subject<SignalChangeEvent>());
        }
        return this.signalChangeStreams.get(name)!.asObservable();
      }
    };
    
    // Create a wrapped signal that intercepts read operations
    const wrappedSignal = () => {
      // When called as a function, execute traced read logic
      if (opts.recordMetrics) {
        this.recordMetricInternal('signal_reads', 1, {
          signal_name: name,
          has_parent: !!trace.getActiveSpan(),
          platform: this.isServer ? 'server' : 'browser'
        });
      }
      
      const span = createSpan('read');
      if (!span) return baseSignal();
      
      try {
        const value = baseSignal();
        if (opts.attributes && value !== undefined) {
          const attrs = opts.attributes(value);
          span.setAttributes(attrs);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return value;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    };
    
    // Copy all signal methods and properties
    return Object.assign(wrappedSignal, baseSignal, tracedSignal) as TracedWritableSignal<T>;
  }
  
  createTracedComputed<T>(
    computation: () => T,
    name: string,
    options?: ComputedTelemetryOptions<T>
  ): Signal<T> {
    const opts = {
      sampleRate: this.config.defaultSampleRate,
      recordMetrics: this.config.enableMetrics,
      warnOnSlowComputation: this.config.slowComputationThreshold,
      trackDependencies: false,
      ...options
    };
    
    const effectiveSampleRate = this.isServer 
      ? opts.sampleRate * this.config.serverSampleRateMultiplier 
      : opts.sampleRate;
    
    return computed(() => {
      if (opts.recordMetrics) {
        this.recordMetricInternal('computed_executions', 1, {
          computed_name: name,
          has_parent: !!trace.getActiveSpan(),
          platform: this.isServer ? 'server' : 'browser'
        });
      }
      
      const activeSpan = trace.getActiveSpan();
      const shouldTrace = activeSpan || Math.random() < effectiveSampleRate;
      
      if (!shouldTrace) return computation();
      
      const span = trace.getTracer('signals').startSpan(
        opts.spanName || `computed.${name}`,
        {
          attributes: {
            'computed.name': name,
            'signal.has_parent_trace': !!activeSpan,
            'signal.platform': this.isServer ? 'server' : 'browser',
            ...(opts.trackerName && { 'signal.tracker': opts.trackerName })
          }
        }
      );
      
      if (this.config.enableRequestContext) {
        const requestId = this.getRequestId();
        if (requestId) {
          span.setAttribute('request.id', requestId);
        }
      }
      
      const startTime = performance.now();
      
      try {
        const result = computation();
        const duration = performance.now() - startTime;
        
        span.setAttributes({
          'computed.duration_ms': duration
        });
        
        if (opts.warnOnSlowComputation && duration > opts.warnOnSlowComputation) {
          console.warn(`Slow computation detected: ${name} took ${duration}ms`);
          span.addEvent('slow_computation', {
            duration_ms: duration,
            threshold_ms: opts.warnOnSlowComputation
          });
        }
        
        if (opts.attributes && result !== undefined) {
          const attrs = opts.attributes(result);
          span.setAttributes(attrs);
        }
        
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
  
  createTracedEffect(
    effectFn: () => void,
    name: string,
    options?: EffectTelemetryOptions
  ): EffectRef {
    const opts = {
      sampleRate: this.config.defaultSampleRate,
      warnOnSlowEffect: this.config.slowEffectThreshold,
      ...options
    };
    
    const effectiveSampleRate = this.isServer 
      ? opts.sampleRate * this.config.serverSampleRateMultiplier 
      : opts.sampleRate;
    
    let executionCount = 0;
    let lastExecutionTime = 0;
    
    // Initialize effect metadata
    if (!this.effectMetadata.has(name)) {
      // Prevent unbounded growth
      if (this.effectMetadata.size >= this.MAX_EFFECT_TRACKING) {
        // Remove oldest entry (first in iteration order)
        const firstKey = this.effectMetadata.keys().next().value;
        this.effectMetadata.delete(firstKey);
        
        // Also clean up related circuit breaker
        const breaker = this.effectCircuitBreakers.get(firstKey);
        breaker?.complete();
        this.effectCircuitBreakers.delete(firstKey);
      }
      this.effectMetadata.set(name, { count: 0, lastExecution: 0 });
    }
    
    return effect(() => {
      executionCount++;
      const now = Date.now();
      const timeSinceLastExecution = lastExecutionTime ? now - lastExecutionTime : 0;
      lastExecutionTime = now;
      
      // Check circuit breaker
      if (this.config.enableEffectLoopDetection && !this.shouldExecuteEffect(name)) {
        console.warn(`Effect ${name} execution blocked by circuit breaker`);
        return;
      }
      
      // Update metadata
      const metadata = this.effectMetadata.get(name)!;
      metadata.count = executionCount;
      metadata.lastExecution = now;
      
      // Prepare execution event for loop detection
      let executionEvent: EffectExecutionEvent | null = null;
      if (this.config.enableEffectLoopDetection) {
        executionEvent = {
          effectName: name,
          executionId: `${name}-${executionCount}-${now}`,
          timestamp: now,
          duration: 0, // Will be updated after execution
          triggerSource: 'unknown',
          dependencies: [],
          metadata: {
            executionCount,
            timeSinceLastExecution,
            stackDepth: 0,
            isInLoop: timeSinceLastExecution < 10
          }
        };
      }
      
      this.recordMetricInternal('effect_executions', 1, {
        effect_name: name,
        execution_count: executionCount,
        has_parent: !!trace.getActiveSpan(),
        platform: this.isServer ? 'server' : 'browser'
      });
      
      const activeSpan = trace.getActiveSpan();
      const shouldTrace = activeSpan || Math.random() < effectiveSampleRate;
      
      if (!shouldTrace) {
        return;
      }
      
      const span = trace.getTracer('signals').startSpan(
        opts.spanName || `effect.${name}`,
        {
          attributes: {
            'effect.name': name,
            'effect.execution_count': executionCount,
            'signal.has_parent_trace': !!activeSpan,
            'signal.platform': this.isServer ? 'server' : 'browser',
            ...opts.attributes
          }
        }
      );
      
      if (this.config.enableRequestContext) {
        const requestId = this.getRequestId();
        if (requestId) {
          span.setAttribute('request.id', requestId);
        }
      }
      
      if (this.config.enableEffectLoopDetection && timeSinceLastExecution > 0) {
        span.setAttribute('effect.time_since_last_ms', timeSinceLastExecution);
      }
      
      const startTime = performance.now();
      
      try {
        effectFn();
        const duration = performance.now() - startTime;
        
        // Update execution event with duration
        if (executionEvent) {
          executionEvent.duration = duration;
          this.effectExecutions$.next(executionEvent);
        }
        
        span.setAttributes({
          'effect.duration_ms': duration
        });
        
        if (opts.warnOnSlowEffect && duration > opts.warnOnSlowEffect) {
          console.warn(`Slow effect detected: ${name} took ${duration}ms`);
          span.addEvent('slow_effect', {
            duration_ms: duration,
            threshold_ms: opts.warnOnSlowEffect
          });
        }
        
        // Detect effect loops if enabled
        if (this.config.enableEffectLoopDetection && timeSinceLastExecution > 0 && timeSinceLastExecution < 10) {
          span.addEvent('possible_effect_loop', {
            time_between_executions_ms: timeSinceLastExecution,
            execution_count: executionCount
          });
          console.warn(`Possible effect loop detected: ${name} executed ${executionCount} times with ${timeSinceLastExecution}ms between executions`);
        }
        
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        // Update execution event with duration on error
        if (executionEvent) {
          executionEvent.duration = performance.now() - startTime;
          this.effectExecutions$.next(executionEvent);
        }
        
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
  
  log(message: string, data?: any, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.config.enableLogging) return;
    
    const activeSpan = trace.getActiveSpan();
    const logData: Record<string, any> = {
      message,
      timestamp: new Date().toISOString(),
      level,
      platform: this.isServer ? 'server' : 'browser'
    };
    
    if (data !== undefined) {
      logData['data'] = data;
    }
    
    if (activeSpan) {
      logData['traceId'] = activeSpan.spanContext().traceId;
      logData['spanId'] = activeSpan.spanContext().spanId;
      
      activeSpan.addEvent('log', {
        'log.message': message,
        'log.level': level,
        ...(data !== undefined && { 'log.data': JSON.stringify(data) })
      });
    }
    
    if (this.config.enableRequestContext) {
      const requestId = this.getRequestId();
      if (requestId) {
        logData['requestId'] = requestId;
      }
    }
    
    console[level]('📊:', logData);
  }
  
  withSpan<T>(name: string, fn: () => T, attributes?: Record<string, any>): T {
    const span = trace.getTracer('business').startSpan(name, {
      attributes: {
        ...attributes,
        'span.platform': this.isServer ? 'server' : 'browser'
      }
    });
    
    if (this.config.enableRequestContext) {
      const requestId = this.getRequestId();
      if (requestId) {
        span.setAttribute('request.id', requestId);
      }
    }
    
    return context.with(trace.setSpan(context.active(), span), () => {
      try {
        const result = fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
  
  recordMetric(name: string, value: number, attributes?: Record<string, any>, priority: 'high' | 'normal' = 'normal'): void {
    this.recordMetricInternal(name, value, attributes, priority);
  }
  
  private recordMetricInternal(name: string, value: number, attributes?: Record<string, any>, priority: 'high' | 'normal' = 'normal'): void {
    if (!this.config.enableMetrics) return;
    
    const attrs = {
      ...attributes,
      platform: this.isServer ? 'server' : 'browser'
    };
    
    const metric: MetricRecord = {
      name,
      value,
      attributes: attrs,
      timestamp: Date.now(),
      priority
    };
    
    if (this.config.enableBatchedMetrics && isPlatformBrowser(this.platformId)) {
      // Use RxJS streams for batching
      if (priority === 'high' || !this.config.enableBatchedMetrics) {
        this.highPriorityStream$.next(metric);
      } else {
        this.metricStream$.next(metric);
      }
    } else {
      // Direct export (server-side or batching disabled)
      const meter = metrics.getMeter('angular-telemetry');
      const histogram = meter.createHistogram(name, {
        description: 'Business metric histogram'
      });
      histogram.record(value, attrs);
    }
  }
  
  private async exportMetricBatch(batch: MetricRecord[]): Promise<void> {
    const meter = metrics.getMeter('angular-telemetry');
    const grouped = new Map<string, MetricRecord[]>();
    
    // Group by metric name for efficient recording
    batch.forEach(record => {
      const existing = grouped.get(record.name) || [];
      existing.push(record);
      grouped.set(record.name, existing);
    });
    
    // Record all batched metrics
    for (const [name, records] of grouped) {
      const histogram = meter.createHistogram(name, {
        description: 'Batched metric histogram'
      });
      for (const record of records) {
        histogram.record(record.value, record.attributes);
      }
    }
  }
  
  private async exportSingleMetric(metric: MetricRecord): Promise<void> {
    const meter = metrics.getMeter('angular-telemetry');
    const histogram = meter.createHistogram(metric.name, {
      description: 'High priority metric'
    });
    histogram.record(metric.value, metric.attributes);
  }
  
  private flush(): void {
    // Force immediate export of pending metrics
    this.metricStream$.complete();
    this.highPriorityStream$.complete();
    // Recreate subjects for future use if needed
  }
  
  private calculateSamplingStats(decisions: SamplingDecision[]): SamplingStats {
    const byOperation = new Map<string, { total: number; sampled: number }>();
    
    decisions.forEach(decision => {
      const existing = byOperation.get(decision.spanName) || { total: 0, sampled: 0 };
      existing.total++;
      if (decision.sampled) existing.sampled++;
      byOperation.set(decision.spanName, existing);
    });
    
    const sampledCount = decisions.filter(d => d.sampled).length;
    
    return {
      totalDecisions: decisions.length,
      sampledCount,
      samplingRate: decisions.length > 0 ? sampledCount / decisions.length : 0,
      byOperation
    };
  }
  
  private prepareStateTransfer(): void {
    if (!this.transferState || !this.signalRegistry) return;
    
    const stateKey = makeStateKey<SignalMetadata[]>('TELEMETRY_SIGNALS');
    const signals = Array.from(this.signalRegistry.values());
    this.transferState.set(stateKey, signals);
  }
  
  private getRequestId(): string | undefined {
    // In a real implementation, this would get the request ID from:
    // - Server: HTTP headers or request context
    // - Browser: Custom header or meta tag
    return undefined;
  }
  
  ngOnDestroy() {
    // Complete all subjects
    this.destroy$.next();
    this.destroy$.complete();
    this.metricStream$.complete();
    this.highPriorityStream$.complete();
    this.samplingDecisions$.complete();
    this.samplingBudget$.complete();
    this.webVitals$.complete();
    this.signalChanges$.complete();
    
    // Clean up operation streams
    this.operationStreams.forEach(stream => stream.complete());
    this.operationStreams.clear();
    
    // Clean up signal change streams
    this.signalChangeStreams.forEach(stream => stream.complete());
    this.signalChangeStreams.clear();
    
    // Clean up effect loop detection
    this.effectExecutions$.complete();
    this.effectLoopPatterns$.complete();
    this.effectCircuitBreakers.forEach(breaker => breaker.complete());
    this.effectCircuitBreakers.clear();
    this.effectMetadata.clear();
  }
  
  // Public observables for monitoring
  getMetricStats$(): Observable<MetricStats> {
    return this.metricStatsSubject$.asObservable();
  }
  
  getSamplingStats$(): Observable<SamplingStats> {
    return this.samplingDecisions$.pipe(
      bufferTime(1000),
      map(decisions => this.calculateSamplingStats(decisions)),
      shareReplay(1)
    );
  }
  
  getWebVitals$(): Observable<any> {
    return this.webVitals$.asObservable();
  }
  
  // Signal Change Tracking public API
  getSignalChanges$(): Observable<SignalChangeEvent> {
    return this.signalChanges$.asObservable().pipe(
      shareReplay({ bufferSize: 100, refCount: true })
    );
  }
  
  getSignalChangesByName$(signalName: string): Observable<SignalChangeEvent> {
    if (!this.signalChangeStreams.has(signalName)) {
      this.signalChangeStreams.set(signalName, new Subject<SignalChangeEvent>());
    }
    return this.signalChangeStreams.get(signalName)!.asObservable();
  }
  
  // Effect Loop Detection public API
  getEffectExecutions$(): Observable<EffectExecutionEvent> {
    return this.effectExecutions$.asObservable();
  }
  
  getEffectLoopPatterns$(): Observable<EffectLoopPattern> {
    return this.effectLoopPatterns$.asObservable();
  }
  
  getEffectCircuitBreakerState$(effectName: string): Observable<'closed' | 'open' | 'half-open'> {
    if (!this.effectCircuitBreakers.has(effectName)) {
      this.effectCircuitBreakers.set(effectName, new BehaviorSubject<'closed' | 'open' | 'half-open'>('closed'));
    }
    return this.effectCircuitBreakers.get(effectName)!.asObservable();
  }
  
  // Smart sampling implementation
  private shouldSampleOperation(operationName: string, attributes: Record<string, any>): boolean {
    if (!this.config.enableSmartSampling || !this.config.smartSampling) {
      return Math.random() < this.config.defaultSampleRate;
    }
    
    const samplingConfig = this.config.smartSampling;
    
    // Priority 1: Always sample errors and critical operations
    if (attributes['error'] === true || 
        attributes['status'] === 'error' || 
        attributes['criticality'] === 'critical') {
      this.recordSamplingDecision(operationName, true, 'error_or_critical');
      return true;
    }
    
    // Priority 2: Always sample slow operations
    if (attributes['duration.ms'] && attributes['duration.ms'] > samplingConfig.importanceThreshold) {
      this.recordSamplingDecision(operationName, true, 'slow_operation');
      return true;
    }
    
    // Priority 3: Check sampling budget
    const currentBudget = this.samplingBudget$.value;
    if (currentBudget <= 0) {
      this.recordSamplingDecision(operationName, false, 'budget_exceeded');
      return false;
    }
    
    // Priority 4: Adaptive sampling based on frequency
    const frequency = this.getOperationFrequency(operationName);
    const baseRate = samplingConfig.baseRate;
    const adaptiveRate = baseRate / (1 + Math.log10(1 + frequency));
    
    // Apply environment multiplier
    const environment = this.getEnvironment();
    const envMultiplier = samplingConfig.environmentMultipliers[environment] || 1;
    const environmentRate = adaptiveRate * envMultiplier;
    
    // Final rate with bounds
    const finalRate = Math.max(
      samplingConfig.minRate,
      Math.min(samplingConfig.maxRate, environmentRate)
    );
    
    const decision = Math.random() < finalRate;
    
    if (decision) {
      // Consume from budget
      this.samplingBudget$.next(currentBudget - 1);
    }
    
    this.recordSamplingDecision(operationName, decision, decision ? 'adaptive' : 'rate_limited');
    return decision;
  }
  
  private getOperationFrequency(operationName: string): number {
    if (!this.operationStreams.has(operationName)) {
      this.operationStreams.set(operationName, new Subject<OperationEvent>());
    }
    
    // Track this operation
    this.operationStreams.get(operationName)!.next({
      timestamp: Date.now(),
      sampled: false // Will be updated by decision
    });
    
    // In a real implementation, we'd calculate frequency from the stream
    // For now, return a simple estimate based on operation count
    return this.operationStreams.get(operationName)!.observers.length;
  }
  
  private recordSamplingDecision(spanName: string, sampled: boolean, reason: string): void {
    this.samplingDecisions$.next({
      spanName,
      sampled,
      timestamp: Date.now()
    });
  }
  
  private getEnvironment(): 'development' | 'staging' | 'production' {
    // In a real implementation, this would come from configuration
    // For now, detect based on hostname or other indicators
    if (isPlatformBrowser(this.platformId)) {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname.includes('dev')) {
        return 'development';
      }
      if (hostname.includes('staging') || hostname.includes('test')) {
        return 'staging';
      }
    }
    return 'production';
  }
}