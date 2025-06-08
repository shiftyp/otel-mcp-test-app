import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { trace, SpanStatusCode, context } from '@opentelemetry/api';
import { UserResponseDTO } from '../../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h';

interface LoginRequestDTO {
  username: string;
  password: string;
}

interface LoginResponseDTO {
  token: string;
  user: UserResponseDTO;
}

export function createLoginHandler(db: Pool, cache: RedisClientType) {
  const tracer = trace.getTracer('user-service-routes-tracer');

  return async (req: Request, res: Response, next: NextFunction) => {
    const span = tracer.startSpan('login-user-logic');
    const ctx = trace.setSpan(context.active(), span);
    
    try {
      const { username, password } = req.body as LoginRequestDTO;

      // Validate input
      const validationSpan = tracer.startSpan('validate-login-input', undefined, ctx);
      try {
        if (!username || !password) {
          validationSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing credentials' });
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing credentials' });
          span.end();
          return res.status(400).json({ error: 'Username and password are required' });
        }
        validationSpan.setAttribute('username.provided', !!username);
        validationSpan.setAttribute('password.provided', !!password);
        validationSpan.setStatus({ code: SpanStatusCode.OK });
      } finally {
        validationSpan.end();
      }

      // Find user by username
      const findUserSpan = tracer.startSpan('find-user-by-username', undefined, ctx);
      let user: any;
      try {
        findUserSpan.setAttribute('db.operation', 'SELECT');
        findUserSpan.setAttribute('db.table', 'users');
        const query = 'SELECT * FROM users WHERE username = $1';
        const result = await db.query(query, [username]);

        if (result.rows.length === 0) {
          findUserSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'User not found' });
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid credentials' });
          span.end();
          return res.status(401).json({ error: 'Invalid username or password' });
        }

        user = result.rows[0];
        findUserSpan.setAttribute('user.found', true);
        findUserSpan.setAttribute('user.id', user.id);
        findUserSpan.setStatus({ code: SpanStatusCode.OK });
      } finally {
        findUserSpan.end();
      }
      
      // Verify password
      const verifyPasswordSpan = tracer.startSpan('verify-password', undefined, ctx);
      try {
        const passwordValid = await bcrypt.compare(password, user.password_hash);
        verifyPasswordSpan.setAttribute('password.valid', passwordValid);
        
        if (!passwordValid) {
          verifyPasswordSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid password' });
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid credentials' });
          span.end();
          return res.status(401).json({ error: 'Invalid username or password' });
        }
        verifyPasswordSpan.setStatus({ code: SpanStatusCode.OK });
      } finally {
        verifyPasswordSpan.end();
      }

      // Generate JWT token
      const generateTokenSpan = tracer.startSpan('generate-jwt-token', undefined, ctx);
      let token: string;
      try {
        token = jwt.sign(
          { 
            userId: user.id, 
            username: user.username,
            email: user.email 
          },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRY }
        );
        generateTokenSpan.setAttribute('jwt.expiry', JWT_EXPIRY);
        generateTokenSpan.setAttribute('jwt.claims.count', 3);
        generateTokenSpan.setStatus({ code: SpanStatusCode.OK });
      } finally {
        generateTokenSpan.end();
      }

      const responseUser: UserResponseDTO = {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: new Date(user.created_at).toISOString(),
        updatedAt: new Date(user.updated_at).toISOString(),
      };

      // Cache the user data
      const cacheUserSpan = tracer.startSpan('cache-user-data', undefined, ctx);
      try {
        await cache.set(`user:${user.id}`, JSON.stringify(responseUser), { EX: 3600 });
        cacheUserSpan.setAttribute('cache.key', `user:${user.id}`);
        cacheUserSpan.setAttribute('cache.ttl', 3600);
        cacheUserSpan.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        // Cache failures shouldn't break login
        cacheUserSpan.recordException(error as Error);
        cacheUserSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Cache operation failed' });
      } finally {
        cacheUserSpan.end();
      }

      span.setAttribute('userId', user.id);
      span.setStatus({ code: SpanStatusCode.OK });
      
      const response: LoginResponseDTO = {
        token,
        user: responseUser
      };
      
      res.status(200).json(response);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      next(error);
    } finally {
      span.end();
    }
  };
}