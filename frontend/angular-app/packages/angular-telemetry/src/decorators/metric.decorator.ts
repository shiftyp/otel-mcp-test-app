import { getTelemetryContext } from './telemetry.decorator';
import { MetricOptions } from './types';
import { MethodArgs, UnwrappedReturnType, UnwrapPromise } from './type-inference';

/**
 * Decorator that automatically records metrics for method executions.
 * 
 * @example
 * ```typescript
 * @Metric('order.create', {
 *   value: (args, result) => result.total,
 *   attributes: (args, result) => ({
 *     'order.id': result.id,
 *     'customer.id': args[0].customerId
 *   })
 * })
 * async createOrder(orderData: OrderData): Promise<Order> {
 *   // Method implementation
 * }
 * ```
 * 
 * @example With automatic type inference:
 * ```typescript
 * class CartComponent {
 *   @Metric<CartComponent, 'updateQuantity'>('cart.update', {
 *     attributes: ([productId, newQuantity], result) => ({
 *       'product.id': productId,  // TypeScript knows this is string
 *       'quantity.new': newQuantity  // TypeScript knows this is number
 *     })
 *   })
 *   updateQuantity(productId: string, newQuantity: number): void {
 *     // Method implementation
 *   }
 * }
 * ```
 * 
 * @example Legacy explicit type parameters:
 * ```typescript
 * @Metric<[string, number], void>('cart.update', {
 *   attributes: ([productId, newQuantity], result) => ({
 *     'product.id': productId,
 *     'quantity.new': newQuantity
 *   })
 * })
 * updateQuantity(productId: string, newQuantity: number): void {
 *   // Method implementation
 * }
 * ```
 */
// Overload for class-based type inference
export function Metric<T extends object, K extends keyof T>(
  metricName?: string,
  options?: MetricOptions<MethodArgs<T, K>, UnwrappedReturnType<T, K>>
): MethodDecorator;

// Overload for explicit array types
export function Metric<TArgs extends any[], TReturn>(
  metricName?: string,
  options?: MetricOptions<TArgs, UnwrapPromise<TReturn>>
): MethodDecorator;

// Overload for no type parameters
export function Metric(
  metricName?: string,
  options?: MetricOptions<any[], any>
): MethodDecorator;

// Implementation
export function Metric(
  metricName?: string,
  options?: MetricOptions<any[], any>
): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw new Error('@Metric can only be applied to methods');
    }
    
    const originalMethod = descriptor.value;
    const context = getTelemetryContext(target, String(propertyKey));
    const fullMetricName = metricName 
      ? (context.namespace ? `${context.namespace}.${metricName}` : metricName)
      : context.fullName || String(propertyKey);
    
    descriptor.value = function(this: any, ...args: any[]) {
      const telemetryService = (this as any)['telemetryService'] || (this as any)['_telemetryService'];
      
      if (!telemetryService?.recordMetric) {
        return originalMethod.apply(this, args);
      }
      
      const startTime = options?.recordDuration ? performance.now() : 0;
      
      const recordMetrics = (result: any, error?: Error) => {
        try {
          // Check condition
          if (options?.condition && !options.condition(args, result)) {
            return;
          }
          
          // Calculate attributes
          const attributes: Record<string, any> = {
            'metric.success': !error,
            ...(options?.attributes ? options.attributes(args, result) : {})
          };
          
          // Calculate metric value
          const metricValue = options?.value 
            ? options.value(args, result)
            : 1; // Default to counting
          
          // Determine metric name based on success/failure
          let finalMetricName = fullMetricName;
          if (error && options?.failureMetric) {
            finalMetricName = context.namespace 
              ? `${context.namespace}.${options.failureMetric}`
              : options.failureMetric;
          } else if (!error && options?.successMetric) {
            finalMetricName = context.namespace
              ? `${context.namespace}.${options.successMetric}`
              : options.successMetric;
          }
          
          // Record the metric with priority
          const priority = options?.priority || 'normal';
          if (options?.batched && telemetryService.recordBatchedMetric) {
            telemetryService.recordBatchedMetric(finalMetricName, metricValue, attributes, priority);
          } else if (telemetryService.recordMetric.length >= 4) {
            // Service supports priority parameter
            telemetryService.recordMetric(finalMetricName, metricValue, attributes, priority);
          } else {
            // Fallback for services that don't support priority
            telemetryService.recordMetric(finalMetricName, metricValue, attributes);
          }
          
          // Record duration if requested
          if (options?.recordDuration && startTime > 0) {
            const duration = performance.now() - startTime;
            const durationMetricName = `${finalMetricName}.duration`;
            
            if (options?.batched && telemetryService.recordBatchedMetric) {
              telemetryService.recordBatchedMetric(durationMetricName, duration, attributes);
            } else {
              telemetryService.recordMetric(durationMetricName, duration, attributes);
            }
          }
        } catch (metricsError) {
          console.error(`Error recording metrics for ${fullMetricName}:`, metricsError);
        }
      };
      
      try {
        const result = originalMethod.apply(this, args);
        
        // Handle async methods
        if (result && typeof result === 'object' && typeof result.then === 'function') {
          return result.then(
            (value: any) => {
              recordMetrics(value);
              return value;
            },
            (error: Error) => {
              recordMetrics(undefined, error);
              throw error;
            }
          );
        }
        
        // Sync methods
        recordMetrics(result);
        return result;
        
      } catch (error) {
        recordMetrics(undefined, error as Error);
        throw error;
      }
    };
    
    return descriptor;
  };
}


/**
 * Create a metric recorder for imperative use
 */
export function createMetricRecorder<TArgs extends any[], TReturn>(
  telemetryService: any,
  metricName: string,
  options?: MetricOptions<TArgs, TReturn>
) {
  return {
    record(args: TArgs, result: TReturn, error?: Error): void {
      if (!telemetryService?.recordMetric) {
        return;
      }
      
      // Check condition
      if (options?.condition && !options.condition(args, result)) {
        return;
      }
      
      // Calculate attributes
      const attributes: Record<string, any> = {
        'metric.success': !error,
        ...(options?.attributes ? options.attributes(args, result) : {})
      };
      
      // Calculate metric value
      const metricValue = options?.value 
        ? options.value(args, result)
        : 1;
      
      // Record the metric
      if (options?.batched && telemetryService.recordBatchedMetric) {
        telemetryService.recordBatchedMetric(metricName, metricValue, attributes);
      } else {
        telemetryService.recordMetric(metricName, metricValue, attributes);
      }
    }
  };
}