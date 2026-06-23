import { getIntervalFromConfig, randomDelayMs, sleep } from '../core/campaignInterval';
import { logger } from '../core/logger';
import * as campaignRepo from '../repositories/campaign.repository';
import * as messageLogRepo from '../repositories/messageLog.repository';
import { buildJobFromLog, processEmissionJob } from './emission.processor';
import { EmissionJob, JobProcessor, MessageQueue } from './queue.interface';

/**
 * Cola respaldada por PostgreSQL (message_logs en estado "encolado").
 * Pensada para Vercel/serverless: el cron procesa lotes periódicamente.
 */
export class DbQueue implements MessageQueue {
  readonly name = 'db';
  private processor: JobProcessor = processEmissionJob;
  private paused = false;

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
      if (processed > 0) {
        const campaign = await campaignRepo.findCampaignById(log.campanaId);
        const { min, max } = getIntervalFromConfig(campaign?.configEnvio ?? null);
        await sleep(randomDelayMs(min, max));
      }
      await this.processor(job);
      processed++;
    }
    return processed;
  }
}
