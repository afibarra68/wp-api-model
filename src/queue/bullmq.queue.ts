import { Queue, Worker, ConnectionOptions } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../core/logger';
import { getRedis } from '../core/redis';
import { EmissionJob, JobProcessor, MessageQueue } from './queue.interface';

const QUEUE_NAME = 'whatsapp-emision';

/**
 * Cola con BullMQ + Redis (producción). Persiste y aplica rate limiting nativo.
 */
export class BullMqQueue implements MessageQueue {
  readonly name = 'bullmq';
  private queue: Queue;
  private worker: Worker | null = null;

  constructor() {
    // Cast: bullmq trae su propia copia de ioredis; el cast evita el choque de tipos.
    const connection = getRedis() as unknown as ConnectionOptions;
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  process(processor: JobProcessor): void {
    const connection = getRedis() as unknown as ConnectionOptions;
    const rate = Math.max(1, env.sendRatePerSecond);
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        await processor(job.data as EmissionJob);
      },
      {
        connection,
        limiter: { max: 1, duration: Math.floor(1000 / rate) },
      },
    );
    this.worker.on('failed', (job, err) =>
      logger.error({ err, jobId: job?.id }, 'Trabajo BullMQ fallido'),
    );
  }

  async add(job: EmissionJob): Promise<void> {
    await this.queue.add('envio', job, {
      delay: job.delayMs ?? 0,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async addBulk(jobs: EmissionJob[]): Promise<void> {
    await this.queue.addBulk(
      jobs.map((data) => ({
        name: 'envio',
        data,
        opts: {
          delay: data.delayMs ?? 0,
          attempts: 3,
          backoff: { type: 'exponential' as const, delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      })),
    );
  }

  async pause(): Promise<void> {
    await this.queue.pause();
  }

  async resume(): Promise<void> {
    await this.queue.resume();
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
