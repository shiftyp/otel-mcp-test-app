// Browser-safe instrumentation registration
// This avoids importing @opentelemetry/instrumentation which has Node.js dependencies

export interface Instrumentation {
  instrumentationName: string;
  instrumentationVersion?: string;
  enable(): void;
  disable(): void;
}

export function registerInstrumentations(config: { instrumentations: Instrumentation[] }): void {
  // Simple implementation that just enables all instrumentations
  config.instrumentations.forEach(instrumentation => {
    try {
      instrumentation.enable();
      console.log(`[Telemetry] Enabled instrumentation: ${instrumentation.instrumentationName}`);
    } catch (error) {
      console.warn(`[Telemetry] Failed to enable instrumentation ${instrumentation.instrumentationName}:`, error);
    }
  });
}