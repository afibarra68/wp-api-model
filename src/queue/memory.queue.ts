import { logger } from '../core/logger';
import { sleep } from '../core/campaignInterval';
import { EmissionJob, JobProcessor, MessageQueue } from './queue.interface';

/**
 * Cola EN MEMORIA con dosificación por campaña (delayMs en cada job).
 * Ideal para desarrollo y pruebas locales.
 */
export class MemoryQueue implements MessageQueue {
  readonly name = 'memory';
  private items: EmissionJob[] = [];
  private processor: JobProcessor | null = null;
  private paused = false;
  private draining = false;

  process(processor: JobProcessor): void {
    this.processor = processor;
    this.ensureDrain();
  }

  async add(job: EmissionJob): Promise<void> {
    this.items.push(job);
    this.ensureDrain();
  }

  async addBulk(jobs: EmissionJob[]): Promise<void> {
    this.items.push(...jobs);
    this.ensureDrain();
  }

  async pause(): Promise<void> {
    this.paused = true;
  }

  async resume(): Promise<void> {
    this.paused = false;
    this.ensureDrain();
  }

  async close(): Promise<void> {
    this.items = [];
    this.draining = false;
  }

  private ensureDrain(): void {
    if (!this.draining) void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining || this.paused || !this.processor) return;
    this.draining = true;
    try {
      while (!this.paused && this.items.length > 0) {
        const job = this.items.shift()!;
        if (job.delayMs && job.delayMs > 0) await sleep(job.delayMs);
        try {
          await this.processor(job);
        } catch (err) {
          logger.error({ err, job }, 'Error procesando trabajo (memory queue)');
        }
      }
    } finally {
      this.draining = false;
      if (!this.paused && this.items.length > 0) this.ensureDrain();
    }
  }
}
