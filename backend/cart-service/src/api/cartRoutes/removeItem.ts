import { Response, NextFunction } from 'express';
import { RedisClientType } from 'redis';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { Cart } from '../../models/Cart';
import { config } from '../../config';
import { AuthRequest, getCartKey, toCartResponseDTO } from './helpers';

export function createRemoveItemHandler(cache: RedisClientType<any, any, any>) {
  const tracer = trace.getTracer('cart-service-routes-tracer');

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const span = tracer.startSpan('DELETE /cart/items/:productId');
    
    try {
      const userId = req.user?.userId;
      if (!userId) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Unauthorized' });
        span.end();
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const productId = req.params.productId;

      span.setAttribute('userId', userId);
      span.setAttribute('productId', productId);

      const cartKey = getCartKey(userId);
      const cartData = await cache.get(cartKey);

      if (!cartData) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Cart not found' });
        span.end();
        res.status(404).json({ error: 'Cart not found' });
        return;
      }

      const cart: Cart = JSON.parse(cartData);
      cart.createdAt = new Date(cart.createdAt);
      cart.updatedAt = new Date(cart.updatedAt);

      const itemIndex = cart.items.findIndex(item => item.productId === productId);
      
      if (itemIndex < 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Item not found' });
        span.end();
        res.status(404).json({ error: 'Item not found in cart' });
        return;
      }

      cart.items.splice(itemIndex, 1);
      cart.updatedAt = new Date();

      // Save to Redis
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