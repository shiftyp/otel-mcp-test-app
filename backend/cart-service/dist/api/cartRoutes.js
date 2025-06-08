"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = cartRoutes;
const express_1 = require("express");
const api_1 = require("@opentelemetry/api");
const config_1 = require("../config");
const router = (0, express_1.Router)();
function cartRoutes(cache) {
    const tracer = api_1.trace.getTracer('cart-service-routes-tracer');
    // Helper function to get cart key
    const getCartKey = (userId) => `cart:${userId}`;
    // Helper function to convert cart to response DTO
    const toCartResponseDTO = (cart) => {
        const total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        return {
            userId: cart.userId,
            items: cart.items,
            total: Math.round(total * 100) / 100, // Round to 2 decimal places
            itemCount,
            createdAt: cart.createdAt.toISOString(),
            updatedAt: cart.updatedAt.toISOString(),
        };
    };
    // Get cart for authenticated user
    router.get('/', async (req, res, next) => {
        const span = tracer.startSpan('GET /cart');
        try {
            const userId = req.user?.userId;
            if (!userId) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Unauthorized' });
                span.end();
                return res.status(401).json({ error: 'Unauthorized' });
            }
            span.setAttribute('userId', userId);
            const cartKey = getCartKey(userId);
            const cartData = await cache.get(cartKey);
            if (!cartData) {
                // Return empty cart
                const emptyCart = {
                    userId,
                    items: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                span.setStatus({ code: api_1.SpanStatusCode.OK });
                span.end();
                return res.status(200).json(toCartResponseDTO(emptyCart));
            }
            else {
                const cart = JSON.parse(cartData);
                cart.createdAt = new Date(cart.createdAt);
                cart.updatedAt = new Date(cart.updatedAt);
                span.setStatus({ code: api_1.SpanStatusCode.OK });
                span.end();
                return res.status(200).json(toCartResponseDTO(cart));
            }
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: error.message });
            span.end();
            next(error);
            return;
        }
    });
    // Add item to cart
    router.post('/items', async (req, res, next) => {
        const span = tracer.startSpan('POST /cart/items');
        try {
            const userId = req.user?.userId;
            if (!userId) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Unauthorized' });
                span.end();
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const itemData = req.body;
            if (!itemData.productId || !itemData.name || itemData.price === undefined || !itemData.quantity) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Invalid item data' });
                span.end();
                return res.status(400).json({ error: 'Product ID, name, price, and quantity are required' });
            }
            span.setAttribute('userId', userId);
            span.setAttribute('productId', itemData.productId);
            span.setAttribute('quantity', itemData.quantity);
            const cartKey = getCartKey(userId);
            const cartData = await cache.get(cartKey);
            let cart;
            if (!cartData) {
                // Create new cart
                cart = {
                    userId,
                    items: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
            }
            else {
                cart = JSON.parse(cartData);
                cart.createdAt = new Date(cart.createdAt);
                cart.updatedAt = new Date(cart.updatedAt);
            }
            // Check if item already exists
            const existingItemIndex = cart.items.findIndex(item => item.productId === itemData.productId);
            if (existingItemIndex >= 0) {
                // Update quantity
                cart.items[existingItemIndex].quantity += itemData.quantity;
            }
            else {
                // Add new item
                const newItem = {
                    productId: itemData.productId,
                    name: itemData.name,
                    price: itemData.price,
                    quantity: itemData.quantity,
                    imageUrl: itemData.imageUrl,
                };
                cart.items.push(newItem);
            }
            cart.updatedAt = new Date();
            // Save to Redis with TTL
            await cache.set(cartKey, JSON.stringify(cart), { EX: config_1.config.cart.ttl });
            span.setStatus({ code: api_1.SpanStatusCode.OK });
            span.end();
            return res.status(200).json(toCartResponseDTO(cart));
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: error.message });
            span.end();
            next(error);
            return;
        }
    });
    // Update cart item quantity
    router.put('/items/:productId', async (req, res, next) => {
        const span = tracer.startSpan('PUT /cart/items/:productId');
        try {
            const userId = req.user?.userId;
            if (!userId) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Unauthorized' });
                span.end();
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const productId = req.params.productId;
            const { quantity } = req.body;
            if (quantity === undefined || quantity < 0) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Invalid quantity' });
                span.end();
                return res.status(400).json({ error: 'Valid quantity is required' });
            }
            span.setAttribute('userId', userId);
            span.setAttribute('productId', productId);
            span.setAttribute('quantity', quantity);
            const cartKey = getCartKey(userId);
            const cartData = await cache.get(cartKey);
            if (!cartData) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Cart not found' });
                span.end();
                return res.status(404).json({ error: 'Cart not found' });
            }
            const cart = JSON.parse(cartData);
            cart.createdAt = new Date(cart.createdAt);
            cart.updatedAt = new Date(cart.updatedAt);
            const itemIndex = cart.items.findIndex(item => item.productId === productId);
            if (itemIndex < 0) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Item not found' });
                span.end();
                return res.status(404).json({ error: 'Item not found in cart' });
            }
            if (quantity === 0) {
                // Remove item
                cart.items.splice(itemIndex, 1);
            }
            else {
                // Update quantity
                cart.items[itemIndex].quantity = quantity;
            }
            cart.updatedAt = new Date();
            // Save to Redis
            await cache.set(cartKey, JSON.stringify(cart), { EX: config_1.config.cart.ttl });
            span.setStatus({ code: api_1.SpanStatusCode.OK });
            span.end();
            return res.status(200).json(toCartResponseDTO(cart));
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: error.message });
            span.end();
            next(error);
            return;
        }
    });
    // Remove item from cart
    router.delete('/items/:productId', async (req, res, next) => {
        const span = tracer.startSpan('DELETE /cart/items/:productId');
        try {
            const userId = req.user?.userId;
            if (!userId) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Unauthorized' });
                span.end();
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const productId = req.params.productId;
            span.setAttribute('userId', userId);
            span.setAttribute('productId', productId);
            const cartKey = getCartKey(userId);
            const cartData = await cache.get(cartKey);
            if (!cartData) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Cart not found' });
                span.end();
                return res.status(404).json({ error: 'Cart not found' });
            }
            const cart = JSON.parse(cartData);
            cart.createdAt = new Date(cart.createdAt);
            cart.updatedAt = new Date(cart.updatedAt);
            const itemIndex = cart.items.findIndex(item => item.productId === productId);
            if (itemIndex < 0) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Item not found' });
                span.end();
                return res.status(404).json({ error: 'Item not found in cart' });
            }
            cart.items.splice(itemIndex, 1);
            cart.updatedAt = new Date();
            // Save to Redis
            await cache.set(cartKey, JSON.stringify(cart), { EX: config_1.config.cart.ttl });
            span.setStatus({ code: api_1.SpanStatusCode.OK });
            span.end();
            return res.status(200).json(toCartResponseDTO(cart));
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: error.message });
            span.end();
            next(error);
            return;
        }
    });
    // Clear cart
    router.delete('/', async (req, res, next) => {
        const span = tracer.startSpan('DELETE /cart');
        try {
            const userId = req.user?.userId;
            if (!userId) {
                span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: 'Unauthorized' });
                span.end();
                return res.status(401).json({ error: 'Unauthorized' });
            }
            span.setAttribute('userId', userId);
            const cartKey = getCartKey(userId);
            await cache.del(cartKey);
            const emptyCart = {
                userId,
                items: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            span.setStatus({ code: api_1.SpanStatusCode.OK });
            span.end();
            return res.status(200).json(toCartResponseDTO(emptyCart));
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR, message: error.message });
            span.end();
            next(error);
            return;
        }
    });
    return router;
}
//# sourceMappingURL=cartRoutes.js.map