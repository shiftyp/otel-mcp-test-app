import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { trace, SpanStatusCode, context } from '@opentelemetry/api';
import { User, UserResponseDTO } from '../../models/User';

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h';

interface LoginResponseDTO {
  token: string;
  user: UserResponseDTO;
}

export function createRegisterHandler(db: Pool) {
  const tracer = trace.getTracer('user-service-routes-tracer');

  return async (req: Request, res: Response, next: NextFunction) => {
    // The express instrumentation should have already created a span for this request
    // We create a child span for our business logic
    const span = tracer.startSpan('register-user-logic');
    try {
      const { username, email, password, firstName, lastName } = req.body;

      // Validation span
      const ctx = trace.setSpan(context.active(), span);
      const validationSpan = tracer.startSpan('validate-registration-input', undefined, ctx);
      try {
        if (!username || !email || !password) {
          validationSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing required fields' });
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing required fields' });
          span.end();
          return res.status(400).json({ error: 'Username, email, and password are required' });
        }
        validationSpan.setAttribute('username.length', username.length);
        validationSpan.setAttribute('email.valid', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
        validationSpan.setStatus({ code: SpanStatusCode.OK });
      } finally {
        validationSpan.end();
      }

      // Check if user already exists
      const checkUserSpan = tracer.startSpan('check-existing-user', undefined, ctx);
      try {
        const existingUserQuery = 'SELECT id FROM users WHERE username = $1 OR email = $2';
        const existingUserResult = await db.query(existingUserQuery, [username, email]);
        
        checkUserSpan.setAttribute('user.exists', existingUserResult.rows.length > 0);
        
        if (existingUserResult.rows.length > 0) {
          checkUserSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'User already exists' });
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'User already exists' });
          span.end();
          return res.status(409).json({ error: 'Username or email already exists' });
        }
        checkUserSpan.setStatus({ code: SpanStatusCode.OK });
      } finally {
        checkUserSpan.end();
      }

      // Hash password
      const hashPasswordSpan = tracer.startSpan('hash-password', undefined, ctx);
      let passwordHash: string;
      try {
        passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        hashPasswordSpan.setAttribute('bcrypt.rounds', SALT_ROUNDS);
        hashPasswordSpan.setStatus({ code: SpanStatusCode.OK });
      } finally {
        hashPasswordSpan.end();
      }
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

      // Named parameters for clarity and maintainability
      const params = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        password_hash: newUser.passwordHash,
        first_name: newUser.firstName,
        last_name: newUser.lastName,
        created_at: newUser.createdAt,
        updated_at: newUser.updatedAt
      };

      const query = 
        'INSERT INTO users (id, username, email, password_hash, first_name, last_name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *';
      
      // Convert named params to array for pg
      const paramArray = [
        params.id,
        params.username,
        params.email,
        params.password_hash,
        params.first_name,
        params.last_name,
        params.created_at,
        params.updated_at
      ];

      // Insert user into database
      const insertUserSpan = tracer.startSpan('insert-user-to-database', undefined, ctx);
      let dbUser: any;
      try {
        insertUserSpan.setAttribute('db.operation', 'INSERT');
        insertUserSpan.setAttribute('db.table', 'users');
        const result = await db.query(query, paramArray);
        dbUser = result.rows[0];
        insertUserSpan.setAttribute('user.id', dbUser.id);
        insertUserSpan.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        insertUserSpan.recordException(error as Error);
        insertUserSpan.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        insertUserSpan.end();
      }

      // Generate JWT token for immediate login
      const generateTokenSpan = tracer.startSpan('generate-jwt-token', undefined, ctx);
      let token: string;
      try {
        token = jwt.sign(
          { 
            userId: dbUser.id, 
            username: dbUser.username,
            email: dbUser.email 
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
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        firstName: dbUser.first_name,
        lastName: dbUser.last_name,
        createdAt: new Date(dbUser.created_at).toISOString(),
        updatedAt: new Date(dbUser.updated_at).toISOString(),
      };
      
      span.setAttribute('userId', dbUser.id);
      span.setStatus({ code: SpanStatusCode.OK });
      
      const response: LoginResponseDTO = {
        token,
        user: responseUser
      };
      
      res.status(201).json(response);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      next(error);
    } finally {
      span.end();
    }
  };
}