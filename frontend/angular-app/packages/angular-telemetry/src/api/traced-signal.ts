import { WritableSignal, inject } from '@angular/core';
import { ITelemetryService, SignalTelemetryOptions } from '../services/telemetry.interface';
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
 * Creates a traced signal with automatic telemetry.
 * 
 * @param initialValue - The initial value for the signal
 * @param name - The name of the signal for telemetry purposes
 * @param options - Optional configuration for telemetry behavior
 * @returns A WritableSignal with automatic telemetry
 * 
 * @example
 * ```typescript
 * const count = tracedSignal(0, 'counter');
 * const user = tracedSignal(null, 'currentUser', {
 *   sampleRate: 1.0, // Always trace
 *   attributes: (user) => ({ userId: user?.id })
 * });
 * ```
 */
export function tracedSignal<T>(
  initialValue: T,
  name: string,
  options?: SignalTelemetryOptions<T>
): WritableSignal<T> {
  const service = getTelemetryService();
  return service.createTracedSignal(initialValue, name, options);
}