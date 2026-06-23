/**
 * Crea la base (si no existe) y aplica setup.sql + migraciones.
 * Uso: npm run db:setup-local
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';
import { resolveMigrationPaths, resolveSqlDir } from '../src/config/db-migrations';

dotenv.config();

const {
  POSTGRES_HOST = 'localhost',
  POSTGRES_PORT = '5432',
  POSTGRES_USER = 'admin',
  POSTGRES_PASSWORD = 'telodijecomma',
  POSTGRES_DB = 'whatsapp_control',
} = process.env;

async function ensureDatabase(): Promise<void> {
  const admin = new pg.Client({
    host: POSTGRES_HOST,
    port: Number(POSTGRES_PORT),
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    database: 'postgres',
    ssl: false,
    connectionTimeoutMillis: 10000,
  });
  await admin.connect();
  try {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      POSTGRES_DB,
    ]);
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE "${POSTGRES_DB}"`);
      console.log(`Base de datos "${POSTGRES_DB}" creada.`);
    } else {
      console.log(`Base de datos "${POSTGRES_DB}" ya existe.`);
    }
  } finally {
    await admin.end();
  }
}

async function runSqlFile(client: pg.Client, filePath: string): Promise<void> {
  const sql = fs.readFileSync(filePath, 'utf8');
  await client.query(sql);
  console.log(`OK: ${path.basename(filePath)}`);
}

async function main(): Promise<void> {
  console.log(`Conectando a ${POSTGRES_HOST}:${POSTGRES_PORT} usuario=${POSTGRES_USER} db=${POSTGRES_DB}`);

  await ensureDatabase();

  const client = new pg.Client({
    host: POSTGRES_HOST,
    port: Number(POSTGRES_PORT),
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    database: POSTGRES_DB,
    ssl: false,
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  try {
    const dir = resolveSqlDir();
    await runSqlFile(client, path.join(dir, 'setup.sql'));

    for (const fp of resolveMigrationPaths()) {
      await runSqlFile(client, fp);
    }

    console.log('\nSchema listo en', POSTGRES_DB);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error en db:setup-local:', err.message ?? err);
  process.exit(1);
});
