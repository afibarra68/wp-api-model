import { logger } from '../core/logger';
import * as campaignRepo from '../repositories/campaign.repository';
import * as clientRepo from '../repositories/client.repository';
import * as templateRepo from '../repositories/template.repository';
import * as messageLogRepo from '../repositories/messageLog.repository';
import { getProvider } from '../providers';
import { resolveVariables } from '../modules/campaigns/campaigns.service';
import { EmissionJob } from './queue.interface';

export async function processEmissionJob(job: EmissionJob): Promise<void> {
  const provider = getProvider();
  try {
    const { messageId, messageStatus } = await provider.sendTemplate({
      to: job.telefono,
      templateName: job.templateName,
      languageCode: job.languageCode,
      templateCategory: job.templateCategory,
      variables: job.variables,
      headerImageUrl: job.headerImageUrl ?? null,
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
    templateName: template.nombreMeta,
    languageCode: template.idioma,
    templateCategory: template.categoria,
    variables: resolveVariables(client, campaign.mapeoVariables),
    headerImageUrl: template.headerTipo === 'image' ? template.headerUrl : null,
  };
}
