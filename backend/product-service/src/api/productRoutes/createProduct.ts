import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { pool } from '../../db';
import { config } from '../../config';
import { invalidateListCache } from '../../services/redis';
import { convertDbRowToProduct } from './helpers';

const tracer = trace.getTracer('product-service');

export async function createProduct(req: Request, res: Response): Promise<void> {
  const span = tracer.startSpan('POST /api/products');
  
  try {
    const productData = req.body;
    productData.id = productData.id || uuidv4();
    productData.createdAt = new Date();
    productData.updatedAt = new Date();
    
    span.setAttributes({
      'product.id': productData.id,
      'product.name': productData.name,
      'product.category': productData.category,
    });
    
    // Named parameters for clarity and maintainability
    const params = {
      id: productData.id,
      name: productData.name,
      description: productData.description,
      price: productData.price,
      currency: productData.currency || 'USD',
      category: productData.category,
      subcategory: productData.subcategory,
      brand: productData.brand,
      sku: productData.sku || uuidv4(),
      inventory_quantity: productData.inventory?.quantity || 0,
      inventory_reserved: productData.inventory?.reserved || 0,
      images: JSON.stringify(productData.images || []),
      specifications: JSON.stringify(productData.specifications || {}),
      tags: productData.tags || [],
      rating_average: productData.rating?.average || 0,
      rating_count: productData.rating?.count || 0,
      weight: productData.weight ? JSON.stringify(productData.weight) : null,
      dimensions: productData.dimensions ? JSON.stringify(productData.dimensions) : null,
      is_active: productData.isActive ?? true,
      is_featured: productData.isFeatured ?? false,
      created_at: productData.createdAt,
      updated_at: productData.updatedAt
    };

    const query = `
      INSERT INTO products (
        id, name, description, price, currency, category, subcategory,
        brand, sku, inventory_quantity, inventory_reserved,
        images, specifications, tags, rating_average, rating_count,
        weight, dimensions, is_active, is_featured, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      ) RETURNING *
    `;
    
    // Convert named params to array for pg
    const paramArray = [
      params.id,
      params.name,
      params.description,
      params.price,
      params.currency,
      params.category,
      params.subcategory,
      params.brand,
      params.sku,
      params.inventory_quantity,
      params.inventory_reserved,
      params.images,
      params.specifications,
      params.tags,
      params.rating_average,
      params.rating_count,
      params.weight,
      params.dimensions,
      params.is_active,
      params.is_featured,
      params.created_at,
      params.updated_at
    ];
    
    const result = await pool.query(query, paramArray);
    const newProduct = convertDbRowToProduct(result.rows[0]);
    
    // Invalidate list cache
    await invalidateListCache(config.redis.keyPrefix);
    
    res.status(201).json(newProduct);
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    span.end();
  }
}