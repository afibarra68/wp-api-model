/**
 * Aplica solo migraciones incrementales (sin setup.sql).
 * Uso: npm run db:migrate
 */
import fs from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';
import { env } from '../src/config/env';
import { resolveMigrationPaths } from '../src/config/db-migrations';

dotenv.config();

function buildSslConfig(): pg.ClientConfig['ssl'] {
  if (!env.postgresSsl) return undefined;
  if (env.postgresCaCert) {
    return { ca: env.postgresCaCert, rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

async function main(): Promise<void> {
  if (!env.databaseUrl) {
    console.error('DATABASE_URL es obligatorio.');
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: env.databaseUrl,
    ssl: buildSslConfig(),
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  try {
    const paths = resolveMigrationPaths();
    if (paths.length === 0) {
      console.error('No se encontraron archivos de migración en sql/.');
      process.exit(1);
    }

    for (const sqlPath of paths) {
      await client.query(fs.readFileSync(sqlPath, 'utf8'));
      console.log(`OK: ${sqlPath.split(/[/\\]/).pop()}`);
    }

    console.log(`\n${paths.length} migración(es) aplicada(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Error en db:migrate:', err.message ?? err);
  process.exit(1);
});
