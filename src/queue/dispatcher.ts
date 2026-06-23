import { logger } from '../core/logger';
import { getQueue } from './index';
import { processEmissionJob } from './emission.processor';
import { releaseAllCampaignBatches } from '../modules/campaigns/campaignScheduler';

const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000;

/** Registra el procesador en la cola. Llamar una vez al arrancar el servidor. */
export function startDispatcher(): void {
  getQueue().process(processEmissionJob);
  logger.info('Dispatcher de emisión registrado');

  setInterval(() => {
    void releaseAllCampaignBatches().catch((err) =>
      logger.error({ err }, 'Error liberando lotes de campaña'),
    );
  }, SCHEDULER_INTERVAL_MS);
}

export { processEmissionJob } from './emission.processor';
