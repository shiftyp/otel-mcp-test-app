"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Import instrumentation first
require("./instrumentation");
const express_1 = __importDefault(require("express"));
const redis_1 = require("redis");
const api_1 = require("@opentelemetry/api");
const config_1 = require("./config");
const cartRoutes_1 = __importDefault(require("./api/cartRoutes"));
const auth_1 = require("./middleware/auth");
const app = (0, express_1.default)();
const tracer = api_1.trace.getTracer('cart-service');
// Middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// CORS middleware
app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (_req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
});
// Health check endpoints
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'healthy' });
});
app.get('/ready', (_req, res) => {
    if (redisClient.isReady) {
        res.status(200).json({ status: 'ready' });
    }
    else {
        res.status(503).json({ status: 'not ready' });
    }
});
// Initialize Redis client
const redisClient = (0, redis_1.createClient)({
    socket: {
        host: config_1.config.redis.host,
        port: config_1.config.redis.port,
    },
    password: config_1.config.redis.password,
});
redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
});
redisClient.on('connect', () => {
    console.log('Connected to Redis');
});
// Apply auth middleware to all cart routes
app.use('/api/cart', auth_1.authMiddleware);
// Routes
app.use('/api/cart', (0, cartRoutes_1.default)(redisClient));
// Error handling middleware
app.use((err, _req, res, _next) => {
    const span = tracer.startSpan('error-handler');
    span.recordException(err);
    span.end();
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
// Start server
async function start() {
    try {
        // Connect to Redis
        await redisClient.connect();
        console.log('Redis connection established');
        // Start Express server
        app.listen(config_1.config.server.port, () => {
            console.log(`Cart service listening on port ${config_1.config.server.port}`);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await redisClient.quit();
    process.exit(0);
});
start();
//# sourceMappingURL=server.js.map