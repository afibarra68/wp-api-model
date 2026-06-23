import fs from 'node:fs';
import pg from 'pg';
import { env } from '../config/env';
import { resolveMigrationPaths } from '../config/db-migrations';
import { logger } from './logger';

const { Pool } = pg;

let pool: pg.Pool | null = null;

/** Quita sslmode de la URL; el SSL se configura vía Pool.ssl. */
function normalizeDatabaseUrl(databaseUrl: string, useSsl: boolean): string {
  if (!useSsl) return databaseUrl;
  try {
    const parsed = new URL(databaseUrl);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    return databaseUrl
      .replace(/([?&])sslmode=[^&]*/g, '$1')
      .replace(/([?&])ssl=[^&]*/g, '$1')
      .replace(/[?&]$/, '');
  }
}

function buildSslConfig(): pg.ConnectionConfig['ssl'] {
  if (!env.postgresSsl) return undefined;
  if (env.postgresCaCert) {
    return { ca: env.postgresCaCert, rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

export async function connectPostgres(): Promise<void> {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL es obligatorio. Configure PostgreSQL.');
  }
  if (pool) return;

  pool = new Pool({
    connectionString: normalizeDatabaseUrl(env.databaseUrl, env.postgresSsl),
    ssl: buildSslConfig(),
    max: env.isProd ? 10 : 5,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Error inesperado en pool de PostgreSQL');
  });

  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('PostgreSQL conectado');
    await ensureSchema();
    await runMigrations();
  } finally {
    client.release();
  }
}

/** Ejecuta sql/setup.sql si integration_configs no existe (App Platform / primer deploy). */
async function ensureSchema(): Promise<void> {
  if (!pool) return;
  const { rows } = await pool.query<{ ok: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'integration_configs'
    ) AS ok
  `);
  if (rows[0]?.ok) return;

  const candidates = [
    path.join(process.cwd(), 'sql/setup.sql'),
    path.join(__dirname, '../../sql/setup.sql'),
    path.join(__dirname, '../../../sql/setup.sql'),
  ];
  const sqlPath = candidates.find((p) => fs.existsSync(p));
  if (!sqlPath) {
    logger.warn('sql/setup.sql no encontrado — ejecute npm run db:setup manualmente');
    return;
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  logger.info({ sqlPath }, 'Schema PostgreSQL aplicado (setup.sql)');
}

/** Migraciones incrementales idempotentes (solo agregan lo que falta). */
async function runMigrations(): Promise<void> {
  if (!pool) return;

  const { rows } = await pool.query<{ ok: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'templates'
    ) AS ok
  `);
  if (!rows[0]?.ok) return;

  for (const sqlPath of resolveMigrationPaths()) {
    await pool.query(fs.readFileSync(sqlPath, 'utf8'));
    logger.info({ sqlPath }, 'Migración PostgreSQL verificada');
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
