import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { UserResponseDTO } from '../../models/User';

export function createGetUserHandler(db: Pool, cache: RedisClientType) {
  const tracer = trace.getTracer('user-service-routes-tracer');

  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.id;
    const span = tracer.startSpan('GET /users/:id');
    span.setAttribute('userId', userId);

    try {
      // 1. Try to get from cache
      const cachedUser = await cache.get(`user:${userId}`);
      if (cachedUser) {
        span.setAttribute('cache.hit', true);
        const parsedUser: UserResponseDTO = JSON.parse(cachedUser);
        span.setStatus({ code: SpanStatusCode.OK });
        return res.status(200).json(parsedUser);
      }
      span.setAttribute('cache.hit', false);

      // 2. If not in cache, get from DB
      const query = 'SELECT id, username, email, first_name, last_name, created_at, updated_at FROM users WHERE id = $1';
      const result = await db.query(query, [userId]);

      if (result.rows.length === 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'User not found' });
        return res.status(404).json({ error: 'User not found' });
      }

      const dbUser = result.rows[0];
      const responseUser: UserResponseDTO = {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        firstName: dbUser.first_name, // Note: column name from DB
        lastName: dbUser.last_name,   // Note: column name from DB
        createdAt: new Date(dbUser.created_at).toISOString(),
        updatedAt: new Date(dbUser.updated_at).toISOString(),
      };

      // 3. Store in cache (e.g., for 1 hour)
      await cache.set(`user:${userId}`, JSON.stringify(responseUser), { EX: 3600 });
      
      span.setStatus({ code: SpanStatusCode.OK });
      res.status(200).json(responseUser);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      next(error);
    } finally {
      span.end();
    }
  };
}