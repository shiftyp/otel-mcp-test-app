import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';

const otelExporterEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: `${otelExporterEndpoint}/v1/traces`,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${otelExporterEndpoint}/v1/metrics`,
    }),
    exportIntervalMillis: 1000, // Export metrics every 1 second
  }),
  logRecordProcessor: new BatchLogRecordProcessor(
    new OTLPLogExporter({
      url: `${otelExporterEndpoint}/v1/logs`,
    })
  ),
  instrumentations: [getNodeAutoInstrumentations({
    // Example: disable an instrumentation
    // '@opentelemetry/instrumentation-fs': {
    //   enabled: false,
    // },
  })],
  // You can add resource attributes here if needed
  // resource: new Resource({
  //   [SemanticResourceAttributes.SERVICE_NAME]: 'user-service',
  // }),
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
