import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3003,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: process.env.DATABASE_NAME || 'ecommerce_products',
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres123',
    max: 20, // max number of clients in the pool
    idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '1', 10),
    keyPrefix: 'product:',
    ttl: {
      product: 3600, // 1 hour
      productList: 1800, // 30 minutes
      category: 7200, // 2 hours
    },
  },
  
  otel: {
    serviceName: 'product-service',
    exporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
    tracesEndpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4317',
    metricsEndpoint: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4317',
  },
  
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
  
  search: {
    fuzzyMatchingThreshold: 0.6,
    maxSearchResults: 1000,
  },
};