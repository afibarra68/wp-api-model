import { logger } from '../core/logger';
import { Campaign } from '../models/campaign.model';
import { Client, ClientDoc } from '../models/client.model';
import { MessageLog } from '../models/messageLog.model';
import { Template } from '../models/template.model';
import { getProvider } from '../providers';
import { resolveVariables } from '../modules/campaigns/campaigns.service';
import { EmissionJob } from './queue.interface';

type Mapeo = { indice: number; origen: 'campo' | 'fijo' | 'metadata'; valor: string };

/** Procesa un trabajo de emisión: envía vía proveedor y actualiza log + métricas. */
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

    await MessageLog.findByIdAndUpdate(job.logId, {
      $set: {
        whatsapp_message_id: messageId,
        estado_actual: 'enviado',
        ...(messageStatus ? { meta_message_status: messageStatus } : {}),
      },
      $push: { historial_estados: { estado: 'enviado', fecha: new Date() } },
    });
    await Campaign.findByIdAndUpdate(job.campaignId, { $inc: { 'metricas.enviados': 1 } });
  } catch (err) {
    logger.error({ err, logId: job.logId }, 'Fallo al enviar mensaje');
    await MessageLog.findByIdAndUpdate(job.logId, {
      $set: { estado_actual: 'fallido', error: String((err as Error)?.message ?? err) },
      $push: { historial_estados: { estado: 'fallido', fecha: new Date() } },
    });
    await Campaign.findByIdAndUpdate(job.campaignId, { $inc: { 'metricas.fallidos': 1 } });
  } finally {
    await maybeFinalizeCampaign(job.campaignId);
  }
}

/** Si ya no quedan mensajes "encolado" en la campaña, la marca como finalizada. */
async function maybeFinalizeCampaign(campaignId: string): Promise<void> {
  const pendientes = await MessageLog.countDocuments({
    campana_id: campaignId,
    estado_actual: 'encolado',
  });
  if (pendientes === 0) {
    await Campaign.findOneAndUpdate(
      { _id: campaignId, estado: 'en_progreso' },
      { $set: { estado: 'finalizada', fecha_finalizacion: new Date() } },
    );
  }
}

/** Reconstruye un EmissionJob a partir de un MessageLog encolado. */
export async function buildJobFromLog(log: { _id: unknown; campana_id: unknown; cliente_id: unknown; telefono: string }): Promise<EmissionJob | null> {
  const campaign = await Campaign.findById(log.campana_id);
  const template = campaign ? await Template.findById(campaign.plantilla_id) : null;
  const client = await Client.findById(log.cliente_id);
  if (!campaign || !template || !client) return null;

  return {
    logId: String(log._id),
    campaignId: String(campaign._id),
    clientId: String(client._id),
    telefono: log.telefono,
    templateName: template.nombre_meta,
    languageCode: template.idioma,
    templateCategory: template.categoria,
    variables: resolveVariables(client as ClientDoc, campaign.mapeo_variables as Mapeo[]),
    headerImageUrl: template.header_tipo === 'image' ? template.header_url : null,
  };
}
