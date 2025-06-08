import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../../services/redis';

export const checkConnections = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  const redisClient = getRedisClient();
  if (!redisClient?.isOpen) {
    res.status(503).json({ error: 'Service temporarily unavailable' });
    return;
  }
  next();
};