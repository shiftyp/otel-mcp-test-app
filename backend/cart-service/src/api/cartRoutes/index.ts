import { Router } from 'express';
import { RedisClientType } from 'redis';
import { createGetCartHandler } from './getCart';
import { createAddItemHandler } from './addItem';
import { createUpdateItemHandler } from './updateItem';
import { createRemoveItemHandler } from './removeItem';
import { createClearCartHandler } from './clearCart';

export default function cartRoutes(cache: RedisClientType<any, any, any>) {
  const router = Router();

  // Get cart for authenticated user
  router.get('/', createGetCartHandler(cache));

  // Add item to cart
  router.post('/items', createAddItemHandler(cache));

  // Update cart item quantity
  router.put('/items/:productId', createUpdateItemHandler(cache));

  // Remove item from cart
  router.delete('/items/:productId', createRemoveItemHandler(cache));

  // Clear cart
  router.delete('/', createClearCartHandler(cache));

  return router;
}