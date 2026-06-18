import type { Express } from 'express';
import { env } from './config/env';
import { connectDb } from './core/db';
import { connectPostgres } from './core/postgres';
import { createApp } from './core/app';
import { startDispatcher } from './queue/dispatcher';
import { seedAdmin } from './seed/seedAdmin';
import { seedMockups } from './seed/seedMockups';
import { loadIntegrationSettings } from './modules/integrations/integration.config';
import { seedIntegrationFromEnv } from './modules/integrations/integration.service';

let appInstance: Express | null = null;

/** Inicializa DB, seed y app Express (sin listen). Reutilizable en Vercel y local. */
export async function bootstrapApp(): Promise<Express> {
  if (appInstance) return appInstance;

  await connectPostgres();
  await seedIntegrationFromEnv();
  await loadIntegrationSettings();

  await connectDb();
  await seedAdmin();
  if (env.seedMockups) await seedMockups();

  if (env.queueDriver !== 'db') {
    startDispatcher();
  }

  appInstance = createApp();
  return appInstance;
}
