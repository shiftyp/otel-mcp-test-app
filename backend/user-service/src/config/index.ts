import dotenv from 'dotenv';

dotenv.config(); // Load .env file if it exists

export const config = {
  port: process.env.PORT || process.env.USER_SERVICE_PORT || '3001',
  postgres: {
    host: process.env.DATABASE_HOST || process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.DATABASE_USER || process.env.POSTGRES_USER || 'user',
    password: process.env.DATABASE_PASSWORD || process.env.POSTGRES_PASSWORD || 'password',
    database: process.env.DATABASE_NAME || process.env.POSTGRES_DB || 'user_db',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  otel: {
    exporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  }
};
