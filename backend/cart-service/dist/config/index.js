"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || 'redis-password',
    },
    server: {
        port: parseInt(process.env.PORT || '3002', 10),
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    },
    otel: {
        serviceName: process.env.OTEL_SERVICE_NAME || 'cart-service',
        collectorUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
    },
    cart: {
        ttl: parseInt(process.env.CART_TTL || '86400', 10), // 24 hours default
    }
};
//# sourceMappingURL=index.js.map