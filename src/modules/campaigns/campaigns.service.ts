import { AppError } from '../../core/errors';
import { clientForMapeo } from '../../core/serializers';
import { isValidId } from '../../core/id';
import type { CampaignSettings, Client, CampaignMapeo, CampaignSegmento } from '../../types/entities';
import * as campaignRepo from '../../repositories/campaign.repository';
import * as campaignSettingsRepo from '../../repositories/campaignSettings.repository';
import * as clientRepo from '../../repositories/client.repository';
import * as templateRepo from '../../repositories/template.repository';
import * as messageLogRepo from '../../repositories/messageLog.repository';
import { getQueue, EmissionJob } from '../../queue';
import { buildJobFromLog, processEmissionJob } from '../../queue/emission.processor';
import { getProvider } from '../../providers';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildSegmentFilter(segmento: CampaignSegmento | null | undefined) {
  const filter: { activo?: boolean; optIn?: boolean; etiquetas?: string[] } = {};
  if (!segmento || segmento.soloActivos !== false) {
    filter.activo = true;
    filter.optIn = true;
  }
  if (segmento?.etiquetas && segmento.etiquetas.length > 0) {
    filter.etiquetas = segmento.etiquetas;
  }
  return filter;
}

export function resolveVariables(client: Client, mapeo: CampaignMapeo[]): string[] {
  const flat = clientForMapeo(client);
  return [...mapeo]
    .sort((a, b) => a.indice - b.indice)
    .map((m) => {
      if (m.origen === 'fijo') return m.valor;
      if (m.origen === 'campo') {
        const v = flat[m.valor];
        return v != null ? String(v) : '';
      }
      const meta = client.metadata || {};
      return meta[m.valor] != null ? String(meta[m.valor]) : '';
    });
}

export async function previewCampaign(campaignId: string) {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  const template = await templateRepo.findTemplateById(campaign.plantillaId);
  if (!template) throw AppError.notFound('Plantilla de la campaña no encontrada');

  const filter = buildSegmentFilter(campaign.segmento);
  const total = await clientRepo.countClientsForSegment(filter);
  const sample = await clientRepo.findOneClientForSegment(filter);

  let ejemplo: { variables: string[]; texto: string } | null = null;
  if (sample) {
    const variables = resolveVariables(sample, campaign.mapeoVariables);
    let texto = template.cuerpo;
    variables.forEach((v, i) => {
      texto = texto.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), v);
    });
    ejemplo = { variables, texto };
  }

  return {
    campania: campaign.nombreCampana,
    plantilla: template.nombreMeta,
    total_destinatarios: total,
    banner: template.headerTipo === 'image' ? template.headerUrl : null,
    ejemplo,
  };
}

export async function launchCampaign(campaignId: string) {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  if (campaign.estado === 'en_progreso') {
    throw AppError.conflict('La campaña ya está en progreso');
  }
  if (campaign.estado === 'finalizada') {
    throw AppError.conflict('La campaña ya finalizó');
  }

  const template = await templateRepo.findTemplateById(campaign.plantillaId);
  if (!template) throw AppError.notFound('Plantilla de la campaña no encontrada');

  const filter = buildSegmentFilter(campaign.segmento);
  const clientes = await clientRepo.findClientsForSegment(filter);
  if (clientes.length === 0) {
    throw AppError.badRequest('No hay clientes que coincidan con el segmento');
  }

  const logs = await messageLogRepo.insertMessageLogs(
    clientes.map((c) => ({
      campanaId: campaign.id,
      clienteId: c.id,
      telefono: c.telefono,
    })),
  );

  const queue = getQueue();
  const settings = await campaignSettingsRepo.getCampaignSettings();
  const jobs: EmissionJob[] = clientes.map((c, idx) => ({
    logId: logs[idx].id,
    campaignId: campaign.id,
    clientId: c.id,
    telefono: c.telefono,
    templateName: template.nombreMeta,
    languageCode: template.idioma,
    templateCategory: template.categoria,
    variables: resolveVariables(c, campaign.mapeoVariables),
    headerImageUrl: template.headerTipo === 'image' ? template.headerUrl : null,
    productPolicy: settings.productPolicy ?? undefined,
    messageActivitySharing: settings.messageActivitySharing ?? undefined,
  }));

  await campaignRepo.updateCampaign(campaign.id, {
    estado: 'en_progreso',
    fechaLanzamiento: new Date(),
    metricas: { total: clientes.length, encolados: clientes.length },
  });

  await queue.addBulk(jobs);

  return { encolados: jobs.length, campana_id: campaign.id, estado: 'en_progreso' };
}

export async function pauseCampaign(campaignId: string) {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  await getQueue().pause();
  const updated = await campaignRepo.updateCampaign(campaignId, { estado: 'pausada' });
  return updated;
}

export async function resumeCampaign(campaignId: string) {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  await getQueue().resume();
  const updated = await campaignRepo.updateCampaign(campaignId, { estado: 'en_progreso' });
  return updated;
}

export async function campaignReport(campaignId: string) {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');

  const m = campaign.metricas;
  const pct = (n: number) => (m.total > 0 ? Math.round((n / m.total) * 1000) / 10 : 0);
  const pendientes = await messageLogRepo.countPendingLogs(campaignId);
  const retenidosMeta = await messageLogRepo.countHeldLogs(campaignId);

  return {
    campana: campaign.nombreCampana,
    estado: campaign.estado,
    metricas: m,
    pendientes,
    retenidos_meta: retenidosMeta,
    porcentajes: {
      enviados: pct(m.enviados),
      entregados: pct(m.entregados),
      leidos: pct(m.leidos),
      fallidos: pct(m.fallidos),
    },
  };
}

export async function getCampaignSettings(): Promise<CampaignSettings> {
  return campaignSettingsRepo.getCampaignSettings();
}

export async function updateCampaignSettings(input: {
  send_rate_per_second?: number;
  release_batch_size?: number;
  product_policy?: CampaignSettings['productPolicy'];
  message_activity_sharing?: boolean | null;
}): Promise<CampaignSettings> {
  return campaignSettingsRepo.updateCampaignSettings(input);
}

export async function releasePendingMessages(campaignId: string, batchSize?: number) {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  if (campaign.estado === 'pausada') {
    throw AppError.conflict('La campaña está pausada. Reanúdala antes de liberar mensajes.');
  }

  const settings = await campaignSettingsRepo.getCampaignSettings();
  const limit = Math.min(batchSize ?? settings.releaseBatchSize, 500);
  const logs = await messageLogRepo.findQueuedLogsByCampaign(campaignId, limit);
  if (logs.length === 0) {
    return { procesados: 0, pendientes: 0, campana_id: campaignId };
  }

  const intervalMs = Math.floor(1000 / Math.max(1, settings.sendRatePerSecond));
  let procesados = 0;

  for (const log of logs) {
    const job = await buildJobFromLog(log);
    if (!job) continue;
    await processEmissionJob(applyCampaignSettings(job, settings));
    procesados++;
    if (intervalMs > 0 && procesados < logs.length) await sleep(intervalMs);
  }

  const pendientes = await messageLogRepo.countPendingLogs(campaignId);
  return { procesados, pendientes, campana_id: campaignId };
}

function applyCampaignSettings(job: EmissionJob, settings: CampaignSettings): EmissionJob {
  return {
    ...job,
    productPolicy: settings.productPolicy ?? undefined,
    messageActivitySharing: settings.messageActivitySharing ?? undefined,
  };
}

export async function testSendCampaign(campaignId: string, telefono: string) {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');

  const template = await templateRepo.findTemplateById(campaign.plantillaId);
  if (!template) throw AppError.notFound('Plantilla de la campaña no encontrada');

  const normalized = telefono.replace(/\D/g, '');
  if (normalized.length < 8) throw AppError.badRequest('Teléfono inválido');

  const client = await clientRepo.findClientByTelefono(normalized);
  const settings = await campaignSettingsRepo.getCampaignSettings();

  const variables = client
    ? resolveVariables(client, campaign.mapeoVariables)
    : campaign.mapeoVariables
        .filter((m) => m.origen === 'fijo')
        .sort((a, b) => a.indice - b.indice)
        .map((m) => m.valor);

  const result = await getProvider().sendTemplate({
    to: normalized,
    templateName: template.nombreMeta,
    languageCode: template.idioma,
    templateCategory: template.categoria,
    variables,
    headerImageUrl: template.headerTipo === 'image' ? template.headerUrl : null,
    productPolicy: settings.productPolicy ?? undefined,
    messageActivitySharing: settings.messageActivitySharing ?? undefined,
  });

  return {
    telefono: normalized,
    message_id: result.messageId,
    message_status: result.messageStatus ?? null,
    endpoint: template.categoria === 'marketing' ? 'marketing_messages' : 'messages',
    variables_usadas: variables,
  };
}

export { isValidId };
