import { env } from './config/env';
import { logger } from './core/logger';
import { disconnectDb } from './core/db';
import { disconnectPostgres } from './core/postgres';
import { closeRedis } from './core/redis';
import { bootstrapApp } from './bootstrap';
import { getQueue } from './queue';
import { getIntegrationSettings } from './modules/integrations/integration.config';

async function bootstrap(): Promise<void> {
  const app = await bootstrapApp();
  const integration = getIntegrationSettings();

  const server = app.listen(env.port, () => {
    logger.info(
      {
        port: env.port,
        provider: integration.provider,
        integration: integration.name,
        db: env.dbDriver,
        queue: env.queueDriver,
      },
      `API escuchando en http://localhost:${env.port}`,
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Apagando...');
    server.close();
    await getQueue().close();
    await closeRedis();
    await disconnectPostgres();
    await disconnectDb();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fallo al iniciar el servidor');
  process.exit(1);
});
