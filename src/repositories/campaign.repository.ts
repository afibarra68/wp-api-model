import { getPool } from '../core/postgres';
import type {
  Campaign,
  CampaignConfigEnvio,
  CampaignMapeo,
  CampaignMetricas,
  CampaignSegmento,
} from '../types/entities';

type Row = {
  id: string;
  nombre_campana: string;
  plantilla_id: string;
  integration_id: string | null;
  segmento: CampaignSegmento;
  mapeo_variables: CampaignMapeo[];
  config_envio: Record<string, unknown>;
  estado: Campaign['estado'];
  metricas: CampaignMetricas;
  fecha_lanzamiento: Date | null;
  fecha_finalizacion: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapDraftPreferences(
  raw: Record<string, unknown> | null | undefined,
): {
  topeDiario?: number;
  diasPlanificados?: number;
  intervaloMinSeg?: number;
  intervaloMaxSeg?: number;
} {
  if (!raw) return {};
  const tope = raw.tope_diario ?? raw.topeDiario;
  const dias = raw.dias_planificados ?? raw.diasPlanificados;
  const min = raw.intervalo_min_seg ?? raw.intervaloMinSeg;
  const max = raw.intervalo_max_seg ?? raw.intervaloMaxSeg;
  return {
    topeDiario: typeof tope === 'number' && tope > 0 ? tope : undefined,
    diasPlanificados: typeof dias === 'number' && dias > 0 ? dias : undefined,
    intervaloMinSeg: typeof min === 'number' ? min : undefined,
    intervaloMaxSeg: typeof max === 'number' ? max : undefined,
  };
}

function mapConfigEnvio(raw: Record<string, unknown> | null | undefined): CampaignConfigEnvio | null {
  if (!raw || Object.keys(raw).length === 0) return null;
  const ventana = raw.ventana_inicio ?? raw.ventanaInicio;
  const tope = Number(raw.tope_diario ?? raw.topeDiario);
  if (!ventana && !Number.isFinite(tope)) return null;
  if (!Number.isFinite(tope) || tope <= 0) return null;
  const min = raw.intervalo_min_seg ?? raw.intervaloMinSeg;
  const max = raw.intervalo_max_seg ?? raw.intervaloMaxSeg;
  return {
    topeDiario: tope,
    diasEstimados: Number(raw.dias_estimados ?? raw.diasEstimados ?? 0),
    ventanaInicio: ventana ? new Date(ventana as string) : null,
    enviadosEnVentana: Number(raw.enviados_en_ventana ?? raw.enviadosEnVentana ?? 0),
    intervaloMinSeg: typeof min === 'number' ? min : undefined,
    intervaloMaxSeg: typeof max === 'number' ? max : undefined,
  };
}

function serializeConfigEnvio(c: CampaignConfigEnvio): Record<string, unknown> {
  return {
    tope_diario: c.topeDiario,
    dias_estimados: c.diasEstimados,
    ventana_inicio: c.ventanaInicio ? c.ventanaInicio.toISOString() : null,
    enviados_en_ventana: c.enviadosEnVentana,
    intervalo_min_seg: c.intervaloMinSeg ?? 1,
    intervalo_max_seg: c.intervaloMaxSeg ?? 10,
  };
}

function mapSegmento(raw: { etiquetas?: string[]; solo_activos?: boolean; soloActivos?: boolean }): CampaignSegmento {
  return {
    etiquetas: raw.etiquetas ?? [],
    soloActivos: raw.solo_activos ?? raw.soloActivos ?? true,
  };
}

function mapRow(r: Row): Campaign {
  return {
    id: r.id,
    nombreCampana: r.nombre_campana,
    plantillaId: r.plantilla_id,
    integrationId: r.integration_id,
    segmento: mapSegmento(r.segmento as CampaignSegmento & { solo_activos?: boolean }),
    mapeoVariables: r.mapeo_variables ?? [],
    configEnvio: mapConfigEnvio(r.config_envio),
    configPreferencias: mapDraftPreferences(r.config_envio),
    estado: r.estado,
    metricas: r.metricas ?? {
      total: 0,
      encolados: 0,
      enviados: 0,
      entregados: 0,
      leidos: 0,
      fallidos: 0,
    },
    fechaLanzamiento: r.fecha_lanzamiento,
    fechaFinalizacion: r.fecha_finalizacion,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const FIELDS = `id, nombre_campana, plantilla_id, integration_id, segmento, mapeo_variables, config_envio,
  estado, metricas, fecha_lanzamiento, fecha_finalizacion, created_at, updated_at`;

export async function findCampaigns(
  estado: string | undefined,
  page: number,
  limit: number,
): Promise<{ items: Campaign[]; total: number }> {
  const params: unknown[] = [];
  let where = '';
  if (estado) {
    where = 'WHERE estado = $1';
    params.push(estado);
  }
  const offset = (page - 1) * limit;
  const countParams = [...params];
  const listParams = [...params, limit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const [countRes, listRes] = await Promise.all([
    getPool().query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM campaigns ${where}`, countParams),
    getPool().query<Row>(
      `SELECT ${FIELDS} FROM campaigns ${where} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listParams,
    ),
  ]);
  return {
    items: listRes.rows.map(mapRow),
    total: Number(countRes.rows[0]?.c ?? 0),
  };
}

export async function findCampaignById(id: string): Promise<Campaign | null> {
  const { rows } = await getPool().query<Row>(`SELECT ${FIELDS} FROM campaigns WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createCampaign(input: {
  nombre_campana: string;
  plantilla_id: string;
  segmento?: { etiquetas?: string[]; solo_activos?: boolean };
  mapeo_variables?: CampaignMapeo[];
  integration_id?: string | null;
  config_envio?: {
    tope_diario?: number;
    dias_planificados?: number;
    intervalo_min_seg?: number;
    intervalo_max_seg?: number;
  };
}): Promise<Campaign> {
  const segmento = {
    etiquetas: input.segmento?.etiquetas ?? [],
    solo_activos: input.segmento?.solo_activos ?? true,
  };
  const configEnvio = input.config_envio
    ? JSON.stringify({
        tope_diario: input.config_envio.tope_diario ?? null,
        dias_planificados: input.config_envio.dias_planificados ?? null,
        intervalo_min_seg: input.config_envio.intervalo_min_seg ?? 1,
        intervalo_max_seg: input.config_envio.intervalo_max_seg ?? 10,
      })
    : '{}';
  const { rows } = await getPool().query<Row>(
    `INSERT INTO campaigns (nombre_campana, plantilla_id, integration_id, segmento, mapeo_variables, config_envio)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${FIELDS}`,
    [
      input.nombre_campana,
      input.plantilla_id,
      input.integration_id ?? null,
      JSON.stringify(segmento),
      JSON.stringify(input.mapeo_variables ?? []),
      configEnvio,
    ],
  );
  return mapRow(rows[0]);
}

export async function updateCampaign(
  id: string,
  patch: Partial<{
    estado: Campaign['estado'];
    fechaLanzamiento: Date;
    fechaFinalizacion: Date;
    metricas: Partial<CampaignMetricas>;
    configEnvio: CampaignConfigEnvio;
  }>,
): Promise<Campaign | null> {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  let i = 2;
  if (patch.estado !== undefined) { sets.push(`estado = $${i++}`); vals.push(patch.estado); }
  if (patch.fechaLanzamiento !== undefined) { sets.push(`fecha_lanzamiento = $${i++}`); vals.push(patch.fechaLanzamiento); }
  if (patch.fechaFinalizacion !== undefined) { sets.push(`fecha_finalizacion = $${i++}`); vals.push(patch.fechaFinalizacion); }
  if (patch.configEnvio !== undefined) {
    sets.push(`config_envio = $${i++}::jsonb`);
    vals.push(JSON.stringify(serializeConfigEnvio(patch.configEnvio)));
  }
  if (patch.metricas !== undefined) {
    sets.push(`metricas = metricas || $${i++}::jsonb`);
    vals.push(JSON.stringify(patch.metricas));
  }
  if (sets.length === 0) return findCampaignById(id);
  const { rows } = await getPool().query<Row>(
    `UPDATE campaigns SET ${sets.join(', ')} WHERE id = $1 RETURNING ${FIELDS}`,
    vals,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function incrementEnviadosEnVentana(id: string, delta = 1): Promise<void> {
  await getPool().query(
    `UPDATE campaigns SET config_envio = jsonb_set(
      config_envio,
      '{enviados_en_ventana}',
      to_jsonb(COALESCE((config_envio->>'enviados_en_ventana')::int, 0) + $2)
    ) WHERE id = $1`,
    [id, delta],
  );
}

export async function findCampaignsInProgress(): Promise<Campaign[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM campaigns WHERE estado = 'en_progreso' ORDER BY fecha_lanzamiento ASC`,
  );
  return rows.map(mapRow);
}

export async function incrementCampaignMetric(
  id: string,
  field: keyof CampaignMetricas,
  delta = 1,
): Promise<void> {
  await getPool().query(
    `UPDATE campaigns SET metricas = jsonb_set(
      metricas,
      $2::text[],
      to_jsonb(COALESCE((metricas->>$3)::int, 0) + $4)
    ) WHERE id = $1`,
    [id, `{${field}}`, field, delta],
  );
}

export async function finalizeCampaignIfDone(campaignId: string): Promise<void> {
  await getPool().query(
    `UPDATE campaigns SET estado = 'finalizada', fecha_finalizacion = NOW()
     WHERE id = $1 AND estado = 'en_progreso'
     AND NOT EXISTS (
       SELECT 1 FROM message_logs WHERE campana_id = $1 AND estado_actual IN ('encolado', 'pendiente')
     )`,
    [campaignId],
  );
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const { rowCount } = await getPool().query('DELETE FROM campaigns WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
