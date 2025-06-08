import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { initializeBrowserTelemetry } from 'angular-telemetry';
import { environment } from './environments/environment';
import { initializeGlobalErrorHandlers } from './app/services/global-error-handler.service';
import { TelemetryService } from './app/services/telemetry.service';

// Only initialize browser telemetry in browser environment
if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
  // Initialize OpenTelemetry for browser with enhanced configuration
  await initializeBrowserTelemetry({
    serviceName: 'ecommerce-frontend',
    serviceVersion: '1.0.0',
    environment: environment.production ? 'production' : 'development',
    collectorUrl:   new URL(environment.otelCollectorUrl, window.location.origin).href || 'http://localhost:4318',
    enableAutoInstrumentation: true,
    enableMetrics: true,
    // Enhanced instrumentation options
    instrumentations: {
      // Document load instrumentation
      documentLoad: {
        enabled: true,
        // Track all resource timings
        applyCustomAttributesOnSpan: {
          documentFetch: true,
          documentLoad: true,
          resourceFetch: true
        }
      },
      fetch: {
        enabled: false
      },
      xmlHttpRequest: {
        enabled: false
      },
      // User interaction instrumentation
      userInteraction: {
        enabled: true,
        // Track clicks on all elements
        eventNames: ['click', 'submit', 'change', 'input'],
        // Add interaction details
        shouldPreventSpanCreation: (eventType, element, span) => {
          // Skip tracking for noise elements
          if (element.tagName === 'HTML' || element.tagName === 'BODY') {
            return true;
          }
          return false;
        }
      }
    },
    // Resource detection
    resource: {
      attributes: {
        'browser.user_agent': navigator.userAgent,
        'browser.language': navigator.language,
        'browser.mobile': /Mobile|Android|iPhone/i.test(navigator.userAgent),
        'browser.online': navigator.onLine,
        'browser.screen.width': window.screen.width,
        'browser.screen.height': window.screen.height,
        'browser.viewport.width': window.innerWidth,
        'browser.viewport.height': window.innerHeight
      }
    },
    // Sampling configuration
    sampling: {
      // Base sampling rate
      probability: environment.production ? 0.1 : 1.0,
      // Intelligent sampling rules
      rules: [
        { urlPattern: /\/api\/products/, samplingRate: 0.5 },
        { urlPattern: /\/api\/auth/, samplingRate: 1.0 },
        { urlPattern: /\/api\/checkout/, samplingRate: 1.0 },
        { urlPattern: /\/health/, samplingRate: 0.01 }
      ]
    },
    // Enable Web Vitals collection
    webVitals: {
      enabled: true,
      reportAllChanges: true,
      // Custom thresholds for alerting
      thresholds: {
        lcp: 2500,  // Largest Contentful Paint
        fid: 100,   // First Input Delay
        cls: 0.1,   // Cumulative Layout Shift
        fcp: 1800,  // First Contentful Paint
        ttfb: 800   // Time to First Byte
      }
    },
    // Batch configuration for better performance
    batchConfig: {
      maxQueueSize: 100,
      maxExportBatchSize: 50,
      scheduledDelayMillis: environment.production ? 5000 : 1000
    }
  });
}

// Bootstrap with zoneless change detection
bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => {
    // Initialize global error handlers after app is bootstrapped
    const telemetryService = appRef.injector.get(TelemetryService);
    initializeGlobalErrorHandlers(telemetryService);
  })
  .catch((err) => console.error('Bootstrap error:', err));