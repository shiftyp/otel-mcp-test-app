import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { trace, SpanStatusCode } from '@opentelemetry/api';

export function createDeleteUserHandler(db: Pool, cache: RedisClientType) {
  const tracer = trace.getTracer('user-service-routes-tracer');

  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.id;
    const span = tracer.startSpan('DELETE /users/:id');
    span.setAttribute('userId', userId);

    try {
      const query = 'DELETE FROM users WHERE id = $1 RETURNING id';
      const result = await db.query(query, [userId]);

      if (result.rows.length === 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'User not found' });
        return res.status(404).json({ error: 'User not found' });
      }

      // Remove from cache
      await cache.del(`user:${userId}`);
      
      span.setStatus({ code: SpanStatusCode.OK });
      res.status(204).send();
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      next(error);
    } finally {
      span.end();
    }
  };
}