import { signal, computed, effect, Signal, WritableSignal, EffectRef, Injectable, PLATFORM_ID, Inject, Optional } from '@angular/core';
// Platform detection helper
const isPlatformServer = (platformId: Object): boolean => {
  return platformId === 'server';
};
import { trace, SpanStatusCode, metrics, Span } from '@opentelemetry/api';
import { 
  ITelemetryService, 
  SignalTelemetryOptions, 
  ComputedTelemetryOptions, 
  EffectTelemetryOptions 
} from './telemetry.interface';

class MetricsAggregator {
  private counters = new Map<string, number>();
  private meter = metrics.getMeter('angular-signals');
  private flushInterval: any;
  
  constructor() {
    this.flushInterval = setInterval(() => this.flush(), 30000);
  }
  
  increment(name: string, labels: Record<string, any> = {}) {
    const key = `${name}:${JSON.stringify(labels)}`;
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }
  
  private flush() {
    const counter = this.meter.createCounter('signal_operations_total');
    this.counters.forEach((count, key) => {
      const [name, labelsJson] = key.split(':');
      const labels = JSON.parse(labelsJson);
      counter.add(count, labels);
    });
    this.counters.clear();
  }
  
  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
  }
}

@Injectable()
export class DefaultTelemetryService implements ITelemetryService {
  private metricsAggregator = new MetricsAggregator();
  private isServer = false;
  private serverSampleRateMultiplier = 0.1;
  
  constructor(@Optional() @Inject(PLATFORM_ID) private platformId?: Object) {
    if (this.platformId) {
      this.isServer = isPlatformServer(this.platformId);
    }
  }
  
  createTracedSignal<T>(
    initialValue: T,
    name: string,
    options?: SignalTelemetryOptions<T>
  ): WritableSignal<T> {
    const baseSignal = signal(initialValue);
    const opts = {
      sampleRate: 0.1,
      recordMetrics: true,
      skipInitialValue: false,
      ...options
    };
    
    // Reduce sampling on server
    const effectiveSampleRate = this.isServer 
      ? opts.sampleRate * this.serverSampleRateMultiplier 
      : opts.sampleRate;
    
    const shouldTrace = () => trace.getActiveSpan() || Math.random() < effectiveSampleRate;
    
    const createSpan = (operation: string): Span | null => {
      if (!shouldTrace()) return null;
      
      return trace.getTracer('signals').startSpan(
        opts.spanName || `signal.${name}.${operation}`,
        {
          attributes: {
            'signal.name': name,
            'signal.operation': operation,
            'signal.has_parent_trace': !!trace.getActiveSpan(),
            'signal.platform': this.isServer ? 'server' : 'browser',
            ...(opts.trackerName && { 'signal.tracker': opts.trackerName })
          }
        }
      );
    };
    
    // Create a wrapper that intercepts signal operations
    const tracedSignal = {
      set: (value: T) => {
        if (opts.recordMetrics) {
          this.metricsAggregator.increment('signal_writes', { 
            signal_name: name,
            has_parent: !!trace.getActiveSpan(),
            platform: this.isServer ? 'server' : 'browser'
          });
        }
        
        const span = createSpan('write');
        
        try {
          const previousValue = baseSignal();
          baseSignal.set(value);
          
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
          this.metricsAggregator.increment('signal_updates', { 
            signal_name: name,
            has_parent: !!trace.getActiveSpan(),
            platform: this.isServer ? 'server' : 'browser'
          });
        }
        
        const span = createSpan('update');
        
        try {
          baseSignal.update(updateFn);
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
    
    // Create a proxy that handles both function calls and property access
    const self = this;
    return new Proxy(baseSignal, {
      get(target, prop) {
        if (prop === 'set') return tracedSignal.set;
        if (prop === 'update') return tracedSignal.update;
        if (prop === 'asReadonly') return tracedSignal.asReadonly;
        return target[prop as keyof WritableSignal<T>];
      },
      apply(target, thisArg, args) {
        // When called as a function, execute traced read logic
        if (opts.recordMetrics) {
          self.metricsAggregator.increment('signal_reads', { 
            signal_name: name, 
            has_parent: !!trace.getActiveSpan(),
            platform: self.isServer ? 'server' : 'browser'
          });
        }
        
        const span = createSpan('read');
        if (!span) return target();
        
        try {
          const value = target();
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
      }
    }) as WritableSignal<T>;
  }
  
  createTracedComputed<T>(
    computation: () => T,
    name: string,
    options?: ComputedTelemetryOptions<T>
  ): Signal<T> {
    const opts = {
      sampleRate: 0.1,
      recordMetrics: true,
      warnOnSlowComputation: 100,
      ...options
    };
    
    // Reduce sampling on server
    const effectiveSampleRate = this.isServer 
      ? opts.sampleRate * this.serverSampleRateMultiplier 
      : opts.sampleRate;
    
    return computed(() => {
      if (opts.recordMetrics) {
        this.metricsAggregator.increment('computed_executions', { 
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
      sampleRate: 0.1,
      warnOnSlowEffect: 100,
      ...options
    };
    
    // Reduce sampling on server
    const effectiveSampleRate = this.isServer 
      ? opts.sampleRate * this.serverSampleRateMultiplier 
      : opts.sampleRate;
    
    let executionCount = 0;
    
    return effect(() => {
      executionCount++;
      
      this.metricsAggregator.increment('effect_executions', { 
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
    const activeSpan = trace.getActiveSpan();
    const logData = {
      message,
      data,
      timestamp: new Date().toISOString(),
      traceId: activeSpan?.spanContext().traceId,
      spanId: activeSpan?.spanContext().spanId,
      level,
      platform: this.isServer ? 'server' : 'browser'
    };
    
    if (activeSpan) {
      activeSpan.addEvent('log', {
        'log.message': message,
        'log.level': level,
        'log.data': data ? JSON.stringify(data) : undefined
      });
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
  }
  
  recordMetric(name: string, value: number, attributes?: Record<string, any>): void {
    const meter = metrics.getMeter('business');
    const histogram = meter.createHistogram(name, {
      description: 'Business metric histogram'
    });
    histogram.record(value, {
      ...attributes,
      platform: this.isServer ? 'server' : 'browser'
    });
  }
  
  ngOnDestroy() {
    this.metricsAggregator.destroy();
  }
}