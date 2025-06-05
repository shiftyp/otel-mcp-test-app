// Import only what we need for browser
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
// These imports are conditional based on what's available
let FetchInstrumentation: any;
let XMLHttpRequestInstrumentation: any;
let DocumentLoadInstrumentation: any;
let ZoneContextManager: any;

try {
  FetchInstrumentation = require('@opentelemetry/instrumentation-fetch').FetchInstrumentation;
} catch {}
try {
  XMLHttpRequestInstrumentation = require('@opentelemetry/instrumentation-xml-http-request').XMLHttpRequestInstrumentation;
} catch {}
try {
  DocumentLoadInstrumentation = require('@opentelemetry/instrumentation-document-load').DocumentLoadInstrumentation;
} catch {}
try {
  ZoneContextManager = require('@opentelemetry/context-zone').ZoneContextManager;
} catch {}
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
}

export function initializeBrowserTelemetry(config: BrowserTelemetryConfig): void {
  const collectorUrl = config.collectorUrl || 'http://localhost:4318';

  // Initialize the tracer provider
  const provider = new WebTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion,
      'environment': config.environment || 'development',
      'telemetry.sdk.name': '@otel-mcp-test-app/angular-telemetry',
      'telemetry.sdk.version': '1.0.0',
    }),
  });

  // Configure the trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: `${collectorUrl}/v1/traces`,
  });

  // Add the span processor
  provider.addSpanProcessor(new BatchSpanProcessor(traceExporter));

  // Register the provider with zone context manager for Angular
  if (ZoneContextManager) {
    provider.register({
      contextManager: new ZoneContextManager(),
    });
  } else {
    provider.register();
  }

  // Initialize metrics if enabled
  if (config.enableMetrics !== false) {
    const metricExporter = new OTLPMetricExporter({
      url: `${collectorUrl}/v1/metrics`,
    });

    const meterProvider = new MeterProvider({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: config.serviceName,
        [ATTR_SERVICE_VERSION]: config.serviceVersion,
        'environment': config.environment || 'development',
      }),
      readers: [
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 30000,
        }),
      ],
    });

    meterProvider.addMetricReader(
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 30000,
      })
    );
  }

  // Register auto-instrumentations if enabled
  if (config.enableAutoInstrumentation !== false) {
    const instrumentations = [];
    
    if (FetchInstrumentation) {
      instrumentations.push(new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [/.*/],
        clearTimingResources: true,
      }));
    }
    
    if (XMLHttpRequestInstrumentation) {
      instrumentations.push(new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: [/.*/],
        clearTimingResources: true,
      }));
    }
    
    if (DocumentLoadInstrumentation) {
      instrumentations.push(new DocumentLoadInstrumentation());
    }
    
    if (instrumentations.length > 0) {
      registerInstrumentations({
        instrumentations,
      });
    }
  }
}