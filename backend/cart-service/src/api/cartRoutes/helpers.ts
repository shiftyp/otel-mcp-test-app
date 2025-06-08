import { Cart, CartResponseDTO } from '../../models/Cart';

// Helper function to get cart key
export const getCartKey = (userId: string) => `cart:${userId}`;

// Helper function to convert cart to response DTO
export const toCartResponseDTO = (cart: Cart): CartResponseDTO => {
  const total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  
  return {
    userId: cart.userId,
    items: cart.items,
    total: Math.round(total * 100) / 100, // Round to 2 decimal places
    itemCount,
    createdAt: cart.createdAt.toISOString(),
    updatedAt: cart.updatedAt.toISOString(),
  };
};

// Extend Request to include user info from JWT middleware
import { Request } from 'express';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
    email: string;
  };
}