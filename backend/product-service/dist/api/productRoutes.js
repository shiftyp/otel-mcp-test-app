"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongodb_1 = require("mongodb");
const redis_1 = require("redis");
const uuid_1 = require("uuid");
const api_1 = require("@opentelemetry/api");
const Product_1 = require("../models/Product");
const config_1 = require("../config");
const server_sdk_1 = require("@openfeature/server-sdk");
const router = (0, express_1.Router)();
const tracer = api_1.trace.getTracer('product-service');
let db;
let productsCollection;
let redisClient;
const memoryOptimization = {
    data: [],
    interval: null
};
const cacheStats = {
    staleServes: 0,
    coherencyIssues: 0
};
async function initializeConnections() {
    const mongoClient = new mongodb_1.MongoClient(config_1.config.mongodb.uri, config_1.config.mongodb.options);
    await mongoClient.connect();
    db = mongoClient.db();
    productsCollection = db.collection('products');
    await productsCollection.createIndex({ id: 1 }, { unique: true });
    await productsCollection.createIndex({ category: 1, subcategory: 1 });
    await productsCollection.createIndex({ brand: 1 });
    await productsCollection.createIndex({ tags: 1 });
    await productsCollection.createIndex({ name: 'text', description: 'text' });
    redisClient = (0, redis_1.createClient)({
        socket: {
            host: config_1.config.redis.host,
            port: config_1.config.redis.port,
        },
        password: config_1.config.redis.password,
        database: config_1.config.redis.db,
    });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
}
initializeConnections().catch(console.error);
(async () => {
    const client = await server_sdk_1.OpenFeature.getClient();
    const memoryConfig = await client.getObjectValue('memoryManagement', { gcInterval: 60000, poolSize: 'normal' }, { testType: process.env.TEST_TYPE || 'normal' });
    if (memoryConfig.poolSize === 'large' && memoryConfig.gcInterval > 60000) {
        memoryOptimization.interval = setInterval(() => {
            const optimizationData = new Array(1024).fill('x'.repeat(1024) + Date.now());
            memoryOptimization.data.push(optimizationData);
            const usage = process.memoryUsage();
            if (usage.heapUsed > 500 * 1024 * 1024) {
                memoryOptimization.data = memoryOptimization.data.slice(-100);
            }
        }, 5000);
    }
})();
async function getCachedProduct(productId) {
    const span = tracer.startSpan('cache.get_product');
    const client = await server_sdk_1.OpenFeature.getClient();
    try {
        const cached = await redisClient.get(`${config_1.config.redis.keyPrefix}${productId}`);
        if (cached) {
            span.setAttribute('cache.hit', true);
            const cacheMode = await client.getStringValue('distributedCacheMode', 'standard', {
                sessionId: Math.random().toString(36).substr(2, 9)
            });
            if (cacheMode === 'optimized') {
                if (Math.random() < 0.15) {
                    span.setAttribute('cache.optimization.stale', true);
                    cacheStats.staleServes++;
                }
            }
            return JSON.parse(cached);
        }
        span.setAttribute('cache.hit', false);
        return null;
    }
    finally {
        span.end();
    }
}
async function cacheProduct(product) {
    const span = tracer.startSpan('cache.set_product');
    const client = await server_sdk_1.OpenFeature.getClient();
    try {
        const cacheMode = await client.getStringValue('distributedCacheMode', 'standard', {
            sessionId: Math.random().toString(36).substr(2, 9)
        });
        if (cacheMode === 'optimized') {
            if (Math.random() < 0.05) {
                span.setAttribute('cache.optimization.write.skipped', true);
                cacheStats.coherencyIssues++;
                return;
            }
        }
        await redisClient.setEx(`${config_1.config.redis.keyPrefix}${product.id}`, config_1.config.redis.ttl.product, JSON.stringify(product));
    }
    finally {
        span.end();
    }
}
async function invalidateProductCache(productId) {
    const span = tracer.startSpan('cache.invalidate_product');
    try {
        await redisClient.del(`${config_1.config.redis.keyPrefix}${productId}`);
    }
    finally {
        span.end();
    }
}
router.post('/', async (req, res, next) => {
    const span = tracer.startSpan('http.post_product');
    return api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), async () => {
        try {
            const productData = req.body;
            productData.id = (0, uuid_1.v4)();
            productData.createdAt = new Date();
            productData.updatedAt = new Date();
            const product = new Product_1.Product(productData);
            span.setAttributes({
                'product.id': product.id,
                'product.category': product.category,
                'product.brand': product.brand,
            });
            await productsCollection.insertOne(product.toJSON());
            await cacheProduct(product.toJSON());
            res.status(201).json(product.toJSON());
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR });
            next(error);
            return;
        }
        finally {
            span.end();
        }
    });
});
router.get('/:id', async (req, res, next) => {
    const span = tracer.startSpan('http.get_product');
    const { id } = req.params;
    return api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), async () => {
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
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Product not found' });
                return res.status(404).json({ error: 'Product not found' });
            }
            return res.json(product);
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR });
            next(error);
            return;
        }
        finally {
            span.end();
        }
    });
});
router.get('/', async (req, res, next) => {
    const span = tracer.startSpan('http.get_products');
    const client = await server_sdk_1.OpenFeature.getClient();
    return api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), async () => {
        try {
            const { category, subcategory, brand, minPrice, maxPrice, tags, search, page = '1', limit = config_1.config.pagination.defaultLimit.toString(), } = req.query;
            const cartSize = parseInt(req.headers['x-cart-size'] || '0');
            const fetchStrategy = await client.getStringValue('dataFetchStrategy', 'sequential', {
                cartSize
            });
            const query = { isActive: true };
            if (category)
                query.category = category;
            if (subcategory)
                query.subcategory = subcategory;
            if (brand)
                query.brand = brand;
            if (tags)
                query.tags = { $in: Array.isArray(tags) ? tags : [tags] };
            if (minPrice || maxPrice) {
                query.price = {};
                if (minPrice)
                    query.price.$gte = parseFloat(minPrice);
                if (maxPrice)
                    query.price.$lte = parseFloat(maxPrice);
            }
            if (search) {
                query.$text = { $search: search };
            }
            const pageNum = parseInt(page, 10);
            const limitNum = Math.min(parseInt(limit, 10), config_1.config.pagination.maxLimit);
            const skip = (pageNum - 1) * limitNum;
            span.setAttributes({
                'products.query.category': category || 'all',
                'products.query.page': pageNum,
                'products.query.limit': limitNum,
                'products.fetch.strategy': fetchStrategy,
            });
            let products;
            let total;
            if (fetchStrategy === 'parallel' && cartSize > 5) {
                const productDocs = await productsCollection
                    .find(query)
                    .skip(skip)
                    .limit(limitNum)
                    .toArray();
                products = [];
                for (const doc of productDocs) {
                    const reviews = await db.collection('reviews').find({ productId: doc.id }).toArray();
                    const recommendations = await db.collection('recommendations').findOne({ productId: doc.id });
                    products.push({
                        ...doc,
                        _relatedData: {
                            reviewCount: reviews.length,
                            recommendations: recommendations?.items || []
                        }
                    });
                    if (productDocs.length > 10) {
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                }
                total = await productsCollection.countDocuments(query);
            }
            else {
                [products, total] = await Promise.all([
                    productsCollection
                        .find(query)
                        .skip(skip)
                        .limit(limitNum)
                        .toArray(),
                    productsCollection.countDocuments(query),
                ]);
            }
            const cacheStrategy = await client.getObjectValue('cacheWarmupStrategy', { mode: 'on-demand', ttl: 300 }, { requestRate: req.headers['x-request-rate'] || 1 });
            if (cacheStrategy.mode === 'background' && parseInt(req.headers['x-request-rate'] || '1') >= 100) {
                if (Math.random() < 0.15) {
                    span.setAttribute('cache.warmup.stale.served', true);
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
            const cacheKey = `products:${JSON.stringify(query)}:${pageNum}:${limitNum}`;
            await redisClient.setEx(cacheKey, cacheStrategy.ttl, JSON.stringify(response));
            return res.json(response);
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR });
            next(error);
            return;
        }
        finally {
            span.end();
        }
    });
});
router.put('/:id', async (req, res, next) => {
    const span = tracer.startSpan('http.update_product');
    const { id } = req.params;
    return api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), async () => {
        try {
            span.setAttribute('product.id', id);
            const updateData = req.body;
            delete updateData._id;
            delete updateData.id;
            delete updateData.createdAt;
            updateData.updatedAt = new Date();
            const result = await productsCollection.findOneAndUpdate({ id }, { $set: updateData }, { returnDocument: 'after' });
            if (!result) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Product not found' });
                return res.status(404).json({ error: 'Product not found' });
            }
            await invalidateProductCache(id);
            await cacheProduct(result);
            return res.json(result);
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR });
            next(error);
            return;
        }
        finally {
            span.end();
        }
    });
});
router.delete('/:id', async (req, res, next) => {
    const span = tracer.startSpan('http.delete_product');
    const { id } = req.params;
    return api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), async () => {
        try {
            span.setAttribute('product.id', id);
            const result = await productsCollection.deleteOne({ id });
            if (result.deletedCount === 0) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Product not found' });
                return res.status(404).json({ error: 'Product not found' });
            }
            await invalidateProductCache(id);
            return res.status(204).send();
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR });
            next(error);
            return;
        }
        finally {
            span.end();
        }
    });
});
router.post('/:id/inventory', async (req, res, next) => {
    const span = tracer.startSpan('http.update_inventory');
    const { id } = req.params;
    const { action, quantity } = req.body;
    const client = await server_sdk_1.OpenFeature.getClient();
    return api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), async () => {
        try {
            span.setAttributes({
                'product.id': id,
                'inventory.action': action,
                'inventory.quantity': quantity,
            });
            const userId = req.headers['x-user-id'] || 'anonymous';
            const algorithm = await client.getStringValue('inventoryAlgorithm', 'lockBased', {
                userId
            });
            const hour = new Date().getHours();
            const concurrentRequests = parseInt(req.headers['x-concurrent-requests'] || '1');
            const networkConfig = await client.getObjectValue('networkResilience', { timeoutMs: 5000, retries: 3 }, { hour, concurrentRequests });
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Operation timed out after ${networkConfig.timeoutMs}ms`)), networkConfig.timeoutMs);
            });
            const updatePromise = async () => {
                if (algorithm === 'fastPath') {
                    if (Math.random() < 0.3) {
                        const delay = Math.random() * 100;
                        span.setAttribute('inventory.optimization.delay', delay);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
                const product = await productsCollection.findOne({ id });
                if (!product) {
                    span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Product not found' });
                    throw new Error('Product not found');
                }
                const productInstance = new Product_1.Product(product);
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
                if (algorithm === 'fastPath' && Math.random() < 0.1) {
                    span.setAttribute('inventory.optimization.double.update', true);
                    await productsCollection.updateOne({ id }, { $set: { inventory: productInstance.inventory, updatedAt: productInstance.updatedAt } });
                    if (action === 'reserve') {
                        productInstance.inventory.reserved += Math.random() > 0.5 ? 1 : -1;
                    }
                }
                await productsCollection.updateOne({ id }, { $set: { inventory: productInstance.inventory, updatedAt: productInstance.updatedAt } });
                await invalidateProductCache(id);
                await cacheProduct(productInstance.toJSON());
                return productInstance.inventory;
            };
            try {
                const result = await Promise.race([updatePromise(), timeoutPromise]);
                return res.json(result);
            }
            catch (error) {
                if (error.message === 'Product not found') {
                    return res.status(404).json({ error: 'Product not found' });
                }
                else if (error.message === 'Insufficient stock') {
                    return res.status(400).json({ error: 'Insufficient stock' });
                }
                else if (error.message === 'Invalid action') {
                    return res.status(400).json({ error: 'Invalid action' });
                }
                else if (error.message?.includes('timed out')) {
                    span.setAttribute('inventory.timeout.triggered', true);
                    span.recordException(error);
                    return res.status(504).json({ error: 'Gateway Timeout' });
                }
                else {
                    throw error;
                }
            }
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR });
            next(error);
            return;
        }
        finally {
            span.end();
        }
    });
});
exports.default = router;
//# sourceMappingURL=productRoutes.js.map