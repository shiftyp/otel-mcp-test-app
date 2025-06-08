// IMPORTANT: Initialize OpenTelemetry first!
import { startInstrumentation } from './instrumentation';
startInstrumentation(); // Call this before any other imports that you want to instrument

import express, { Express, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { config } from './config';
import { trace, SpanStatusCode } from '@opentelemetry/api';

import userRoutes from './api/userRoutes'; 
import { timeStamp } from 'console';

const app: Express = express();

// Middleware
app.use(express.json());

// Basic logging middleware (can be enhanced with OpenTelemetry)
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// PostgreSQL Client Setup (example - connection pooling is good practice)
const pgPool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
});

pgPool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pgPool.on('error', (err) => {
  console.error('PostgreSQL client error:', err);
});

// Redis Client Setup
const redisClient: RedisClientType = createClient({
  password: config.redis.password,
  socket: {
    host: config.redis.host,
    port: config.redis.port,
  }
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

// Connect Redis client
async function connectRedis() {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
  }
}
connectRedis();

app.get('/health', (req: Request, res: Response) => {
  // Example of a custom trace span
  const tracer = trace.getTracer('user-service-tracer');
  const span = tracer.startSpan('health-check-span');
  res.status(200).json({ status: 'healthy', service: 'user-service', timeStamp:  new Date().toISOString()});
  span.end();
});

app.get('/ready', (req: Request, res: Response) => {
  // Example of a custom trace span
  const tracer = trace.getTracer('user-service-tracer');
  const span = tracer.startSpan('health-check-span');
  res.status(200).json({ status: 'ready', service: 'user-service', timeStamp: new Date().toISOString() });
  span.end();
});

// Mount user routes
app.use('/api/users', userRoutes(pgPool, redisClient));

// Global error handler (basic example)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  // Potentially record error with OpenTelemetry here
  const tracer = trace.getTracer('user-service-tracer');
  const span = tracer.startSpan('global-error-handler');
  span.recordException(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  span.end();

  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Start server
const port = parseInt(config.port as string, 10) || 3001;
app.listen(port, () => {
  console.log(`User service listening on port ${port}`);
});

export default app; // For potential testing or programmatic use
