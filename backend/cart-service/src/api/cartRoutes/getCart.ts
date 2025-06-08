import { Response, NextFunction } from 'express';
import { RedisClientType } from 'redis';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { Cart } from '../../models/Cart';
import { AuthRequest, getCartKey, toCartResponseDTO } from './helpers';

export function createGetCartHandler(cache: RedisClientType<any, any, any>) {
  const tracer = trace.getTracer('cart-service-routes-tracer');

  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const span = tracer.startSpan('GET /cart');
    
    try {
      const userId = req.user?.userId;
      if (!userId) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Unauthorized' });
        span.end();
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      span.setAttribute('userId', userId);

      const cartKey = getCartKey(userId);
      const cartData = await cache.get(cartKey);

      if (!cartData) {
        // Return empty cart
        const emptyCart: Cart = {
          userId,
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        res.status(200).json(toCartResponseDTO(emptyCart));
        return;
      } else {
        const cart: Cart = JSON.parse(cartData);
        cart.createdAt = new Date(cart.createdAt);
        cart.updatedAt = new Date(cart.updatedAt);

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        res.status(200).json(toCartResponseDTO(cart));
        return;
      }
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      span.end();
      next(error);
    }
  };
}