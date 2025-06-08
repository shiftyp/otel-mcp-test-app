import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const otelExporterEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';

const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'user-service',
  [ATTR_SERVICE_VERSION]: '1.0.0',
  'deployment.environment': process.env.NODE_ENV || 'development',
});

const sdk = new NodeSDK({
  resource,
  textMapPropagator: new W3CTraceContextPropagator(),
  traceExporter: new OTLPTraceExporter({
    url: otelExporterEndpoint,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: otelExporterEndpoint,
    }),
    exportIntervalMillis: 1000, // Export metrics every 1 second
  }),
  logRecordProcessor: new BatchLogRecordProcessor(
    new OTLPLogExporter({
      url: otelExporterEndpoint,
    })
  ),
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': {
      enabled: false,
    },
    '@opentelemetry/instrumentation-http': {
      enabled: true,
      ignoreIncomingPaths: [/health/],
    },
    '@opentelemetry/instrumentation-express': {
      enabled: true,
    },
    '@opentelemetry/instrumentation-pg': {
      enabled: true,
    },
    '@opentelemetry/instrumentation-redis': {
      enabled: true,
    },
  })],
});

export async function startInstrumentation() {
  try {
    await sdk.start();
    console.log('OpenTelemetry instrumentation started for user-service');
  } catch (error) {
    console.error('Error starting OpenTelemetry instrumentation:', error);
  }

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('OpenTelemetry instrumentation shut down successfully'))
      .catch((err: Error) => console.error('Error shutting down OpenTelemetry instrumentation:', err))
      .finally(() => process.exit(0));
  });
}
