import { EffectRef, Signal, inject } from '@angular/core';
import { ITelemetryService } from '../services/telemetry.interface';
import { TELEMETRY_SERVICE } from '../services/telemetry-service.token';
import { DefaultTelemetryService } from '../services/default-telemetry.service';
import { tracedEffect } from '../api/traced-effect';
import { metrics } from '@opentelemetry/api';

let defaultServiceInstance: ITelemetryService | null = null;

function getTelemetryService(): ITelemetryService {
  try {
    return inject(TELEMETRY_SERVICE);
  } catch {
    if (!defaultServiceInstance) {
      defaultServiceInstance = new DefaultTelemetryService();
    }
    return defaultServiceInstance;
  }
}

export interface ComputedMetricOptions<T> {
  triggerSignals?: Signal<any>[];
  condition?: () => boolean;
  throttleMs?: number;
  description?: string;
}

/**
 * Creates a computed metric that updates based on signal changes.
 * 
 * @param name - The metric name
 * @param computation - Function that computes the metric value
 * @param options - Optional configuration
 * @returns EffectRef that can be destroyed
 * 
 * @example
 * ```typescript
 * // Simple metric
 * const cartValueMetric = createComputedMetric(
 *   'cart_value',
 *   () => cartItems().reduce((sum, item) => sum + item.price, 0)
 * );
 * 
 * // Conditional metric with throttling
 * const activeUsersMetric = createComputedMetric(
 *   'active_users',
 *   () => users().filter(u => u.isActive).length,
 *   {
 *     condition: () => appState() === 'ready',
 *     throttleMs: 5000, // Update at most every 5 seconds
 *     description: 'Number of active users'
 *   }
 * );
 * ```
 */
export function createComputedMetric<T extends number>(
  name: string,
  computation: () => T,
  options?: ComputedMetricOptions<T>
): EffectRef {
  const meter = metrics.getMeter('business-metrics');
  
  // Use UpDownCounter for values that can go up and down
  const counter = meter.createUpDownCounter(name, { 
    description: options?.description || name 
  });
  
  let lastValue: T | undefined;
  let lastUpdate = 0;
  
  return tracedEffect(
    () => {
      // Check condition if provided
      if (options?.condition && !options.condition()) {
        return;
      }
      
      // Check throttle
      const now = Date.now();
      if (options?.throttleMs && now - lastUpdate < options.throttleMs) {
        return;
      }
      
      try {
        const currentValue = computation();
        
        // Only update if value changed
        if (currentValue !== lastValue) {
          if (lastValue !== undefined) {
            // Subtract old value and add new value to get the delta
            counter.add(currentValue - lastValue);
          } else {
            // First value, just add it
            counter.add(currentValue);
          }
          
          // Log significant changes
          const service = getTelemetryService();
          if (lastValue !== undefined && Math.abs(currentValue - lastValue) > lastValue * 0.5) {
            service.log(`Significant metric change: ${name}`, {
              previous: lastValue,
              current: currentValue,
              changePercent: ((currentValue - lastValue) / lastValue) * 100
            });
          }
          
          lastValue = currentValue;
          lastUpdate = now;
        }
      } catch (error) {
        console.error(`Error computing metric ${name}:`, error);
      }
    },
    `metric_${name}`,
    { 
      sampleRate: 0, // Don't trace metric updates themselves
      attributes: { metric_name: name }
    }
  );
}

/**
 * Creates a rate metric that tracks the rate of change.
 * 
 * @param name - The metric name
 * @param valueGetter - Function that gets the current value
 * @param windowMs - Time window for rate calculation (default: 60000ms)
 * @returns EffectRef that can be destroyed
 * 
 * @example
 * ```typescript
 * const requestRateMetric = createRateMetric(
 *   'request_rate',
 *   () => totalRequests(),
 *   10000 // Calculate rate per 10 seconds
 * );
 * ```
 */
export function createRateMetric(
  name: string,
  valueGetter: () => number,
  windowMs: number = 60000
): EffectRef {
  const meter = metrics.getMeter('business-metrics');
  const histogram = meter.createHistogram(`${name}_per_second`, {
    description: `Rate of ${name} per second`
  });
  
  let previousValue: number | undefined;
  let previousTime: number | undefined;
  
  return tracedEffect(
    () => {
      const currentValue = valueGetter();
      const currentTime = Date.now();
      
      if (previousValue !== undefined && previousTime !== undefined) {
        const valueDelta = currentValue - previousValue;
        const timeDelta = (currentTime - previousTime) / 1000; // Convert to seconds
        
        if (timeDelta > 0 && valueDelta >= 0) {
          const rate = valueDelta / timeDelta;
          histogram.record(rate);
        }
      }
      
      previousValue = currentValue;
      previousTime = currentTime;
    },
    `rate_metric_${name}`,
    { 
      sampleRate: 0,
      attributes: { metric_name: name }
    }
  );
}

/**
 * Creates a histogram metric for tracking distributions.
 * 
 * @param name - The metric name
 * @param valueGetter - Function that gets values to record
 * @param options - Optional configuration
 * @returns EffectRef that can be destroyed
 * 
 * @example
 * ```typescript
 * const responseTimes = createHistogramMetric(
 *   'api_response_time',
 *   () => lastResponseTime(),
 *   {
 *     condition: () => lastResponseTime() !== null,
 *     description: 'API response time distribution'
 *   }
 * );
 * ```
 */
export function createHistogramMetric(
  name: string,
  valueGetter: () => number | null,
  options?: Omit<ComputedMetricOptions<number>, 'throttleMs'>
): EffectRef {
  const meter = metrics.getMeter('business-metrics');
  const histogram = meter.createHistogram(name, {
    description: options?.description || name
  });
  
  return tracedEffect(
    () => {
      // Check condition if provided
      if (options?.condition && !options.condition()) {
        return;
      }
      
      const value = valueGetter();
      if (value !== null) {
        histogram.record(value);
      }
    },
    `histogram_metric_${name}`,
    {
      sampleRate: 0,
      attributes: { metric_name: name }
    }
  );
}