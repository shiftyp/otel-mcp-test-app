// Import instrumentation first
import './instrumentation';

import express, { Request, Response, NextFunction } from 'express';
import { createClient } from 'redis';
import { trace } from '@opentelemetry/api';
import { config } from './config';
import cartRoutes from './api/cartRoutes';
import { authMiddleware } from './middleware/auth';

const app = express();
const tracer = trace.getTracer('cart-service');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((_req: Request, res: Response, next: NextFunction): void => {
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
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy' });
});

app.get('/ready', (_req: Request, res: Response) => {
  if (redisClient.isReady) {
    res.status(200).json({ status: 'ready' });
  } else {
    res.status(503).json({ status: 'not ready' });
  }
});

// Initialize Redis client
const redisClient = createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port,
  },
  password: config.redis.password,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

// Apply auth middleware to all cart routes
app.use('/api/cart', authMiddleware);

// Routes
app.use('/api/cart', cartRoutes(redisClient));

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
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
    app.listen(config.server.port, () => {
      console.log(`Cart service listening on port ${config.server.port}`);
    });
  } catch (error) {
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