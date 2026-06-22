export interface EmissionJob {
  logId: string;
  campaignId: string;
  clientId: string;
  telefono: string;
  templateId: string;
  variables: string[];
}

export type JobProcessor = (job: EmissionJob) => Promise<void>;

/** Cola de emisión con dosificación (rate limiting). */
export interface MessageQueue {
  readonly name: string;
  /** Registra el procesador que consume la cola. */
  process(processor: JobProcessor): void;
  /** Encola un trabajo. */
  add(job: EmissionJob): Promise<void>;
  /** Encola varios trabajos. */
  addBulk(jobs: EmissionJob[]): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  close(): Promise<void>;
}
