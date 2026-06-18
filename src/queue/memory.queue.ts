import { env } from '../config/env';
import { logger } from '../core/logger';
import { EmissionJob, JobProcessor, MessageQueue } from './queue.interface';

/**
 * Cola EN MEMORIA con dosificación (sin Redis). Ideal para desarrollo y pruebas locales.
 * Procesa SEND_RATE_PER_SECOND trabajos por segundo.
 * Nota: no persiste; si el proceso muere, los trabajos pendientes se pierden.
 */
export class MemoryQueue implements MessageQueue {
  readonly name = 'memory';
  private items: EmissionJob[] = [];
  private processor: JobProcessor | null = null;
  private paused = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;

  constructor() {
    const rate = Math.max(1, env.sendRatePerSecond);
    this.intervalMs = Math.floor(1000 / rate);
  }

  process(processor: JobProcessor): void {
    this.processor = processor;
    this.ensureLoop();
  }

  async add(job: EmissionJob): Promise<void> {
    this.items.push(job);
    this.ensureLoop();
  }

  async addBulk(jobs: EmissionJob[]): Promise<void> {
    this.items.push(...jobs);
    this.ensureLoop();
  }

  async pause(): Promise<void> {
    this.paused = true;
  }

  async resume(): Promise<void> {
    this.paused = false;
    this.ensureLoop();
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.items = [];
  }

  private ensureLoop(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  private async tick(): Promise<void> {
    if (this.paused || !this.processor) return;
    const job = this.items.shift();
    if (!job) return;
    try {
      await this.processor(job);
    } catch (err) {
      logger.error({ err, job }, 'Error procesando trabajo (memory queue)');
    }
  }
}
