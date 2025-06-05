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
    return defaultServiceInstance;
  }
}

/**
 * Business metrics utility for recording custom metrics.
 */
export class BusinessMetrics {
  private static batchedMetrics = new Map<string, { sum: number; count: number; lastFlush: number }>();
  private static batchInterval: any = null;
  
  /**
   * Records a metric immediately.
   * 
   * @param name - The metric name
   * @param value - The metric value
   * @param attributes - Optional attributes for the metric
   * 
   * @example
   * ```typescript
   * BusinessMetrics.record('payment_amount', 99.99, { currency: 'USD' });
   * ```
   */
  static record(name: string, value: number, attributes?: Record<string, any>): void {
    const service = getTelemetryService();
    service.recordMetric(name, value, attributes);
  }
  
  /**
   * Records a metric in a batched manner for high-frequency updates.
   * Metrics are aggregated and flushed every 5 seconds.
   * 
   * @param name - The metric name
   * @param value - The metric value
   * 
   * @example
   * ```typescript
   * // For high-frequency updates
   * BusinessMetrics.recordBatched('api_calls', 1);
   * ```
   */
  static recordBatched(name: string, value: number): void {
    const existing = this.batchedMetrics.get(name) || { sum: 0, count: 0, lastFlush: Date.now() };
    existing.sum += value;
    existing.count++;
    this.batchedMetrics.set(name, existing);
    
    // Start batch interval if not running
    if (!this.batchInterval) {
      this.batchInterval = setInterval(() => this.flushBatched(), 5000);
    }
  }
  
  private static flushBatched(): void {
    const service = getTelemetryService();
    const now = Date.now();
    
    this.batchedMetrics.forEach((data, name) => {
      // Record sum
      service.recordMetric(`${name}_total`, data.sum);
      
      // Record average
      if (data.count > 1) {
        service.recordMetric(`${name}_avg`, data.sum / data.count);
      }
      
      // Record rate (per second)
      const duration = (now - data.lastFlush) / 1000;
      if (duration > 0) {
        service.recordMetric(`${name}_rate`, data.count / duration);
      }
    });
    
    this.batchedMetrics.clear();
    
    // Stop interval if no metrics
    if (this.batchedMetrics.size === 0 && this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
  }
}