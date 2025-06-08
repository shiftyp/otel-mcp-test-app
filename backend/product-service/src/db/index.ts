import { Pool } from 'pg';
import { config } from '../config';

export const pool = new Pool(config.database);

// Test the connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Helper function to get a client from the pool
export async function getClient() {
  const client = await pool.connect();
  return client;
}

// Helper function for transactions
export async function withTransaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Initialize database connection
export async function initializeDatabase() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('PostgreSQL database connection verified');
  } catch (error) {
    console.error('Failed to connect to PostgreSQL:', error);
    throw error;
  }
}