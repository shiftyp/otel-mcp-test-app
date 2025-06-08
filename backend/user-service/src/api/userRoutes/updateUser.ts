import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { UserResponseDTO } from '../../models/User';

export function createUpdateUserHandler(db: Pool, cache: RedisClientType) {
  const tracer = trace.getTracer('user-service-routes-tracer');

  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.id;
    const span = tracer.startSpan('PUT /users/:id');
    span.setAttribute('userId', userId);

    try {
      const { firstName, lastName, email } = req.body;
      
      // Build dynamic update query
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (firstName !== undefined) {
        updateFields.push(`first_name = $${paramIndex++}`);
        values.push(firstName);
      }
      if (lastName !== undefined) {
        updateFields.push(`last_name = $${paramIndex++}`);
        values.push(lastName);
      }
      if (email !== undefined) {
        updateFields.push(`email = $${paramIndex++}`);
        values.push(email);
      }

      if (updateFields.length === 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'No fields to update' });
        return res.status(400).json({ error: 'No fields to update' });
      }

      updateFields.push(`updated_at = $${paramIndex++}`);
      values.push(new Date());
      values.push(userId);

      const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'User not found' });
        return res.status(404).json({ error: 'User not found' });
      }

      const dbUser = result.rows[0];
      const responseUser: UserResponseDTO = {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        firstName: dbUser.first_name,
        lastName: dbUser.last_name,
        createdAt: new Date(dbUser.created_at).toISOString(),
        updatedAt: new Date(dbUser.updated_at).toISOString(),
      };

      // Update cache
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