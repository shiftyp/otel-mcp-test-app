/**
 * Type utilities for extracting method signatures
 */
export type MethodParameters<T> = T extends (...args: infer P) => any ? P : never;
export type MethodReturn<T> = T extends (...args: any[]) => infer R ? R : never;
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

/**
 * Context stored by @Telemetry decorator
 */
export interface TelemetryContext {
  namespace?: string;
  fullName: string;
  config: TelemetryConfig;
}

/**
 * Configuration for @Telemetry class decorator
 */
export interface TelemetryConfig {
  namespace?: string;
  spanName?: string;  // Base span name for the service
  metrics?: Record<string, 'counter' | 'histogram' | 'gauge'>;  // Metrics to initialize
  attributes?: Record<string, any>;  // Static attributes for all operations
  autoInstrument?: {
    lifecycle?: boolean;
    signals?: boolean;
    methods?: boolean;
  };
  defaultOptions?: {
    traces?: Partial<TraceOptions>;
    metrics?: Partial<MetricOptions>;
    logs?: Partial<LogOptions>;
  };
}

/**
 * Base options for all telemetry
 */
export interface TelemetryOptions {
  spanName?: string;
  sampleRate?: number;
  recordMetrics?: boolean;
  attributes?: Record<string, any> | ((...args: any[]) => Record<string, any>);
}

/**
 * Options for @Traced decorator
 */
export interface TracedOptions<TArgs extends any[] = any[], TReturn = any> extends TelemetryOptions {
  trackerName?: string;
  warnOnSlowOperation?: number;
  recordArgs?: boolean;
  includeArgs?: boolean;
  attributes?: Record<string, any> | ((args: TArgs, result?: TReturn) => Record<string, any>);
  sampling?: 'smart' | 'fixed';  // Use smart adaptive sampling or fixed rate
  criticality?: 'normal' | 'critical';  // Mark operation as critical for sampling
}

/**
 * Options for @Metric decorator
 */
export interface MetricOptions<TArgs extends any[] = any[], TReturn = any> {
  attributes?: (args: TArgs, result: TReturn) => Record<string, any>;
  value?: (args: TArgs, result: TReturn) => number;
  condition?: (args: TArgs, result: TReturn) => boolean;
  recordDuration?: boolean;
  successMetric?: string;
  failureMetric?: string;
  batched?: boolean;
  priority?: 'high' | 'normal';  // High priority metrics bypass batching
}

/**
 * Options for @Logged decorator
 */
export interface LoggedOptions<TArgs extends any[] = any[], TReturn = any> {
  level?: 'debug' | 'info' | 'warn' | 'error';
  logEntry?: boolean;
  logExit?: boolean;
  includeArgs?: boolean | string[] | ((args: TArgs) => any);
  includeResult?: boolean | ((result: TReturn) => any);
  onError?: boolean;
  message?: string | ((args: TArgs, result?: TReturn) => string);
}

/**
 * Metadata keys for decorator storage
 */
export const TELEMETRY_METADATA = {
  NAMESPACE: 'telemetry:namespace',
  CONFIG: 'telemetry:config',
  SERVICE: 'telemetry:service'
} as const;

/**
 * Options passed to signal/computed/effect tracing
 */
export interface SignalTraceOptions extends TelemetryOptions {
  skipInitialValue?: boolean;
}

export interface ComputedTraceOptions extends TelemetryOptions {
  warnOnSlowComputation?: number;
  trackDependencies?: boolean;
}

export interface EffectTraceOptions extends TelemetryOptions {
  warnOnSlowEffect?: number;
}

/**
 * Base trace options
 */
export interface TraceOptions {
  sampleRate?: number;
  recordMetrics?: boolean;
}

/**
 * Base metric options
 */
export interface MetricBaseOptions {
  batched?: boolean;
  flushInterval?: number;
}

/**
 * Base log options
 */
export interface LogOptions {
  level?: 'debug' | 'info' | 'warn' | 'error';
  includeContext?: boolean;
}