import { AppError } from '../../core/errors';
import { clientForMapeo } from '../../core/serializers';
import { renderTemplateText } from '../../core/templateSend';
import { isValidId } from '../../core/id';
import { env } from '../../config/env';
import { buildConfigEnvio, calcularPlanEnvio, cupoDisponibleHoy, msHastaProximaVentana } from '../../core/campaignSchedule';
import { normalizeIntervaloSeg } from '../../core/campaignInterval';
import type { Client, CampaignMapeo, CampaignSegmento } from '../../types/entities';
import * as campaignRepo from '../../repositories/campaign.repository';
import * as clientRepo from '../../repositories/client.repository';
import * as templateRepo from '../../repositories/template.repository';
import * as messageLogRepo from '../../repositories/messageLog.repository';
import { getQueue } from '../../queue';
import { releaseCampaignBatch } from './campaignScheduler';

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

function serializePlan(plan: ReturnType<typeof calcularPlanEnvio>) {
  return {
    tope_diario: plan.topeDiario,
    dias_estimados: plan.diasEstimados,
    total: plan.total,
    mensajes_ultimo_dia: plan.mensajesUltimoDia,
  };
}

export async function previewCampaign(campaignId: string) {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  const template = await templateRepo.findTemplateById(campaign.plantillaId);
  if (!template) throw AppError.notFound('Plantilla de la campaña no encontrada');

  const filter = buildSegmentFilter(campaign.segmento);
  const total = await clientRepo.countClientsForSegment(filter);
  const sample = await clientRepo.findOneClientForSegment(filter);

  const plan = calcularPlanEnvio(total, campaign.configPreferencias, env.campaignDefaultDias);

  let ejemplo: {
    variables: string[];
    titulo: string | null;
    texto: string;
    footer: string | null;
    botones: string[];
  } | null = null;
  if (sample) {
    const variables = resolveVariables(sample, campaign.mapeoVariables);
    ejemplo = {
      variables,
      titulo:
        template.headerTipo === 'text' && template.headerText
          ? renderTemplateText(template.headerText, variables)
          : null,
      texto: renderTemplateText(template.cuerpo, variables),
      footer: template.footer,
      botones: template.botones.map((b) => b.texto),
    };
  }

  return {
    campania: campaign.nombreCampana,
    plantilla: template.nombreMeta,
    total_destinatarios: total,
    plan_envio: serializePlan(plan),
    banner: template.headerTipo === 'image' ? template.headerUrl : null,
    titulo: template.headerTipo === 'text' ? template.headerText : null,
    footer: template.footer,
    botones: template.botones,
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

  const plan = calcularPlanEnvio(clientes.length, campaign.configPreferencias, env.campaignDefaultDias);
  const { min, max } = normalizeIntervaloSeg(
    campaign.configPreferencias.intervaloMinSeg,
    campaign.configPreferencias.intervaloMaxSeg,
  );
  const configEnvio = {
    ...buildConfigEnvio(plan, new Date()),
    intervaloMinSeg: min,
    intervaloMaxSeg: max,
  };

  await messageLogRepo.insertMessageLogs(
    clientes.map((c) => ({
      campanaId: campaign.id,
      clienteId: c.id,
      telefono: c.telefono,
    })),
  );

  await campaignRepo.updateCampaign(campaign.id, {
    estado: 'en_progreso',
    fechaLanzamiento: new Date(),
    configEnvio,
    metricas: {
      total: clientes.length,
      encolados: 0,
      pendientes: clientes.length,
    },
  });

  const liberados = await releaseCampaignBatch(campaign.id);

  return {
    encolados: liberados,
    pendientes: clientes.length - liberados,
    campana_id: campaign.id,
    estado: 'en_progreso',
    plan_envio: serializePlan(plan),
  };
}

export async function pauseCampaign(campaignId: string) {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  await getQueue().pause();
  const updated = await campaignRepo.updateCampaign(campaignId, { estado: 'pausada' });
  return updated;
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  if (campaign.estado === 'en_progreso') {
    throw AppError.conflict('Pausa la campaña antes de eliminarla');
  }
  const ok = await campaignRepo.deleteCampaign(campaignId);
  if (!ok) throw AppError.notFound('Campaña no encontrada');
}

export async function resumeCampaign(campaignId: string) {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  await getQueue().resume();
  const updated = await campaignRepo.updateCampaign(campaignId, { estado: 'en_progreso' });
  await releaseCampaignBatch(campaignId);
  return updated;
}

export async function campaignReport(campaignId: string) {
  const campaign = await campaignRepo.findCampaignById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');

  const m = campaign.metricas;
  const pct = (n: number) => (m.total > 0 ? Math.round((n / m.total) * 1000) / 10 : 0);

  const planEnvio = campaign.configEnvio
    ? {
        tope_diario: campaign.configEnvio.topeDiario,
        dias_estimados: campaign.configEnvio.diasEstimados,
        enviados_hoy: campaign.configEnvio.enviadosEnVentana,
        ms_hasta_proxima_ventana: msHastaProximaVentana(campaign.configEnvio),
        cupo_restante_hoy: cupoDisponibleHoy(campaign.configEnvio).cupo,
      }
    : null;

  return {
    campana: campaign.nombreCampana,
    estado: campaign.estado,
    metricas: m,
    plan_envio: planEnvio,
    porcentajes: {
      enviados: pct(m.enviados),
      entregados: pct(m.entregados),
      leidos: pct(m.leidos),
      fallidos: pct(m.fallidos),
    },
  };
}

export { isValidId };
