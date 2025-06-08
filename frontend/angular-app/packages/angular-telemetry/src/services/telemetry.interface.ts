import { Signal, WritableSignal, EffectRef } from '@angular/core';
import { Observable } from 'rxjs';
import { SignalChangeEvent } from './configurable-telemetry.service';

export interface SignalTelemetryOptions<T> {
  spanName?: string;
  trackerName?: string;
  sampleRate?: number;  // 0-1, explicit sampling rate
  attributes?: (value: T) => Record<string, any>;
  recordMetrics?: boolean;
  skipInitialValue?: boolean;
}

export interface ComputedTelemetryOptions<T> extends SignalTelemetryOptions<T> {
  warnOnSlowComputation?: number;  // milliseconds
  trackDependencies?: boolean;
}

export interface EffectTelemetryOptions {
  spanName?: string;
  sampleRate?: number;
  attributes?: Record<string, any>;
  warnOnSlowEffect?: number;  // milliseconds
}

export interface TelemetryConfig {
  // Feature flags
  enableStateTransfer?: boolean;      // SSR state transfer between server/client
  enableWebVitals?: boolean;          // Collect Web Vitals metrics (browser only)
  enableSmartSampling?: boolean;      // Adaptive sampling based on signal importance
  enableEffectLoopDetection?: boolean; // Detect potential infinite loops in effects
  enableBatchedMetrics?: boolean;     // Advanced metric batching with rates
  enableRequestContext?: boolean;     // Track request IDs across operations
  
  // General configuration
  defaultSampleRate?: number;         // Base sampling rate (0-1)
  serverSampleRateMultiplier?: number; // Multiply sample rate on server (default: 0.1)
  enableMetrics?: boolean;            // Enable metrics collection
  enableLogging?: boolean;            // Enable structured logging
  metricsFlushInterval?: number;      // How often to flush metrics (ms)
  slowComputationThreshold?: number;  // Warn when computations exceed this (ms)
  slowEffectThreshold?: number;       // Warn when effects exceed this (ms)
  
  // RxJS Metric Batching Configuration
  metricBatching?: {
    flushInterval: number;           // Milliseconds between flushes
    maxBatchSize: number;           // Maximum metrics per batch
    maxQueueSize: number;           // Maximum queued metrics
    autoFlushThreshold: number;     // Percentage of maxBatchSize to trigger flush
  };
  
  // Smart Sampling Configuration
  smartSampling?: {
    baseRate: number;                    // Base sampling rate (0.0-1.0)
    minRate: number;                     // Minimum rate (never go below)
    maxRate: number;                     // Maximum rate (never go above)
    adaptiveWindow: number;              // Time window for frequency calculation (ms)
    importanceThreshold: number;         // Duration threshold for "important" operations (ms)
    budgetPerMinute: number;            // Maximum spans per minute
    environmentMultipliers: {
      development: number;              // e.g., 10x in dev
      staging: number;                  // e.g., 5x in staging
      production: number;               // e.g., 1x in production
    };
  };
  
  // Web Vitals Configuration
  webVitalsConfig?: {
    reportAllChanges: boolean;      // Report all changes or just final values
    thresholds: {
      LCP: number;                  // Largest Contentful Paint threshold (ms)
      FID: number;                  // First Input Delay threshold (ms)
      CLS: number;                  // Cumulative Layout Shift threshold
    };
  };
}

// Extended WritableSignal interface with change tracking
export interface TracedWritableSignal<T> extends WritableSignal<T> {
  changes$: Observable<SignalChangeEvent<T>>;
}

export interface ITelemetryService {
  createTracedSignal<T>(
    initialValue: T,
    name: string,
    options?: SignalTelemetryOptions<T>
  ): TracedWritableSignal<T>;
  
  createTracedComputed<T>(
    computation: () => T,
    name: string,
    options?: ComputedTelemetryOptions<T>
  ): Signal<T>;
  
  createTracedEffect(
    effectFn: () => void,
    name: string,
    options?: EffectTelemetryOptions
  ): EffectRef;
  
  log(message: string, data?: any, level?: 'info' | 'warn' | 'error'): void;
  
  withSpan<T>(name: string, fn: () => T, attributes?: Record<string, any>): T;
  
  recordMetric(name: string, value: number, attributes?: Record<string, any>): void;
}