import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { User, CreateUserDTO, UserResponseDTO } from '../../models/User';

const SALT_ROUNDS = 10;

export function createUserHandler(db: Pool) {
  const tracer = trace.getTracer('user-service-routes-tracer');

  return async (req: Request, res: Response, next: NextFunction) => {
    const span = tracer.startSpan('POST /users');
    try {
      const { username, email, password_plaintext, firstName, lastName } = req.body as CreateUserDTO;

      if (!username || !email || !password_plaintext) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing required fields' });
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
      span.setStatus({ code: SpanStatusCode.OK });
      res.status(201).json(responseUser);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      next(error); // Pass to global error handler
    } finally {
      span.end();
    }
  };
}