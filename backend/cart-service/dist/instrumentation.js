"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_node_1 = require("@opentelemetry/sdk-node");
const auto_instrumentations_node_1 = require("@opentelemetry/auto-instrumentations-node");
const exporter_trace_otlp_http_1 = require("@opentelemetry/exporter-trace-otlp-http");
const exporter_metrics_otlp_http_1 = require("@opentelemetry/exporter-metrics-otlp-http");
const exporter_logs_otlp_http_1 = require("@opentelemetry/exporter-logs-otlp-http");
const sdk_metrics_1 = require("@opentelemetry/sdk-metrics");
const sdk_logs_1 = require("@opentelemetry/sdk-logs");
const resources_1 = require("@opentelemetry/resources");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const config_1 = require("./config");
// Create resource with service information
const resource = new resources_1.Resource({
    [semantic_conventions_1.SemanticResourceAttributes.SERVICE_NAME]: config_1.config.otel.serviceName,
    [semantic_conventions_1.SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
});
// Create OTLP exporters
const traceExporter = new exporter_trace_otlp_http_1.OTLPTraceExporter({
    url: `${config_1.config.otel.collectorUrl}/v1/traces`,
});
const metricExporter = new exporter_metrics_otlp_http_1.OTLPMetricExporter({
    url: `${config_1.config.otel.collectorUrl}/v1/metrics`,
});
const logExporter = new exporter_logs_otlp_http_1.OTLPLogExporter({
    url: `${config_1.config.otel.collectorUrl}/v1/logs`,
});
// Create and configure SDK
const sdk = new sdk_node_1.NodeSDK({
    resource,
    traceExporter,
    metricReader: new sdk_metrics_1.PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 10000,
    }),
    logRecordProcessor: new sdk_logs_1.BatchLogRecordProcessor(logExporter),
    instrumentations: [
        (0, auto_instrumentations_node_1.getNodeAutoInstrumentations)({
            '@opentelemetry/instrumentation-fs': {
                enabled: false,
            },
            '@opentelemetry/instrumentation-http': {
                ignoreIncomingRequestHook: (request) => {
                    // Ignore health check endpoints
                    const url = request.url;
                    return url === '/health' || url === '/ready';
                },
            },
        }),
    ],
});
// Initialize the SDK and register with the OpenTelemetry API
sdk.start();
// Gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
    sdk.shutdown()
        .then(() => console.log('Tracing terminated'))
        .catch((error) => console.log('Error terminating tracing', error))
        .finally(() => process.exit(0));
});
exports.default = sdk;
//# sourceMappingURL=instrumentation.js.map