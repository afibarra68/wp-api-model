import pg from 'pg';
import { env } from '../config/env';
import { logger } from './logger';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export async function connectPostgres(): Promise<void> {
  if (!env.databaseUrl) {
    logger.warn('DATABASE_URL no configurada — integraciones usarán variables .env');
    return;
  }
  if (pool) return;

  pool = new Pool({
    connectionString: env.databaseUrl,
    ssl: env.postgresSsl ? { rejectUnauthorized: false } : undefined,
    max: env.isProd ? 10 : 5,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Error inesperado en pool de PostgreSQL');
  });

  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('PostgreSQL conectado');
  } finally {
    client.release();
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('PostgreSQL no conectado. Configure DATABASE_URL y llame connectPostgres().');
  }
  return pool;
}

export function isPostgresConnected(): boolean {
  return pool !== null;
}

export async function disconnectPostgres(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function postgresStatus(): Promise<'up' | 'down' | 'disabled'> {
  if (!env.databaseUrl) return 'disabled';
  if (!pool) return 'down';
  try {
    await pool.query('SELECT 1');
    return 'up';
  } catch {
    return 'down';
  }
}
