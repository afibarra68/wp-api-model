import { logger } from '../core/logger';
import { templateSendOptions } from '../core/templateSend';
import * as campaignRepo from '../repositories/campaign.repository';
import * as clientRepo from '../repositories/client.repository';
import * as templateRepo from '../repositories/template.repository';
import * as messageLogRepo from '../repositories/messageLog.repository';
import { getProvider } from '../providers';
import { resolveVariables } from '../modules/campaigns/campaigns.service';
import { EmissionJob } from './queue.interface';

export async function processEmissionJob(job: EmissionJob): Promise<void> {
  const provider = getProvider();
  const template = await templateRepo.findTemplateById(job.templateId);
  if (!template) {
    logger.error({ templateId: job.templateId, logId: job.logId }, 'Plantilla no encontrada en cola');
    await messageLogRepo.updateMessageLogFailed(job.logId, 'Plantilla no encontrada');
    await campaignRepo.incrementCampaignMetric(job.campaignId, 'fallidos');
    await campaignRepo.finalizeCampaignIfDone(job.campaignId);
    return;
  }

  try {
    const { messageId, messageStatus } = await provider.sendTemplate({
      to: job.telefono,
      ...templateSendOptions(template, job.variables),
    });

    await messageLogRepo.updateMessageLogSent(job.logId, messageId, messageStatus ?? null);
    await campaignRepo.incrementCampaignMetric(job.campaignId, 'enviados');
  } catch (err) {
    logger.error({ err, logId: job.logId }, 'Fallo al enviar mensaje');
    await messageLogRepo.updateMessageLogFailed(
      job.logId,
      String((err as Error)?.message ?? err),
    );
    await campaignRepo.incrementCampaignMetric(job.campaignId, 'fallidos');
  } finally {
    await campaignRepo.finalizeCampaignIfDone(job.campaignId);
  }
}

export async function buildJobFromLog(log: {
  id: string;
  campanaId: string;
  clienteId: string;
  telefono: string;
}): Promise<EmissionJob | null> {
  const campaign = await campaignRepo.findCampaignById(log.campanaId);
  const template = campaign ? await templateRepo.findTemplateById(campaign.plantillaId) : null;
  const client = await clientRepo.findClientById(log.clienteId);
  if (!campaign || !template || !client) return null;

  return {
    logId: log.id,
    campaignId: campaign.id,
    clientId: client.id,
    telefono: log.telefono,
    templateId: template.id,
    variables: resolveVariables(client, campaign.mapeoVariables),
  };
}
