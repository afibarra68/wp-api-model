import type { CampaignConfigEnvio } from '../types/entities';
import type { EmissionJob } from '../queue/queue.interface';

const DEFAULT_MIN = 1;
const DEFAULT_MAX = 10;

export function normalizeIntervaloSeg(min?: number, max?: number): { min: number; max: number } {
  let a = min ?? DEFAULT_MIN;
  let b = max ?? DEFAULT_MAX;
  a = Math.min(10, Math.max(1, Math.floor(a)));
  b = Math.min(10, Math.max(1, Math.floor(b)));
  if (a > b) [a, b] = [b, a];
  return { min: a, max: b };
}

export function randomDelayMs(minSeg: number, maxSeg: number): number {
  if (minSeg >= maxSeg) return minSeg * 1000;
  const sec = minSeg + Math.floor(Math.random() * (maxSeg - minSeg + 1));
  return sec * 1000;
}

export function getIntervalFromConfig(
  config: CampaignConfigEnvio | null | undefined,
): { min: number; max: number } {
  if (!config) return normalizeIntervaloSeg();
  return normalizeIntervaloSeg(config.intervaloMinSeg, config.intervaloMaxSeg);
}

/** Espera aleatoria antes de cada mensaje (excepto el primero del lote). */
export function applyStaggeredDelays(
  jobs: EmissionJob[],
  minSeg: number,
  maxSeg: number,
): EmissionJob[] {
  return jobs.map((job, i) => ({
    ...job,
    delayMs: i === 0 ? 0 : randomDelayMs(minSeg, maxSeg),
  }));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
