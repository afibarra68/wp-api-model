import { env } from '../../config/env';
import { applyStaggeredDelays, getIntervalFromConfig } from '../../core/campaignInterval';
import { cupoDisponibleHoy } from '../../core/campaignSchedule';
import { logger } from '../../core/logger';
import { getQueue } from '../../queue';
import { buildJobFromLog } from '../../queue/emission.processor';
import type { EmissionJob } from '../../queue/queue.interface';
import * as campaignRepo from '../../repositories/campaign.repository';
import * as messageLogRepo from '../../repositories/messageLog.repository';

/** Libera el siguiente lote de mensajes pendientes respetando el tope diario de la campaùa. */
export async function releaseCampaignBatch(campaignId: string): Promise<number> {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign || campaign.estado !== 'en_progreso' || !campaign.configEnvio) return 0;

  const { cupo, resetVentana, ventanaInicio } = cupoDisponibleHoy(campaign.configEnvio);
  if (resetVentana) {
    await campaignRepo.updateCampaign(campaignId, {
      configEnvio: {
        ...campaign.configEnvio,
        ventanaInicio,
        enviadosEnVentana: 0,
      },
    });
  }
  if (cupo <= 0) return 0;

  const released = await messageLogRepo.releasePendingLogs(campaignId, cupo);
  if (released.length === 0) return 0;

  const jobs: EmissionJob[] = [];
  for (const log of released) {
    const job = await buildJobFromLog(log);
    if (job) jobs.push(job);
  }

  if (jobs.length > 0 && env.queueDriver !== 'db') {
    const { min, max } = getIntervalFromConfig(campaign.configEnvio);
    await getQueue().addBulk(applyStaggeredDelays(jobs, min, max));
  }

  await campaignRepo.incrementEnviadosEnVentana(campaignId, released.length);

  const pendientes = await messageLogRepo.countPendienteLogs(campaignId);
  await campaignRepo.updateCampaign(campaignId, {
    metricas: { pendientes },
  });

  logger.info(
    { campaignId, liberados: released.length, cupo, pendientes },
    'Lote de campaùa liberado',
  );
  return released.length;
}

/** Revisa todas las campaùas en progreso y libera lotes si hay cupo en la ventana de 24 h. */
export async function releaseAllCampaignBatches(): Promise<number> {
  const campaigns = await campaignRepo.findCampaignsInProgress();
  let total = 0;
  for (const c of campaigns) {
    total += await releaseCampaignBatch(c.id);
  }
  return total;
}
