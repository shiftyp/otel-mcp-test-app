import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import dotenv from 'dotenv';

dotenv.config();

const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'product-service',
  [ATTR_SERVICE_VERSION]: '1.0.0',
  'deployment.environment': process.env.NODE_ENV || 'development',
});

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4317',
  timeoutMillis: 5000, // 5 second timeout to prevent hanging
});

const sdk = new NodeSDK({
  resource,
  traceExporter,
  textMapPropagator: new W3CTraceContextPropagator(),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
      '@opentelemetry/instrumentation-pg': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingPaths: [/health/],
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
    }),
  ],
});

sdk.start();
console.log('OpenTelemetry instrumentation started successfully');

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry terminated'))
    .catch((error) => console.error('Error terminating OpenTelemetry', error))
    .finally(() => process.exit(0));
});

export { sdk };