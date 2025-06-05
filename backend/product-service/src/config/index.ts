import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3002,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce_products',
    options: {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
    },
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