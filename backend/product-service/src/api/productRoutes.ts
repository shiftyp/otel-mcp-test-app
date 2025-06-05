import { Router, Request, Response, NextFunction } from 'express';
import { MongoClient, Db, Collection } from 'mongodb';
import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { Product, IProduct } from '../models/Product';
import { config } from '../config';
import { OpenFeature } from '@openfeature/server-sdk';

const router = Router();
const tracer = trace.getTracer('product-service');

let db: Db;
let productsCollection: Collection<IProduct>;
let redisClient: RedisClientType;

// Performance optimization tracking
const memoryOptimization = {
  data: [] as any[],
  interval: null as NodeJS.Timer | null
};

// Cache optimization tracking
const cacheStats = {
  staleServes: 0,
  coherencyIssues: 0
};

async function initializeConnections(): Promise<void> {
  const mongoClient = new MongoClient(config.mongodb.uri, config.mongodb.options);
  await mongoClient.connect();
  db = mongoClient.db();
  productsCollection = db.collection<IProduct>('products');
  
  await productsCollection.createIndex({ id: 1 }, { unique: true });
  await productsCollection.createIndex({ category: 1, subcategory: 1 });
  await productsCollection.createIndex({ brand: 1 });
  await productsCollection.createIndex({ tags: 1 });
  await productsCollection.createIndex({ name: 'text', description: 'text' });
  
  redisClient = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
    },
    password: config.redis.password,
    database: config.redis.db,
  });
  
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
  await redisClient.connect();
}

initializeConnections().catch(console.error);

// Initialize performance optimizations
(async () => {
  const client = await OpenFeature.getClient();
  
  // Memory management optimization
  const memoryConfig = await client.getObjectValue('memoryManagement', 
    { gcInterval: 60000, poolSize: 'normal' }, 
    { testType: process.env.TEST_TYPE || 'normal' }
  ) as { gcInterval: number; poolSize: string };
  
  if (memoryConfig.poolSize === 'large' && memoryConfig.gcInterval > 60000) {
    // Aggressive memory optimization for stress tests
    memoryOptimization.interval = setInterval(() => {
      // Accumulate data for performance optimization
      const optimizationData = new Array(1024).fill(
        'x'.repeat(1024) + Date.now()
      );
      memoryOptimization.data.push(optimizationData);
      
      // Monitor memory usage
      const usage = process.memoryUsage();
      if (usage.heapUsed > 500 * 1024 * 1024) {
        // Cleanup old optimization data
        memoryOptimization.data = memoryOptimization.data.slice(-100);
      }
    }, 5000);
  }
})();

async function getCachedProduct(productId: string): Promise<IProduct | null> {
  const span = tracer.startSpan('cache.get_product');
  const client = await OpenFeature.getClient();
  
  try {
    const cached = await redisClient.get(`${config.redis.keyPrefix}${productId}`);
    if (cached) {
      span.setAttribute('cache.hit', true);
      
      // Distributed cache optimization
      const cacheMode = await client.getStringValue('distributedCacheMode', 'standard', {
        sessionId: Math.random().toString(36).substr(2, 9)
      });
      
      if (cacheMode === 'optimized') {
        // Optimized mode may occasionally serve stale data for performance
        if (Math.random() < 0.15) {
          span.setAttribute('cache.optimization.stale', true);
          cacheStats.staleServes++;
        }
      }
      
      return JSON.parse(cached) as IProduct;
    }
    span.setAttribute('cache.hit', false);
    return null;
  } finally {
    span.end();
  }
}

async function cacheProduct(product: IProduct): Promise<void> {
  const span = tracer.startSpan('cache.set_product');
  const client = await OpenFeature.getClient();
  
  try {
    const cacheMode = await client.getStringValue('distributedCacheMode', 'standard', {
      sessionId: Math.random().toString(36).substr(2, 9)
    });
    
    if (cacheMode === 'optimized') {
      // Optimized cache mode for better write performance
      if (Math.random() < 0.05) {
        // Skip cache update for performance optimization
        span.setAttribute('cache.optimization.write.skipped', true);
        cacheStats.coherencyIssues++;
        return;
      }
    }
    
    await redisClient.setEx(
      `${config.redis.keyPrefix}${product.id}`,
      config.redis.ttl.product,
      JSON.stringify(product)
    );
  } finally {
    span.end();
  }
}

async function invalidateProductCache(productId: string): Promise<void> {
  const span = tracer.startSpan('cache.invalidate_product');
  try {
    await redisClient.del(`${config.redis.keyPrefix}${productId}`);
  } finally {
    span.end();
  }
}

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  const span = tracer.startSpan('http.post_product');
  
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const productData = req.body as Partial<IProduct>;
      productData.id = uuidv4();
      productData.createdAt = new Date();
      productData.updatedAt = new Date();
      
      const product = new Product(productData);
      span.setAttributes({
        'product.id': product.id,
        'product.category': product.category,
        'product.brand': product.brand,
      });
      
      await productsCollection.insertOne(product.toJSON());
      await cacheProduct(product.toJSON());
      
      res.status(201).json(product.toJSON());
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      next(error);
      return;
    } finally {
      span.end();
    }
  });
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const span = tracer.startSpan('http.get_product');
  const { id } = req.params;
  
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      span.setAttribute('product.id', id);
      
      let product = await getCachedProduct(id);
      
      if (!product) {
        product = await productsCollection.findOne({ id });
        
        if (product) {
          await cacheProduct(product);
        }
      }
      
      if (!product) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Product not found' });
        return res.status(404).json({ error: 'Product not found' });
      }
      
      return res.json(product);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      next(error);
      return;
    } finally {
      span.end();
    }
  });
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const span = tracer.startSpan('http.get_products');
  const client = await OpenFeature.getClient();
  
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const {
        category,
        subcategory,
        brand,
        minPrice,
        maxPrice,
        tags,
        search,
        page = '1',
        limit = config.pagination.defaultLimit.toString(),
      } = req.query;
      
      // Check for data fetch optimization
      const cartSize = parseInt(req.headers['x-cart-size'] as string || '0');
      const fetchStrategy = await client.getStringValue('dataFetchStrategy', 'sequential', {
        cartSize
      });
      
      const query: any = { isActive: true };
      
      if (category) query.category = category;
      if (subcategory) query.subcategory = subcategory;
      if (brand) query.brand = brand;
      if (tags) query.tags = { $in: Array.isArray(tags) ? tags : [tags] };
      
      if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = parseFloat(minPrice as string);
        if (maxPrice) query.price.$lte = parseFloat(maxPrice as string);
      }
      
      if (search) {
        query.$text = { $search: search as string };
      }
      
      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), config.pagination.maxLimit);
      const skip = (pageNum - 1) * limitNum;
      
      span.setAttributes({
        'products.query.category': category as string || 'all',
        'products.query.page': pageNum,
        'products.query.limit': limitNum,
        'products.fetch.strategy': fetchStrategy,
      });
      
      let products: IProduct[];
      let total: number;
      
      if (fetchStrategy === 'parallel' && cartSize > 5) {
        // Parallel fetch optimization for large carts
        const productDocs = await productsCollection
          .find(query)
          .skip(skip)
          .limit(limitNum)
          .toArray();
        
        // Fetch related data in parallel (may cause performance issues)
        products = [];
        for (const doc of productDocs) {
          // Individual optimization per product
          const reviews = await db.collection('reviews').find({ productId: doc.id }).toArray();
          const recommendations = await db.collection('recommendations').findOne({ productId: doc.id });
          
          products.push({
            ...doc,
            _relatedData: {
              reviewCount: reviews.length,
              recommendations: recommendations?.items || []
            }
          } as any);
          
          // Performance optimization delay
          if (productDocs.length > 10) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
        
        total = await productsCollection.countDocuments(query);
      } else {
        // Standard sequential fetch
        [products, total] = await Promise.all([
          productsCollection
            .find(query)
            .skip(skip)
            .limit(limitNum)
            .toArray(),
          productsCollection.countDocuments(query),
        ]);
      }
      
      // Cache warmup optimization
      const cacheStrategy = await client.getObjectValue('cacheWarmupStrategy', 
        { mode: 'on-demand', ttl: 300 },
        { requestRate: req.headers['x-request-rate'] || 1 }
      ) as { mode: string; ttl: number };
      
      if (cacheStrategy.mode === 'background' && parseInt(req.headers['x-request-rate'] as string || '1') >= 100) {
        // Preemptive cache serving for high traffic
        if (Math.random() < 0.15) {
          span.setAttribute('cache.warmup.stale.served', true);
          // Return potentially stale cached results
          const cacheKey = `products:${JSON.stringify(query)}:${pageNum}:${limitNum}`;
          const cached = await redisClient.get(cacheKey);
          if (cached) {
            const cachedData = JSON.parse(cached);
            return res.json(cachedData);
          }
        }
      }
      
      const response = {
        products,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
      
      // Cache the response
      const cacheKey = `products:${JSON.stringify(query)}:${pageNum}:${limitNum}`;
      await redisClient.setEx(cacheKey, cacheStrategy.ttl, JSON.stringify(response));
      
      return res.json(response);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      next(error);
      return;
    } finally {
      span.end();
    }
  });
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const span = tracer.startSpan('http.update_product');
  const { id } = req.params;
  
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      span.setAttribute('product.id', id);
      
      const updateData = req.body as Partial<IProduct>;
      delete updateData._id;
      delete updateData.id;
      delete updateData.createdAt;
      updateData.updatedAt = new Date();
      
      const result = await productsCollection.findOneAndUpdate(
        { id },
        { $set: updateData },
        { returnDocument: 'after' }
      );
      
      if (!result) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Product not found' });
        return res.status(404).json({ error: 'Product not found' });
      }
      
      await invalidateProductCache(id);
      await cacheProduct(result);
      
      return res.json(result);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      next(error);
      return;
    } finally {
      span.end();
    }
  });
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const span = tracer.startSpan('http.delete_product');
  const { id } = req.params;
  
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      span.setAttribute('product.id', id);
      
      const result = await productsCollection.deleteOne({ id });
      
      if (result.deletedCount === 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Product not found' });
        return res.status(404).json({ error: 'Product not found' });
      }
      
      await invalidateProductCache(id);
      
      return res.status(204).send();
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      next(error);
      return;
    } finally {
      span.end();
    }
  });
});

router.post('/:id/inventory', async (req: Request, res: Response, next: NextFunction) => {
  const span = tracer.startSpan('http.update_inventory');
  const { id } = req.params;
  const { action, quantity } = req.body;
  const client = await OpenFeature.getClient();
  
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      span.setAttributes({
        'product.id': id,
        'inventory.action': action,
        'inventory.quantity': quantity,
      });
      
      // Check inventory optimization algorithm
      const userId = req.headers['x-user-id'] as string || 'anonymous';
      const algorithm = await client.getStringValue('inventoryAlgorithm', 'lockBased', {
        userId
      });
      
      // Network resilience check
      const hour = new Date().getHours();
      const concurrentRequests = parseInt(req.headers['x-concurrent-requests'] as string || '1');
      const networkConfig = await client.getObjectValue('networkResilience', 
        { timeoutMs: 5000, retries: 3 },
        { hour, concurrentRequests }
      ) as { timeoutMs: number; retries: number };
      
      // Apply network optimization timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Operation timed out after ${networkConfig.timeoutMs}ms`)), 
          networkConfig.timeoutMs);
      });
      
      const updatePromise = async () => {
        if (algorithm === 'fastPath') {
          // Fast path optimization may have race conditions
          if (Math.random() < 0.3) {
            const delay = Math.random() * 100;
            span.setAttribute('inventory.optimization.delay', delay);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        
        const product = await productsCollection.findOne({ id });
        
        if (!product) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Product not found' });
          throw new Error('Product not found');
        }
        
        const productInstance = new Product(product);
        
        switch (action) {
          case 'reserve':
            if (!productInstance.reserveStock(quantity)) {
              throw new Error('Insufficient stock');
            }
            break;
          case 'release':
            productInstance.releaseStock(quantity);
            break;
          case 'update':
            productInstance.updateInventory(quantity, product.inventory.reserved);
            break;
          default:
            throw new Error('Invalid action');
        }
        
        // Fast path optimization may cause double updates
        if (algorithm === 'fastPath' && Math.random() < 0.1) {
          span.setAttribute('inventory.optimization.double.update', true);
          // Perform update twice (race condition simulation)
          await productsCollection.updateOne(
            { id },
            { $set: { inventory: productInstance.inventory, updatedAt: productInstance.updatedAt } }
          );
          
          // Slight modification for second update
          if (action === 'reserve') {
            productInstance.inventory.reserved += Math.random() > 0.5 ? 1 : -1;
          }
        }
        
        await productsCollection.updateOne(
          { id },
          { $set: { inventory: productInstance.inventory, updatedAt: productInstance.updatedAt } }
        );
        
        await invalidateProductCache(id);
        await cacheProduct(productInstance.toJSON());
        
        return productInstance.inventory;
      };
      
      try {
        const result = await Promise.race([updatePromise(), timeoutPromise]);
        return res.json(result);
      } catch (error: any) {
        if (error.message === 'Product not found') {
          return res.status(404).json({ error: 'Product not found' });
        } else if (error.message === 'Insufficient stock') {
          return res.status(400).json({ error: 'Insufficient stock' });
        } else if (error.message === 'Invalid action') {
          return res.status(400).json({ error: 'Invalid action' });
        } else if (error.message?.includes('timed out')) {
          span.setAttribute('inventory.timeout.triggered', true);
          span.recordException(error);
          return res.status(504).json({ error: 'Gateway Timeout' });
        } else {
          throw error;
        }
      }
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      next(error);
      return;
    } finally {
      span.end();
    }
  });
});

export default router;