"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const api_1 = require("@opentelemetry/api");
const server_sdk_1 = require("@openfeature/server-sdk");
const flagd_provider_1 = require("@openfeature/flagd-provider");
const productRoutes_1 = __importDefault(require("./api/productRoutes"));
const config_1 = require("./config");
const app = (0, express_1.default)();
const tracer = api_1.trace.getTracer('product-service');
const flagdProvider = new flagd_provider_1.FlagdProvider({
    host: process.env.FLAGD_HOST || 'localhost',
    port: parseInt(process.env.FLAGD_PORT || '8013'),
    tls: false,
});
server_sdk_1.OpenFeature.setProvider(flagdProvider);
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((req, res, next) => {
    const span = tracer.startSpan(`${req.method} ${req.path}`);
    span.setAttributes({
        'http.method': req.method,
        'http.url': req.url,
        'http.target': req.path,
        'http.host': req.hostname,
        'http.scheme': req.protocol,
        'http.user_agent': req.get('user-agent') || '',
    });
    const originalSend = res.send;
    res.send = function (data) {
        span.setAttributes({
            'http.status_code': res.statusCode,
        });
        span.end();
        return originalSend.call(this, data);
    };
    next();
});
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        service: 'product-service',
        timestamp: new Date().toISOString(),
    });
});
app.get('/ready', (_req, res) => {
    res.json({
        status: 'ready',
        service: 'product-service',
        timestamp: new Date().toISOString(),
    });
});
app.use('/api/products', productRoutes_1.default);
app.use((err, _req, res, _next) => {
    console.error('Error:', err);
    const span = api_1.trace.getActiveSpan();
    if (span) {
        span.recordException(err);
    }
    res.status(500).json({
        error: 'Internal server error',
        message: config_1.config.nodeEnv === 'development' ? err.message : undefined,
    });
});
const PORT = config_1.config.port;
app.listen(PORT, async () => {
    console.log(`Product service running on port ${PORT}`);
    console.log(`Environment: ${config_1.config.nodeEnv}`);
    console.log('OpenTelemetry instrumentation enabled');
    try {
        await server_sdk_1.OpenFeature.getClient().getBooleanValue('healthCheck', false);
        console.log('Feature flag provider connected');
    }
    catch (error) {
        console.warn('Feature flag provider not available:', error);
    }
});
//# sourceMappingURL=server.js.map