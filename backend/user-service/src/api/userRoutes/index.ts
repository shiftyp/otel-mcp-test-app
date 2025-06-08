import { Router } from 'express';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { createLoginHandler } from './login';
import { createRegisterHandler } from './register';
import { createUserHandler } from './createUser';
import { createGetUserHandler } from './getUser';
import { createUpdateUserHandler } from './updateUser';
import { createDeleteUserHandler } from './deleteUser';

export default function userRoutes(db: Pool, cache: RedisClientType) {
  const router = Router();

  // Login endpoint
  router.post('/login', createLoginHandler(db, cache));

  // Register endpoint (updated create user endpoint)
  router.post('/register', createRegisterHandler(db));

  // Create a new user
  router.post('/', createUserHandler(db));

  // Get user by ID
  router.get('/:id', createGetUserHandler(db, cache));

  // Update user by ID
  router.put('/:id', createUpdateUserHandler(db, cache));

  // Delete user account
  router.delete('/:id', createDeleteUserHandler(db, cache));

  return router;
}