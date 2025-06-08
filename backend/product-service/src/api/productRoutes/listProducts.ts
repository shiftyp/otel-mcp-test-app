import { Request, Response } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { pool } from '../../db';
import { config } from '../../config';
import { getCachedData, setCachedData } from '../../services/redis';
import { convertDbRowToProduct } from './helpers';

const tracer = trace.getTracer('product-service');

export async function listProducts(req: Request, res: Response): Promise<void> {
  const span = tracer.startSpan('GET /api/products');
  
  try {
    const {
      category,
      subcategory,
      brand,
      minPrice,
      maxPrice,
      tags,
      search,
      sort = 'name',
      page = 1,
      limit = config.pagination.defaultLimit,
    } = req.query;
    
    span.setAttributes({
      'product.category': category as string || '',
      'product.search': search as string || '',
      'pagination.page': Number(page),
      'pagination.limit': Number(limit),
    });
    
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(config.pagination.maxLimit, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;
    
    // Build query
    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let paramCount = 0;
    
    if (category) {
      conditions.push(`category = $${++paramCount}`);
      params.push(category);
    }
    
    if (subcategory) {
      conditions.push(`subcategory = $${++paramCount}`);
      params.push(subcategory);
    }
    
    if (brand) {
      conditions.push(`brand = $${++paramCount}`);
      params.push(brand);
    }
    
    if (minPrice) {
      conditions.push(`price >= $${++paramCount}`);
      params.push(parseFloat(minPrice as string));
    }
    
    if (maxPrice) {
      conditions.push(`price <= $${++paramCount}`);
      params.push(parseFloat(maxPrice as string));
    }
    
    if (tags && Array.isArray(tags)) {
      conditions.push(`tags && $${++paramCount}`);
      params.push(tags);
    }
    
    if (search) {
      conditions.push(`(name ILIKE $${++paramCount} OR description ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }
    
    // Always filter active products
    conditions.push('is_active = true');
    
    const whereClause = conditions.join(' AND ');
    
    // Sort mapping
    const sortMap: Record<string, string> = {
      name: 'name ASC',
      '-name': 'name DESC',
      price: 'price ASC',
      '-price': 'price DESC',
      createdAt: 'created_at DESC',
      '-createdAt': 'created_at ASC',
    };
    
    const orderBy = sortMap[sort as string] || 'name ASC';
    
    // Check cache first
    const cacheKey = `${config.redis.keyPrefix}list:${JSON.stringify({ ...req.query, whereClause })}`;
    const cached = await getCachedData(cacheKey);
    
    if (cached) {
      span.setAttributes({ 'cache.hit': true });
      res.json(cached);
      return;
    }
    
    // Count total matching products
    const countQuery = `SELECT COUNT(*) FROM products WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count, 10);
    
    // Fetch products
    const query = `
      SELECT * FROM products 
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;
    params.push(limitNum, offset);
    
    const result = await pool.query(query, params);
    const products = result.rows.map(row => convertDbRowToProduct(row));
    
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
    await setCachedData(cacheKey, response, config.redis.ttl.productList);
    
    span.setAttributes({
      'product.count': products.length,
      'pagination.total': total,
      'cache.hit': false,
    });
    
    res.json(response);
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    span.end();
  }
}