// Import only what we need for browser
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { metrics } from '@opentelemetry/api';
import { registerInstrumentations } from './browser-instrumentation';
// These will be loaded dynamically if available
let FetchInstrumentation: any;
let XMLHttpRequestInstrumentation: any;
let DocumentLoadInstrumentation: any;
let ZoneContextManager: any;
let UserInteractionInstrumentation: any;

// Load instrumentations dynamically
const loadInstrumentations = async () => {
  try {
    const fetchModule = await import('@opentelemetry/instrumentation-fetch');
    FetchInstrumentation = fetchModule.FetchInstrumentation;
  } catch {}
  
  try {
    const xhrModule = await import('@opentelemetry/instrumentation-xml-http-request');
    XMLHttpRequestInstrumentation = xhrModule.XMLHttpRequestInstrumentation;
  } catch {}
  
  try {
    const docModule = await import('@opentelemetry/instrumentation-document-load');
    DocumentLoadInstrumentation = docModule.DocumentLoadInstrumentation;
  } catch {}
  
  try {
    const zoneModule = await import('@opentelemetry/context-zone');
    ZoneContextManager = zoneModule.ZoneContextManager;
  } catch {}
  
  try {
    const interactionModule = await import('@opentelemetry/instrumentation-user-interaction');
    UserInteractionInstrumentation = interactionModule.UserInteractionInstrumentation;
  } catch {}
};
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

export interface BrowserTelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  environment?: string;
  collectorUrl?: string;
  enableAutoInstrumentation?: boolean;
  enableMetrics?: boolean;
  // Enhanced instrumentation options
  instrumentations?: {
    fetch?: {
      enabled?: boolean;
      propagateTraceHeaderCorsUrls?: RegExp[];
      clearTimingResources?: boolean;
      applyCustomAttributesOnSpan?: (span: any, request: any, response: any) => void;
    };
    xmlHttpRequest?: {
      enabled?: boolean;
      propagateTraceHeaderCorsUrls?: RegExp[];
      clearTimingResources?: boolean;
    };
    documentLoad?: {
      enabled?: boolean;
      applyCustomAttributesOnSpan?: any;
    };
    userInteraction?: {
      enabled?: boolean;
      eventNames?: string[];
      shouldPreventSpanCreation?: (eventType: string, element: HTMLElement, span: any) => boolean;
    };
  };
  // Resource attributes
  resource?: {
    attributes?: Record<string, any>;
  };
  // Sampling configuration
  sampling?: {
    probability?: number;
    rules?: Array<{
      urlPattern: RegExp;
      samplingRate: number;
    }>;
  };
  // Web Vitals configuration
  webVitals?: {
    enabled?: boolean;
    reportAllChanges?: boolean;
    thresholds?: {
      lcp?: number;
      fid?: number;
      cls?: number;
      fcp?: number;
      ttfb?: number;
    };
  };
  // Batch configuration
  batchConfig?: {
    maxQueueSize?: number;
    maxExportBatchSize?: number;
    scheduledDelayMillis?: number;
  };
}

export async function initializeBrowserTelemetry(config: BrowserTelemetryConfig): Promise<void> {
  // Load instrumentations first
  await loadInstrumentations();
  const collectorUrl = config.collectorUrl || 'http://localhost:4318';
  
  console.log('[Telemetry] Initializing browser telemetry with collector URL:', collectorUrl);

  // Merge default and custom resource attributes
  const resourceAttributes = {
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion,
    'environment': config.environment || 'development',
    'telemetry.sdk.name': '@otel-mcp-test-app/angular-telemetry',
    'telemetry.sdk.version': '1.0.0',
    ...config.resource?.attributes
  };

  // Configure the trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: `${collectorUrl}/v1/traces`,
  });
  
  console.log('[Telemetry] Trace exporter configured with URL:', `${collectorUrl}/v1/traces`);

  // Create a custom span processor to debug exports
  const spanProcessor = new BatchSpanProcessor(traceExporter, {
    maxQueueSize: config.batchConfig?.maxQueueSize || 2048,
    maxExportBatchSize: config.batchConfig?.maxExportBatchSize || 512,
    scheduledDelayMillis: config.batchConfig?.scheduledDelayMillis || 5000,
  });
  
  // Add export result logging
  const originalExport = traceExporter.export.bind(traceExporter);
  traceExporter.export = (spans, resultCallback) => {
    console.log(`[Telemetry] Exporting ${spans.length} spans to ${collectorUrl}/v1/traces`);
    return originalExport(spans, (result) => {
      if (result.code === 0) {
        console.log(`[Telemetry] Successfully exported ${spans.length} spans`);
      } else {
        console.error(`[Telemetry] Failed to export spans:`, result);
      }
      resultCallback(result);
    });
  };

  // Initialize the tracer provider with span processor
  const provider = new WebTracerProvider({
    resource: new Resource(resourceAttributes),
    spanProcessors: [spanProcessor],
  });

  // Register the provider with zone context manager for Angular
  if (ZoneContextManager) {
    provider.register({
      contextManager: new ZoneContextManager(),
    });
    console.log('[Telemetry] Registered with ZoneContextManager for Angular');
  } else {
    provider.register();
    console.log('[Telemetry] Registered without ZoneContextManager');
  }

  // Initialize metrics if enabled
  if (config.enableMetrics !== false) {
    const metricExporter = new OTLPMetricExporter({
      url: `${collectorUrl}/v1/metrics`,
    });

    const meterProvider = new MeterProvider({
      resource: new Resource(resourceAttributes),
      readers: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: config.batchConfig?.scheduledDelayMillis || 30000,
        }),
      ],
    });
    
    // Register the meter provider globally
    metrics.setGlobalMeterProvider(meterProvider);
  }

  // Register auto-instrumentations if enabled
  if (config.enableAutoInstrumentation !== false) {
    const instrumentations = [];
    
    // Fetch instrumentation
    if (FetchInstrumentation && config.instrumentations?.fetch?.enabled !== false) {
      const fetchConfig = config.instrumentations?.fetch || {};
      instrumentations.push(new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: fetchConfig.propagateTraceHeaderCorsUrls || [/.*/],
        clearTimingResources: fetchConfig.clearTimingResources !== false,
        applyCustomAttributesOnSpan: fetchConfig.applyCustomAttributesOnSpan,
      }));
    }
    
    // XMLHttpRequest instrumentation
    if (XMLHttpRequestInstrumentation && config.instrumentations?.xmlHttpRequest?.enabled !== false) {
      const xhrConfig = config.instrumentations?.xmlHttpRequest || {};
      instrumentations.push(new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: xhrConfig.propagateTraceHeaderCorsUrls || [/.*/],
        clearTimingResources: xhrConfig.clearTimingResources !== false,
      }));
    }
    
    // Document load instrumentation
    if (DocumentLoadInstrumentation && config.instrumentations?.documentLoad?.enabled !== false) {
      const docConfig = config.instrumentations?.documentLoad || {};
      instrumentations.push(new DocumentLoadInstrumentation(docConfig.applyCustomAttributesOnSpan ? {
        applyCustomAttributesOnSpan: docConfig.applyCustomAttributesOnSpan
      } : {}));
    }
    
    // User interaction instrumentation
    if (UserInteractionInstrumentation && config.instrumentations?.userInteraction?.enabled) {
      const interactionConfig = config.instrumentations.userInteraction;
      instrumentations.push(new UserInteractionInstrumentation({
        eventNames: interactionConfig.eventNames || ['click'],
        shouldPreventSpanCreation: interactionConfig.shouldPreventSpanCreation,
      }));
    }
    
    if (instrumentations.length > 0) {
      registerInstrumentations({
        instrumentations,
      });
    }
  }
  
  // Initialize Web Vitals monitoring if enabled
  if (config.webVitals?.enabled) {
    initializeWebVitals(config.webVitals);
  }
}

// Web Vitals monitoring
function initializeWebVitals(webVitalsConfig: any) {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    return;
  }
  
  // Dynamically import web-vitals to avoid bundling if not used
  import('web-vitals').then(({ onCLS, onINP, onFCP, onLCP, onTTFB }: any) => {
    const reportWebVital = (metric: any, metricName: string) => {
      const meter = metrics.getMeter('web-vitals');
      const histogram = meter.createHistogram(`web_vitals_${metricName.toLowerCase()}`, {
        description: `Web Vitals ${metricName} measurement`,
        unit: metricName === 'CLS' ? '1' : 'ms',
      });
      
      histogram.record(metric.value, {
        'web_vital.name': metricName,
        'web_vital.id': metric.id,
        'web_vital.rating': metric.rating || 'unknown',
        'page.url': window.location.href,
      });
      
      // Check against thresholds
      const threshold = webVitalsConfig.thresholds?.[metricName.toLowerCase()];
      if (threshold && metric.value > threshold) {
        const unit = metricName === 'CLS' ? '' : 'ms';
        console.warn(`[Web Vitals] ${metricName} exceeded threshold: ${metric.value}${unit} > ${threshold}${unit}`);
      }
    };
    
    const options = { reportAllChanges: webVitalsConfig.reportAllChanges };
    
    onCLS((metric: any) => reportWebVital(metric, 'CLS'), options);
    onINP((metric: any) => reportWebVital(metric, 'INP'), options); // INP replaced FID
    onFCP((metric: any) => reportWebVital(metric, 'FCP'), options);
    onLCP((metric: any) => reportWebVital(metric, 'LCP'), options);
    onTTFB((metric: any) => reportWebVital(metric, 'TTFB'), options);
  }).catch(err => {
    console.warn('[Web Vitals] Failed to initialize:', err);
  });
}