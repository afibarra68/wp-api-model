import { Types } from 'mongoose';
import { AppError } from '../../core/errors';
import { Campaign } from '../../models/campaign.model';
import { Client, ClientDoc } from '../../models/client.model';
import { Template } from '../../models/template.model';
import { MessageLog } from '../../models/messageLog.model';
import { getQueue, EmissionJob } from '../../queue';

type Mapeo = { indice: number; origen: 'campo' | 'fijo' | 'metadata'; valor: string };

type Segmento = { etiquetas?: string[] | null; solo_activos?: boolean | null } | null | undefined;

/** Construye el filtro de clientes según el segmento de la campaña. */
function buildClientFilter(segmento: Segmento) {
  const filter: Record<string, unknown> = {};
  if (!segmento || segmento.solo_activos !== false) {
    filter.activo = true;
    filter.opt_in = true;
  }
  if (segmento?.etiquetas && segmento.etiquetas.length > 0) {
    filter.etiquetas = { $in: segmento.etiquetas };
  }
  return filter;
}

/** Resuelve las variables de un cliente según el mapeo de la campaña (ordenadas por índice). */
export function resolveVariables(client: ClientDoc, mapeo: Mapeo[]): string[] {
  return [...mapeo]
    .sort((a, b) => a.indice - b.indice)
    .map((m) => {
      if (m.origen === 'fijo') return m.valor;
      if (m.origen === 'campo') {
        const v = (client as unknown as Record<string, unknown>)[m.valor];
        return v != null ? String(v) : '';
      }
      // metadata
      const meta = (client.metadata as Record<string, unknown>) || {};
      return meta[m.valor] != null ? String(meta[m.valor]) : '';
    });
}

export async function previewCampaign(campaignId: string) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  const template = await Template.findById(campaign.plantilla_id);
  if (!template) throw AppError.notFound('Plantilla de la campaña no encontrada');

  const filter = buildClientFilter(campaign.segmento);
  const total = await Client.countDocuments(filter);
  const sample = await Client.findOne(filter);

  let ejemplo: { variables: string[]; texto: string } | null = null;
  if (sample) {
    const variables = resolveVariables(sample, campaign.mapeo_variables as Mapeo[]);
    let texto = template.cuerpo;
    variables.forEach((v, i) => {
      texto = texto.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), v);
    });
    ejemplo = { variables, texto };
  }

  return {
    campania: campaign.nombre_campana,
    plantilla: template.nombre_meta,
    total_destinatarios: total,
    banner: template.header_tipo === 'image' ? template.header_url : null,
    ejemplo,
  };
}

export async function launchCampaign(campaignId: string) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  if (campaign.estado === 'en_progreso') {
    throw AppError.conflict('La campaña ya está en progreso');
  }
  if (campaign.estado === 'finalizada') {
    throw AppError.conflict('La campaña ya finalizó');
  }

  const template = await Template.findById(campaign.plantilla_id);
  if (!template) throw AppError.notFound('Plantilla de la campaña no encontrada');

  const filter = buildClientFilter(campaign.segmento);
  const clientes = await Client.find(filter);
  if (clientes.length === 0) {
    throw AppError.badRequest('No hay clientes que coincidan con el segmento');
  }

  // Crear logs en estado "encolado".
  const logsDocs = clientes.map((c) => ({
    campana_id: campaign._id,
    cliente_id: c._id,
    telefono: c.telefono,
    estado_actual: 'encolado' as const,
    historial_estados: [{ estado: 'encolado' as const, fecha: new Date() }],
  }));
  const logs = await MessageLog.insertMany(logsDocs);

  // Construir jobs.
  const queue = getQueue();
  const jobs: EmissionJob[] = clientes.map((c, idx) => ({
    logId: String(logs[idx]._id),
    campaignId: String(campaign._id),
    clientId: String(c._id),
    telefono: c.telefono,
    templateName: template.nombre_meta,
    languageCode: template.idioma,
    templateCategory: template.categoria,
    variables: resolveVariables(c, campaign.mapeo_variables as Mapeo[]),
    headerImageUrl: template.header_tipo === 'image' ? template.header_url : null,
  }));

  // Actualizar campaña.
  campaign.estado = 'en_progreso';
  campaign.fecha_lanzamiento = new Date();
  campaign.set('metricas.total', clientes.length);
  campaign.set('metricas.encolados', clientes.length);
  await campaign.save();

  await queue.addBulk(jobs);

  return { encolados: jobs.length, campana_id: String(campaign._id), estado: campaign.estado };
}

export async function pauseCampaign(campaignId: string) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  await getQueue().pause();
  campaign.estado = 'pausada';
  await campaign.save();
  return campaign;
}

export async function resumeCampaign(campaignId: string) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');
  await getQueue().resume();
  campaign.estado = 'en_progreso';
  await campaign.save();
  return campaign;
}

export async function campaignReport(campaignId: string) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw AppError.notFound('Campaña no encontrada');

  const m = campaign.metricas ?? {
    total: 0,
    encolados: 0,
    enviados: 0,
    entregados: 0,
    leidos: 0,
    fallidos: 0,
  };
  const pct = (n: number) => (m.total > 0 ? Math.round((n / m.total) * 1000) / 10 : 0);

  return {
    campana: campaign.nombre_campana,
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

export function isValidId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}
