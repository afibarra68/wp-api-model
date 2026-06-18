import { AppError } from '../../core/errors';
import { clientForMapeo } from '../../core/serializers';
import { isValidId } from '../../core/id';
import type { Client, CampaignMapeo, CampaignSegmento } from '../../types/entities';
import * as campaignRepo from '../../repositories/campaign.repository';
import * as clientRepo from '../../repositories/client.repository';
import * as templateRepo from '../../repositories/template.repository';
import * as messageLogRepo from '../../repositories/messageLog.repository';
import { getQueue, EmissionJob } from '../../queue';

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

  return {
    campana: campaign.nombreCampana,
    estado: campaign.estado,
    metricas: m,
    porcentajes: {
      enviados: pct(m.enviados),
      entregados: pct(m.entregados),
      leidos: pct(m.leidos),
      fallidos: pct(m.fallidos),
    },
  };
}

export { isValidId };
