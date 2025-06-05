import { NgModule, ModuleWithProviders } from '@angular/core';
import { TELEMETRY_SERVICE } from './services/telemetry-service.token';
import { TelemetryConfig } from './services/telemetry.interface';
import { DefaultTelemetryService } from './services/default-telemetry.service';
import { ConfigurableTelemetryService } from './services/configurable-telemetry.service';

@NgModule({
  providers: [
    // Provide a default service when module is imported without forRoot
    {
      provide: TELEMETRY_SERVICE,
      useClass: DefaultTelemetryService
    }
  ]
})
export class TelemetryModule {
  /**
   * Configure the telemetry module with optional features.
   * 
   * @param config - Configuration options for telemetry features
   * @returns Module with providers
   * 
   * @example
   * ```typescript
   * // Basic usage with default service
   * imports: [TelemetryModule.forRoot()]
   * 
   * // Enable specific features
   * imports: [
   *   TelemetryModule.forRoot({
   *     enableWebVitals: true,
   *     enableStateTransfer: true,
   *     defaultSampleRate: 0.2
   *   })
   * ]
   * 
   * // Full enterprise configuration
   * imports: [
   *   TelemetryModule.forRoot({
   *     enableStateTransfer: true,
   *     enableWebVitals: true,
   *     enableSmartSampling: true,
   *     enableEffectLoopDetection: true,
   *     enableBatchedMetrics: true,
   *     enableRequestContext: true,
   *     defaultSampleRate: 0.1,
   *     serverSampleRateMultiplier: 0.01,
   *     slowComputationThreshold: 50,
   *     slowEffectThreshold: 50
   *   })
   * ]
   * ```
   */
  static forRoot(config?: TelemetryConfig): ModuleWithProviders<TelemetryModule> {
    // Determine if any advanced features are enabled
    const hasAdvancedFeatures = config && (
      config.enableStateTransfer ||
      config.enableWebVitals ||
      config.enableSmartSampling ||
      config.enableEffectLoopDetection ||
      config.enableBatchedMetrics ||
      config.enableRequestContext
    );
    
    return {
      ngModule: TelemetryModule,
      providers: [
        {
          provide: 'TELEMETRY_CONFIG',
          useValue: config || {}
        },
        {
          provide: TELEMETRY_SERVICE,
          useClass: hasAdvancedFeatures ? ConfigurableTelemetryService : DefaultTelemetryService
        }
      ]
    };
  }
}