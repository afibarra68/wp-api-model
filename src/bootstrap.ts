import type { Express } from 'express';
import { env } from './config/env';
import { connectPostgres } from './core/postgres';
import { createApp } from './core/app';
import { startDispatcher } from './queue/dispatcher';
import { seedAdmin } from './seed/seedAdmin';
import { seedMockups } from './seed/seedMockups';
import { loadIntegrationSettings } from './modules/integrations/integration.config';
import { seedIntegrationFromEnv, syncIntegrationSecretsFromEnv } from './modules/integrations/integration.service';

let appInstance: Express | null = null;

/** Inicializa PostgreSQL, seed y app Express (sin listen). */
export async function bootstrapApp(): Promise<Express> {
  if (appInstance) return appInstance;

  await connectPostgres();
  await seedIntegrationFromEnv();
  await syncIntegrationSecretsFromEnv();
  await loadIntegrationSettings();

  await seedAdmin();
  if (env.seedMockups) await seedMockups();

  if (env.queueDriver !== 'db') {
    startDispatcher();
  }

  appInstance = createApp();
  return appInstance;
}
