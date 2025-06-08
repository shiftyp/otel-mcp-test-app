// Server-side telemetry initialization
// Note: The angular-telemetry package provides telemetry through Angular DI
// For server-side telemetry, you'll need to set up OpenTelemetry separately

import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

const collectorUrl = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] || 'http://localhost:4317';

// Initialize the tracer provider
const provider = new NodeTracerProvider({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'ecommerce-frontend-ssr',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'environment': process.env['NODE_ENV'] === 'production' ? 'production' : 'development',
  }),
});

// Configure the exporter
const exporter = new OTLPTraceExporter({
  url: collectorUrl,
});

// Add the span processor
provider.addSpanProcessor(new BatchSpanProcessor(exporter));

// Register the provider with W3C trace context propagation
provider.register({
  propagator: new W3CTraceContextPropagator(),
});

// Register instrumentations
registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation({
      ignoreIncomingPaths: [/health/],
    }),
    new ExpressInstrumentation(),
  ],
});

console.log('Server instrumentation initialized');