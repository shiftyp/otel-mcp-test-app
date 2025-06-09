import { EffectRef, inject } from '@angular/core';
import { ITelemetryService, EffectTelemetryOptions } from '../services/telemetry.interface';
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
    return defaultServiceInstance!;
  }
}

/**
 * Creates a traced effect with automatic telemetry.
 * 
 * @param effectFn - The effect function to run
 * @param name - The name of the effect for telemetry purposes
 * @param options - Optional configuration for telemetry behavior
 * @returns An EffectRef with automatic telemetry
 * 
 * @example
 * ```typescript
 * const saveEffect = tracedEffect(
 *   () => {
 *     const data = mySignal();
 *     localStorage.setItem('data', JSON.stringify(data));
 *   },
 *   'saveToLocalStorage',
 *   {
 *     sampleRate: 0.5, // Sample 50% of executions
 *     warnOnSlowEffect: 100 // Warn if effect takes > 100ms
 *   }
 * );
 * ```
 */
export function tracedEffect(
  effectFn: () => void,
  name: string,
  options?: EffectTelemetryOptions
): EffectRef {
  const service = getTelemetryService();
  return service.createTracedEffect(effectFn, name, options);
}