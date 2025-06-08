// Services
export { 
  ITelemetryService, 
  SignalTelemetryOptions, 
  ComputedTelemetryOptions, 
  EffectTelemetryOptions, 
  TelemetryConfig,
  TracedWritableSignal 
} from './services/telemetry.interface';
export { TELEMETRY_SERVICE } from './services/telemetry-service.token';
export { DefaultTelemetryService } from './services/default-telemetry.service';
export { 
  ConfigurableTelemetryService,
  SignalChangeEvent,
  EffectExecutionEvent,
  EffectLoopPattern
} from './services/configurable-telemetry.service';
export { 
  ReactiveContextService,
  SpanContextCarrier,
  ContextChangeEvent
} from './services/reactive-context.service';

// API Functions
export { tracedSignal } from './api/traced-signal';
export { tracedComputed } from './api/traced-computed';
export { tracedEffect } from './api/traced-effect';

// Business Helpers
export { log, withSpan, recordMetric, timed, traced, metered } from './helpers/business-helpers';

// Metrics
export { BusinessMetrics } from './metrics/business-metrics';
export { createComputedMetric, createRateMetric, createHistogramMetric, ComputedMetricOptions } from './metrics/computed-metrics';

// Module
export { TelemetryModule } from './telemetry.module';

// Initialization
export { initializeBrowserTelemetry, BrowserTelemetryConfig } from './browser-init';

// Decorators
export * from './decorators';

// Interceptors
export { ContextPropagationInterceptor } from './interceptors/context-propagation.interceptor';

// Operators
export { 
  withTelemetryContext, 
  createContextOperator, 
  propagateContext 
} from './operators/with-telemetry-context';

// Request-scoped telemetry
export { 
  RequestScopedTelemetryService,
  RequestContext,
  TelemetryEvent,
  RequestTelemetryStats,
  REQUEST_ID
} from './services/request-scoped-telemetry.service';

// Resource timing
export {
  ResourceTimingService,
  ResourceTimingEvent,
  ResourceStats
} from './services/resource-timing.service';