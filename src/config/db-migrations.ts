import fs from 'node:fs';
import path from 'node:path';

/**
 * Migraciones SQL incrementales, en orden de aplicación.
 * Idempotentes (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, etc.).
 *
 * Usado por: arranque de la API, db:setup-local y db:migrate.
 */
export const SQL_MIGRATION_FILES = [
  'migrate-templates-components.sql',
  'migrate-conversation-messages.sql',
  'migrate-personas-pagos.sql',
  'migrate-user-approval.sql',
  'migrate-admin-mfa.sql',
] as const;

export type SqlMigrationFile = (typeof SQL_MIGRATION_FILES)[number];

/** Resuelve la carpeta sql/ (raíz del proyecto o dist compilado). */
export function resolveSqlDir(): string {
  const candidates = [
    path.join(process.cwd(), 'sql'),
    path.join(__dirname, '../../sql'),
    path.join(__dirname, '../../../sql'),
  ];
  const dir = candidates.find((d) => fs.existsSync(path.join(d, 'setup.sql')));
  if (!dir) {
    throw new Error('No se encontró carpeta sql/setup.sql');
  }
  return dir;
}

export function resolveMigrationPaths(): string[] {
  const dir = resolveSqlDir();
  return SQL_MIGRATION_FILES
    .map((file) => path.join(dir, file))
    .filter((fp) => fs.existsSync(fp));
}
