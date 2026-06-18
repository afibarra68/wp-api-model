import IORedis, { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

let client: Redis | null = null;

/** Devuelve (creando si hace falta) la conexión Redis. Solo se usa con QUEUE_DRIVER=bullmq. */
export function getRedis(): Redis {
  if (!client) {
    client = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
    client.on('error', (err) => logger.error({ err }, 'Error de Redis'));
    client.on('connect', () => logger.info('Redis conectado'));
  }
  return client;
}

export async function redisStatus(): Promise<'up' | 'down' | 'n/a'> {
  if (env.queueDriver !== 'bullmq') return 'n/a';
  try {
    const pong = await getRedis().ping();
    return pong === 'PONG' ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
