import { inject } from '@angular/core';
import { ITelemetryService } from '../services/telemetry.interface';
import { TELEMETRY_SERVICE } from '../services/telemetry-service.token';
import { DefaultTelemetryService } from '../services/default-telemetry.service';

let defaultServiceInstance: ITelemetryService | null = null;

function getTelemetryService(): ITelemetryService {
  try {
    return inject(TELEMETRY_SERVICE);
  } catch {
    if (!defaultServiceInstance) {
      defaultServiceInstance = new DefaultTelemetryService();
    }
    return defaultServiceInstance!;
  }
}

/**
 * Logs a business event with structured data.
 * 
 * @param message - The log message
 * @param data - Optional data to include
 * @param level - Log level (default: 'info')
 * 
 * @example
 * ```typescript
 * log('User logged in', { userId: user.id });
 * log('Payment failed', { error: err.message }, 'error');
 * ```
 */
export function log(message: string, data?: any, level?: 'info' | 'warn' | 'error'): void {
  const service = getTelemetryService();
  service.log(message, data, level);
}

/**
 * Executes a function within a traced span.
 * 
 * @param name - The span name
 * @param fn - The function to execute
 * @param attributes - Optional span attributes
 * @returns The function result
 * 
 * @example
 * ```typescript
 * const result = await withSpan('process_payment', async () => {
 *   return await paymentService.process(order);
 * }, { orderId: order.id });
 * ```
 */
export function withSpan<T>(
  name: string, 
  fn: () => T, 
  attributes?: Record<string, any>
): T {
  const service = getTelemetryService();
  return service.withSpan(name, fn, attributes);
}

/**
 * Records a business metric.
 * 
 * @param name - The metric name
 * @param value - The metric value
 * @param attributes - Optional attributes
 * 
 * @example
 * ```typescript
 * recordMetric('order_total', 99.99, { currency: 'USD' });
 * ```
 */
export function recordMetric(
  name: string, 
  value: number, 
  attributes?: Record<string, any>
): void {
  const service = getTelemetryService();
  service.recordMetric(name, value, attributes);
}

/**
 * Times the execution of a function and records it as a metric.
 * 
 * @param name - The metric name for the duration
 * @param fn - The function to time
 * @param attributes - Optional attributes
 * @returns The function result
 * 
 * @example
 * ```typescript
 * const result = await timed('database_query', async () => {
 *   return await db.query(sql);
 * }, { query_type: 'select' });
 * ```
 */
export async function timed<T>(
  name: string,
  fn: () => T | Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const startTime = performance.now();
  
  try {
    const result = await fn();
    const duration = performance.now() - startTime;
    
    recordMetric(`${name}_duration_ms`, duration, attributes);
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    
    recordMetric(`${name}_duration_ms`, duration, {
      ...attributes,
      error: true
    });
    
    throw error;
  }
}

/**
 * Decorates a class method with automatic span creation.
 * 
 * @param spanName - Optional custom span name (defaults to method name)
 * @returns Method decorator
 * 
 * @example
 * ```typescript
 * class PaymentService {
 *   @traced('process_payment')
 *   async processPayment(order: Order) {
 *     // Method is automatically traced
 *   }
 * }
 * ```
 */
export function traced(spanName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
      const name = spanName || `${target.constructor.name}.${propertyKey}`;
      return withSpan(name, () => originalMethod.apply(this, args));
    };
    
    return descriptor;
  };
}

/**
 * Decorates a class method with automatic timing metrics.
 * 
 * @param metricName - Optional custom metric name
 * @returns Method decorator
 * 
 * @example
 * ```typescript
 * class ApiService {
 *   @metered('api_call')
 *   async fetchData() {
 *     // Method duration is automatically recorded
 *   }
 * }
 * ```
 */
export function metered(metricName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const name = metricName || `${target.constructor.name}_${propertyKey}`;
      return await timed(name, () => originalMethod.apply(this, args));
    };
    
    return descriptor;
  };
}