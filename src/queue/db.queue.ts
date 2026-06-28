import { env } from '../config/env';
import { logger } from '../core/logger';
import * as messageLogRepo from '../repositories/messageLog.repository';
import { buildJobFromLog, processEmissionJob } from './emission.processor';
import { EmissionJob, JobProcessor, MessageQueue } from './queue.interface';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cola respaldada por PostgreSQL (message_logs en estado "encolado").
 * Pensada para Vercel/serverless: el cron procesa lotes periódicamente.
 */
export class DbQueue implements MessageQueue {
  readonly name = 'db';
  private processor: JobProcessor = processEmissionJob;
  private paused = false;
  private readonly intervalMs: number;

  constructor() {
    const rate = Math.max(1, env.sendRatePerSecond);
    this.intervalMs = Math.floor(1000 / rate);
  }

  process(processor: JobProcessor): void {
    this.processor = processor;
  }

  async add(_job: EmissionJob): Promise<void> {}

  async addBulk(_jobs: EmissionJob[]): Promise<void> {}

  async pause(): Promise<void> {
    this.paused = true;
  }

  async resume(): Promise<void> {
    this.paused = false;
  }

  async close(): Promise<void> {}

  async runBatch(maxJobs: number): Promise<number> {
    if (this.paused) return 0;

    const logs = await messageLogRepo.findQueuedLogs(maxJobs);

    let processed = 0;
    for (const log of logs) {
      const job = await buildJobFromLog(log);
      if (!job) {
        logger.warn({ logId: log.id }, 'No se pudo reconstruir job de emisión');
        continue;
      }
      await this.processor(job);
      processed++;
      if (this.intervalMs > 0) await sleep(this.intervalMs);
    }
    return processed;
  }
}
