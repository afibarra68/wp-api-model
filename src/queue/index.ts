import { env } from '../config/env';
import { logger } from '../core/logger';
import { MessageQueue } from './queue.interface';
import { MemoryQueue } from './memory.queue';
import { BullMqQueue } from './bullmq.queue';
import { DbQueue } from './db.queue';

let instance: MessageQueue | null = null;

function createQueue(): MessageQueue {
  switch (env.queueDriver) {
    case 'bullmq':
      return new BullMqQueue();
    case 'db':
      return new DbQueue();
    default:
      return new MemoryQueue();
  }
}

/** Devuelve la cola según QUEUE_DRIVER (singleton). */
export function getQueue(): MessageQueue {
  if (instance) return instance;
  instance = createQueue();
  logger.info({ queue: instance.name }, 'Cola de emisión inicializada');
  return instance;
}

export * from './queue.interface';
