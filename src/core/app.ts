import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from '../config/env';
import { logger } from './logger';
import { postgresStatus } from './postgres';
import { getIntegrationSettings } from '../modules/integrations/integration.config';
import { redisStatus } from './redis';
import { errorHandler, notFoundHandler } from './errors';
import { apiLimiter } from '../middlewares/rateLimit';
import apiRoutes from '../routes';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.length ? env.corsOrigins : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(pinoHttp({ logger }));

  app.get('/health', async (_req, res) => {
    const integration = getIntegrationSettings();
    const pg = await postgresStatus();
    res.json({
      status: pg === 'up' ? 'ok' : 'degraded',
      provider: integration.provider,
      integration: integration.name,
      db: pg,
      postgres: pg,
      redis: await redisStatus(),
      uptime: process.uptime(),
    });
  });

  app.use('/api/v1', apiLimiter, apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
