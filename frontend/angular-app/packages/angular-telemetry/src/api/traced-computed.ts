import { Signal, inject } from '@angular/core';
import { ITelemetryService, ComputedTelemetryOptions } from '../services/telemetry.interface';
import { TELEMETRY_SERVICE } from '../services/telemetry-service.token';
import { DefaultTelemetryService } from '../services/default-telemetry.service';

let defaultServiceInstance: ITelemetryService | null = null;

function getTelemetryService(): ITelemetryService {
  try {
    // Try to inject the service via Angular DI
    return inject(TELEMETRY_SERVICE);
  } catch {
    // Fall back to default service singleton
    if (!defaultServiceInstance) {
      defaultServiceInstance = new DefaultTelemetryService();
    }
    return defaultServiceInstance;
  }
}

/**
 * Creates a traced computed signal with automatic telemetry.
 * 
 * @param computation - The computation function
 * @param name - The name of the computed signal for telemetry purposes
 * @param options - Optional configuration for telemetry behavior
 * @returns A Signal with automatic telemetry
 * 
 * @example
 * ```typescript
 * const total = tracedComputed(
 *   () => items().reduce((sum, item) => sum + item.price, 0),
 *   'cartTotal',
 *   {
 *     warnOnSlowComputation: 50, // Warn if computation takes > 50ms
 *     attributes: (total) => ({ totalAmount: total })
 *   }
 * );
 * ```
 */
export function tracedComputed<T>(
  computation: () => T,
  name: string,
  options?: ComputedTelemetryOptions<T>
): Signal<T> {
  const service = getTelemetryService();
  return service.createTracedComputed(computation, name, options);
}