import express, { Express, Request, Response, NextFunction } from 'express';
import { trace } from '@opentelemetry/api';
import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdProvider } from '@openfeature/flagd-provider';
import productRoutes from './api/productRoutes';
import { config } from './config';
import { initializeDatabase } from './db';
import { initializeRedis } from './services/redis';

const app: Express = express();
const tracer = trace.getTracer('product-service');

// Initialize OpenFeature with flagd provider
const flagdProvider = new FlagdProvider({
  host: process.env.FLAGD_HOST || 'localhost',
  port: parseInt(process.env.FLAGD_PORT || '8013'),
  tls: false,
});

OpenFeature.setProvider(flagdProvider);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, res: Response, next: NextFunction) => {
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
  res.send = function (data): Response {
    span.setAttributes({
      'http.status_code': res.statusCode,
    });
    span.end();
    return originalSend.call(this, data);
  };

  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'product-service',
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', (_req: Request, res: Response) => {
  res.json({
    status: 'ready',
    service: 'product-service',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/products', productRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(err);
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

const PORT = config.port;

app.listen(PORT, async () => {
  console.log(`Product service running on port ${PORT}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log('OpenTelemetry instrumentation enabled');
  
  // Initialize database connection
  try {
    await initializeDatabase();
    await initializeRedis();
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
  
  // Wait for feature flag provider to be ready
  try {
    await OpenFeature.getClient().getBooleanValue('healthCheck', false);
    console.log('Feature flag provider connected');
  } catch (error) {
    console.warn('Feature flag provider not available:', error);
  }
});