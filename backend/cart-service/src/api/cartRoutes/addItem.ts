import { Response, NextFunction } from 'express';
import { RedisClientType } from 'redis';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { Cart, CartItem, AddToCartDTO } from '../../models/Cart';
import { config } from '../../config';
import { AuthRequest, getCartKey, toCartResponseDTO } from './helpers';

export function createAddItemHandler(cache: RedisClientType<any, any, any>) {
  const tracer = trace.getTracer('cart-service-routes-tracer');

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const span = tracer.startSpan('POST /cart/items');
    
    try {
      const userId = req.user?.userId;
      if (!userId) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Unauthorized' });
        span.end();
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const itemData = req.body as AddToCartDTO;
      
      if (!itemData.productId || !itemData.name || itemData.price === undefined || !itemData.quantity) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid item data' });
        span.end();
        res.status(400).json({ error: 'Product ID, name, price, and quantity are required' });
        return;
      }

      span.setAttribute('userId', userId);
      span.setAttribute('productId', itemData.productId);
      span.setAttribute('quantity', itemData.quantity);

      const cartKey = getCartKey(userId);
      const cartData = await cache.get(cartKey);
      
      let cart: Cart;
      
      if (!cartData) {
        // Create new cart
        cart = {
          userId,
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      } else {
        cart = JSON.parse(cartData);
        cart.createdAt = new Date(cart.createdAt);
        cart.updatedAt = new Date(cart.updatedAt);
      }

      // Check if item already exists
      const existingItemIndex = cart.items.findIndex(item => item.productId === itemData.productId);
      
      if (existingItemIndex >= 0) {
        // Update quantity
        cart.items[existingItemIndex].quantity += itemData.quantity;
      } else {
        // Add new item
        const newItem: CartItem = {
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
      await cache.set(cartKey, JSON.stringify(cart), { EX: config.cart.ttl });

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      res.status(200).json(toCartResponseDTO(cart));
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      span.end();
      next(error);
    }
  };
}