import { 
  signal, computed, effect, Signal, WritableSignal, EffectRef, 
  Injectable, PLATFORM_ID, Inject, Optional, TransferState, makeStateKey
} from '@angular/core';
// Platform detection helpers
const isPlatformServer = (platformId: Object): boolean => {
  return platformId === 'server';
};
const isPlatformBrowser = (platformId: Object): boolean => {
  return platformId === 'browser';
};
import { trace, context, SpanStatusCode, metrics, Span } from '@opentelemetry/api';
import { 
  ITelemetryService, 
  SignalTelemetryOptions, 
  ComputedTelemetryOptions, 
  EffectTelemetryOptions,
  TelemetryConfig
} from './telemetry.interface';

interface SignalMetadata {
  name: string;
  initialValue: any;
  lastValue: any;
  updateCount: number;
  createdAt: number;
}

class MetricsBuffer {
  private buffer: Array<{ name: string; value: number; attributes: Record<string, any>; timestamp: number }> = [];
  private flushInterval: any;
  
  constructor(private flushIntervalMs: number = 5000) {
    this.flushInterval = setInterval(() => this.flush(), this.flushIntervalMs);
  }
  
  add(name: string, value: number, attributes?: Record<string, any>): void {
    this.buffer.push({
      name,
      value,
      attributes: attributes || {},
      timestamp: Date.now()
    });
    
    if (this.buffer.length > 1000) {
      this.flush();
    }
  }
  
  flush(): void {
    if (this.buffer.length === 0) return;
    
    const meter = metrics.getMeter('angular-telemetry');
    const aggregated = new Map<string, { sum: number; count: number; attributes: Record<string, any> }>();
    
    this.buffer.forEach(metric => {
      const key = `${metric.name}:${JSON.stringify(metric.attributes)}`;
      const existing = aggregated.get(key) || { sum: 0, count: 0, attributes: metric.attributes };
      existing.sum += metric.value;
      existing.count++;
      aggregated.set(key, existing);
    });
    
    aggregated.forEach((data, key) => {
      const [name] = key.split(':');
      const counter = meter.createCounter(`${name}_total`);
      counter.add(data.sum, data.attributes);
      
      if (data.count > 1) {
        const avgHistogram = meter.createHistogram(`${name}_avg`, {
          description: `Average value of ${name}`
        });
        avgHistogram.record(data.sum / data.count, data.attributes);
      }
    });
    
    this.buffer = [];
  }
  
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}

@Injectable()
export class ConfigurableTelemetryService implements ITelemetryService {
  private isServer: boolean;
  private config: Required<TelemetryConfig>;
  private signalRegistry?: Map<string, SignalMetadata>;
  private metricsBuffer?: MetricsBuffer;
  
  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    @Optional() private transferState?: TransferState,
    @Optional() @Inject('TELEMETRY_CONFIG') config?: TelemetryConfig
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
    
    // Initialize batched metrics
    if (this.config.enableBatchedMetrics) {
      this.metricsBuffer = new MetricsBuffer(this.config.metricsFlushInterval);
    }
    
    // Initialize Web Vitals
    if (this.config.enableWebVitals && isPlatformBrowser(this.platformId)) {
      this.initializeWebVitals();
    }
  }
  
  private hydrateFromServer(): void {
    if (!this.transferState || !this.signalRegistry) return;
    
    const stateKey = makeStateKey<SignalMetadata[]>('TELEMETRY_SIGNALS');
    const signals = this.transferState.get(stateKey, []);
    
    signals.forEach(metadata => {
      this.signalRegistry!.set(metadata.name, metadata);
    });
  }
  
  private initializeWebVitals(): void {
    // @ts-ignore - Optional dependency
    import('web-vitals').then((webVitals: any) => {
      const { onCLS, onFID, onFCP, onLCP, onTTFB } = webVitals;
      const meter = metrics.getMeter('web-vitals');
      
      onCLS((metric: any) => {
        const histogram = meter.createHistogram('web_vitals_cls');
        histogram.record(metric.value, { rating: metric.rating });
      });
      
      onFID((metric: any) => {
        const histogram = meter.createHistogram('web_vitals_fid');
        histogram.record(metric.value, { rating: metric.rating });
      });
      
      onFCP((metric: any) => {
        const histogram = meter.createHistogram('web_vitals_fcp');
        histogram.record(metric.value, { rating: metric.rating });
      });
      
      onLCP((metric: any) => {
        const histogram = meter.createHistogram('web_vitals_lcp');
        histogram.record(metric.value, { rating: metric.rating });
      });
      
      onTTFB((metric: any) => {
        const histogram = meter.createHistogram('web_vitals_ttfb');
        histogram.record(metric.value, { rating: metric.rating });
      });
    }).catch(() => {
      // Web vitals not available
    });
  }
  
  createTracedSignal<T>(
    initialValue: T,
    name: string,
    options?: SignalTelemetryOptions<T>
  ): WritableSignal<T> {
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
      if (this.config.enableSmartSampling && metadata) {
        const isImportant = metadata.updateCount > 10 || name.includes('critical');
        return Math.random() < (isImportant ? effectiveSampleRate * 2 : effectiveSampleRate);
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
          baseSignal.set(value);
          
          if (metadata) {
            metadata.lastValue = value;
            metadata.updateCount++;
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
          baseSignal.update(updateFn);
          if (metadata) {
            metadata.updateCount++;
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
      
      asReadonly: () => baseSignal.asReadonly()
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
    return Object.assign(wrappedSignal, baseSignal, tracedSignal);
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
    
    return effect(() => {
      executionCount++;
      const now = Date.now();
      const timeSinceLastExecution = lastExecutionTime ? now - lastExecutionTime : 0;
      lastExecutionTime = now;
      
      this.recordMetricInternal('effect_executions', 1, {
        effect_name: name,
        execution_count: executionCount,
        has_parent: !!trace.getActiveSpan(),
        platform: this.isServer ? 'server' : 'browser'
      });
      
      const activeSpan = trace.getActiveSpan();
      const shouldTrace = activeSpan || Math.random() < effectiveSampleRate;
      
      if (!shouldTrace) {
        effectFn();
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
  
  recordMetric(name: string, value: number, attributes?: Record<string, any>): void {
    this.recordMetricInternal(name, value, attributes);
  }
  
  private recordMetricInternal(name: string, value: number, attributes?: Record<string, any>): void {
    if (!this.config.enableMetrics) return;
    
    const attrs = {
      ...attributes,
      platform: this.isServer ? 'server' : 'browser'
    };
    
    if (this.config.enableBatchedMetrics && this.metricsBuffer) {
      this.metricsBuffer.add(name, value, attrs);
    } else {
      const meter = metrics.getMeter('angular-telemetry');
      const histogram = meter.createHistogram(name, {
        description: 'Business metric histogram'
      });
      histogram.record(value, attrs);
    }
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
    if (this.metricsBuffer) {
      this.metricsBuffer.destroy();
    }
  }
}