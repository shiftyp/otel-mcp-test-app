import { Request, Response } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { pool } from '../../db';
import { config } from '../../config';
import { getRedisClient, invalidateListCache } from '../../services/redis';
import { convertDbRowToProduct } from './helpers';

const tracer = trace.getTracer('product-service');

export async function updateProduct(req: Request, res: Response): Promise<void> {
  const span = tracer.startSpan('PUT /api/products/:id');
  
  try {
    const { id } = req.params;
    const updates = req.body;
    updates.updatedAt = new Date();
    
    span.setAttributes({ 'product.id': id });
    
    // Build dynamic update query
    const setClause: string[] = [];
    const params: any[] = [];
    let paramCount = 0;
    
    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      price: 'price',
      currency: 'currency',
      category: 'category',
      subcategory: 'subcategory',
      brand: 'brand',
      sku: 'sku',
      images: 'images',
      specifications: 'specifications',
      tags: 'tags',
      isActive: 'is_active',
      isFeatured: 'is_featured',
    };
    
    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key] !== undefined) {
        setClause.push(`${dbField} = $${++paramCount}`);
        if (key === 'images' || key === 'specifications' || key === 'weight' || key === 'dimensions') {
          params.push(JSON.stringify(updates[key]));
        } else {
          params.push(updates[key]);
        }
      }
    }
    
    if (updates.inventory) {
      if (updates.inventory.quantity !== undefined) {
        setClause.push(`inventory_quantity = $${++paramCount}`);
        params.push(updates.inventory.quantity);
      }
      if (updates.inventory.reserved !== undefined) {
        setClause.push(`inventory_reserved = $${++paramCount}`);
        params.push(updates.inventory.reserved);
      }
    }
    
    setClause.push(`updated_at = $${++paramCount}`);
    params.push(updates.updatedAt);
    
    params.push(id);
    
    const query = `
      UPDATE products 
      SET ${setClause.join(', ')}
      WHERE id = $${++paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Product not found' });
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    
    const updatedProduct = convertDbRowToProduct(result.rows[0]);
    
    // Invalidate caches
    const redisClient = getRedisClient();
    if (redisClient?.isOpen) {
      await redisClient.del(`${config.redis.keyPrefix}${id}`);
    }
    await invalidateListCache(config.redis.keyPrefix);
    
    res.json(updatedProduct);
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    span.end();
  }
}