import { connectDb, disconnectDb } from '../core/db';
import { env } from '../config/env';
import { logger } from '../core/logger';
import { seedAdmin } from './seedAdmin';
import { seedMockups } from './seedMockups';

/** Ejecuta el seed de forma independiente: `npm run seed`. */
async function run(): Promise<void> {
  await connectDb();
  await seedAdmin();
  if (env.seedMockups) await seedMockups();
  await disconnectDb();
  logger.info('Seed completado');
}

run().catch((err) => {
  logger.error({ err }, 'Error en el seed');
  process.exit(1);
});
