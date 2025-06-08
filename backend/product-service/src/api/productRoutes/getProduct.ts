import { Request, Response } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { pool } from '../../db';
import { config } from '../../config';
import { getCachedData, setCachedData } from '../../services/redis';
import { convertDbRowToProduct } from './helpers';

const tracer = trace.getTracer('product-service');

export async function getProduct(req: Request, res: Response): Promise<void> {
  const span = tracer.startSpan('GET /api/products/:id');
  
  try {
    const { id } = req.params;
    span.setAttributes({ 'product.id': id });
    
    // Check cache first
    const cacheKey = `${config.redis.keyPrefix}${id}`;
    const cached = await getCachedData(cacheKey);
    
    if (cached) {
      span.setAttributes({ 'cache.hit': true });
      res.json(cached);
      return;
    }
    
    const query = 'SELECT * FROM products WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Product not found' });
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    
    const product = convertDbRowToProduct(result.rows[0]);
    
    // Cache the product
    await setCachedData(cacheKey, product, config.redis.ttl.product);
    
    span.setAttributes({ 'cache.hit': false });
    res.json(product);
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    span.end();
  }
}