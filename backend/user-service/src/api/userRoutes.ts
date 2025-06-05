import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid'; // For generating user IDs
import * as otelApi from '@opentelemetry/api';
import { User, CreateUserDTO, UserResponseDTO } from '../models/User';

const router = Router();
const SALT_ROUNDS = 10;

export default function userRoutes(db: Pool, cache: RedisClientType) {
  const tracer = otelApi.trace.getTracer('user-service-routes-tracer');

  // Create a new user
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    const span = tracer.startSpan('POST /users');
    try {
      const { username, email, password_plaintext, firstName, lastName } = req.body as CreateUserDTO;

      if (!username || !email || !password_plaintext) {
        span.setStatus({ code: otelApi.SpanStatusCode.ERROR, message: 'Missing required fields' });
        span.end();
        return res.status(400).json({ error: 'Username, email, and password are required' });
      }

      const passwordHash = await bcrypt.hash(password_plaintext, SALT_ROUNDS);
      const userId = uuidv4();
      const now = new Date();

      const newUser: User = {
        id: userId,
        username,
        email,
        passwordHash,
        firstName,
        lastName,
        createdAt: now,
        updatedAt: now,
      };

      const query = 
        'INSERT INTO users (id, username, email, password_hash, first_name, last_name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *';
      const values = [
        newUser.id,
        newUser.username,
        newUser.email,
        newUser.passwordHash,
        newUser.firstName,
        newUser.lastName,
        newUser.createdAt,
        newUser.updatedAt,
      ];

      const result = await db.query(query, values);
      const dbUser = result.rows[0] as User;

      const responseUser: UserResponseDTO = {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        createdAt: dbUser.createdAt.toISOString(),
        updatedAt: dbUser.updatedAt.toISOString(),
      };
      
      span.setAttribute('userId', dbUser.id);
      span.setStatus({ code: otelApi.SpanStatusCode.OK });
      res.status(201).json(responseUser);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: otelApi.SpanStatusCode.ERROR, message: (error as Error).message });
      next(error); // Pass to global error handler
    } finally {
      span.end();
    }
  });

  // Get user by ID
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.id;
    const span = tracer.startSpan('GET /users/:id');
    span.setAttribute('userId', userId);

    try {
      // 1. Try to get from cache
      const cachedUser = await cache.get(`user:${userId}`);
      if (cachedUser) {
        span.setAttribute('cache.hit', true);
        const parsedUser: UserResponseDTO = JSON.parse(cachedUser);
        span.setStatus({ code: otelApi.SpanStatusCode.OK });
        return res.status(200).json(parsedUser);
      }
      span.setAttribute('cache.hit', false);

      // 2. If not in cache, get from DB
      const query = 'SELECT id, username, email, first_name, last_name, created_at, updated_at FROM users WHERE id = $1';
      const result = await db.query(query, [userId]);

      if (result.rows.length === 0) {
        span.setStatus({ code: otelApi.SpanStatusCode.ERROR, message: 'User not found' });
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
      
      span.setStatus({ code: otelApi.SpanStatusCode.OK });
      res.status(200).json(responseUser);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: otelApi.SpanStatusCode.ERROR, message: (error as Error).message });
      next(error);
    } finally {
      span.end();
    }
  });

  return router;
}
