import { Request, Response } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { pool } from '../../db';
import { config } from '../../config';
import { getRedisClient, invalidateListCache } from '../../services/redis';

const tracer = trace.getTracer('product-service');

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  const span = tracer.startSpan('DELETE /api/products/:id');
  
  try {
    const { id } = req.params;
    span.setAttributes({ 'product.id': id });
    
    const query = 'DELETE FROM products WHERE id = $1 RETURNING id';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Product not found' });
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    
    // Invalidate caches
    const redisClient = getRedisClient();
    if (redisClient?.isOpen) {
      await redisClient.del(`${config.redis.keyPrefix}${id}`);
    }
    await invalidateListCache(config.redis.keyPrefix);
    
    res.status(204).send();
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    span.end();
  }
}