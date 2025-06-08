import { Injectable, PLATFORM_ID, Inject, Signal, WritableSignal, EffectRef } from '@angular/core';
import { DefaultTelemetryService } from 'angular-telemetry';
import { trace } from '@opentelemetry/api';

// Extended telemetry service with backward compatibility
@Injectable({
  providedIn: 'root'
})
export class TelemetryService extends DefaultTelemetryService {
  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    super(platformId);
  }

  // Backward compatibility methods
  signal<T>(initialValue: T, options?: any): WritableSignal<T> {
    return this.createTracedSignal(initialValue, options?.trackerName || 'signal', options) as any;
  }

  computed<T>(computation: () => T, options?: any): Signal<T> {
    return this.createTracedComputed(computation, options?.trackerName || 'computed', options) as any;
  }

  effect(effectFn: () => void, options?: any): EffectRef {
    return this.createTracedEffect(effectFn, options?.trackerName || 'effect', options) as any;
  }

  recordPageView(pageName: string): void {
    const span = trace.getTracer('page-views').startSpan(`page-view-${pageName}`, {
      attributes: {
        'page.name': pageName,
        'page.url': typeof window !== 'undefined' ? window.location.href : '',
      }
    });
    span.end();
  }

  generatePerformanceReport(): any {
    // This is a placeholder for performance report generation
    return {
      signals: {},
      computed: {},
      effects: {},
      businessMetrics: {},
      summary: 'Performance tracking enabled'
    };
  }

  getSignalPerformanceReport(): any {
    return this.generatePerformanceReport();
  }

  logError(message: string, error: Error): void {
    this.log(message, { error: error.message, stack: error.stack }, 'error');
  }

}