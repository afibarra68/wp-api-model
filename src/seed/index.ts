import { connectPostgres, disconnectPostgres } from '../core/postgres';
import { env } from '../config/env';
import { logger } from '../core/logger';
import { seedAdmin } from './seedAdmin';
import { seedHelloWorldTemplate } from './seedHelloWorld';
import { seedMockups } from './seedMockups';

/** Ejecuta el seed de forma independiente: `npm run seed`. */
async function run(): Promise<void> {
  await connectPostgres();
  await seedAdmin();
  await seedHelloWorldTemplate();
  if (env.seedMockups) await seedMockups();
  await disconnectPostgres();
  logger.info('Seed completado');
}

run().catch((err) => {
  logger.error({ err }, 'Error en el seed');
  process.exit(1);
});
