import { createClient, RedisClientType } from 'redis';
import { config } from '../config';

let redisClient: RedisClientType | null = null;

export async function initializeRedis(): Promise<void> {
  redisClient = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
    },
    password: config.redis.password,
    database: config.redis.db,
  });
  
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
  
  await redisClient.connect();
  console.log('Redis connected successfully');
}

export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

export async function getCachedData(key: string): Promise<any> {
  try {
    if (!redisClient?.isOpen) return null;
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error('Cache get error:', error);
  }
  return null;
}

export async function setCachedData(key: string, data: any, ttl: number): Promise<void> {
  try {
    if (!redisClient?.isOpen) return;
    await redisClient.setEx(key, ttl, JSON.stringify(data));
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

export async function invalidateListCache(keyPrefix: string): Promise<void> {
  try {
    if (!redisClient?.isOpen) return;
    const keys = await redisClient.keys(`${keyPrefix}list:*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}