import { getPool } from '../core/postgres';
import type { EstadoMensaje, HistorialEstado, MessageLog } from '../types/entities';

type Row = {
  id: string;
  campana_id: string;
  cliente_id: string;
  telefono: string;
  whatsapp_message_id: string | null;
  meta_message_status: MessageLog['metaMessageStatus'];
  estado_actual: EstadoMensaje;
  error: string | null;
  historial_estados: HistorialEstado[];
  created_at: Date;
  updated_at: Date;
};

function mapRow(r: Row): MessageLog {
  return {
    id: r.id,
    campanaId: r.campana_id,
    clienteId: r.cliente_id,
    telefono: r.telefono,
    whatsappMessageId: r.whatsapp_message_id,
    metaMessageStatus: r.meta_message_status,
    estadoActual: r.estado_actual,
    error: r.error,
    historialEstados: (r.historial_estados ?? []).map((h) => ({
      estado: h.estado,
      fecha: h.fecha instanceof Date ? h.fecha : new Date(h.fecha as string),
    })),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const FIELDS = `id, campana_id, cliente_id, telefono, whatsapp_message_id, meta_message_status,
  estado_actual, error, historial_estados, created_at, updated_at`;

export async function findMessageLogs(
  campanaId: string,
  estado: string | undefined,
  page: number,
  limit: number,
): Promise<{ items: MessageLog[]; total: number }> {
  const params: unknown[] = [campanaId];
  let where = 'WHERE campana_id = $1';
  if (estado) {
    where += ' AND estado_actual = $2';
    params.push(estado);
  }
  const offset = (page - 1) * limit;
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const [countRes, listRes] = await Promise.all([
    getPool().query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM message_logs ${where}`, params),
    getPool().query<Row>(
      `SELECT ${FIELDS} FROM message_logs ${where} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...params, limit, offset],
    ),
  ]);
  return {
    items: listRes.rows.map(mapRow),
    total: Number(countRes.rows[0]?.c ?? 0),
  };
}

export async function findMessageLogById(id: string): Promise<MessageLog | null> {
  const { rows } = await getPool().query<Row>(`SELECT ${FIELDS} FROM message_logs WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findMessageLogByWamid(wamid: string): Promise<MessageLog | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM message_logs WHERE whatsapp_message_id = $1`,
    [wamid],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function countPendingLogs(campaignId: string): Promise<number> {
  const { rows } = await getPool().query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM message_logs WHERE campana_id = $1 AND estado_actual = 'encolado'`,
    [campaignId],
  );
  return Number(rows[0]?.c ?? 0);
}

export async function insertMessageLogs(
  logs: Array<{
    campanaId: string;
    clienteId: string;
    telefono: string;
  }>,
): Promise<MessageLog[]> {
  if (logs.length === 0) return [];
  const pool = getPool();
  const client = await pool.connect();
  const created: MessageLog[] = [];
  const historial = JSON.stringify([{ estado: 'encolado', fecha: new Date().toISOString() }]);
  try {
    await client.query('BEGIN');
    for (const l of logs) {
      const { rows } = await client.query<Row>(
        `INSERT INTO message_logs (campana_id, cliente_id, telefono, estado_actual, historial_estados)
         VALUES ($1,$2,$3,'encolado',$4::jsonb) RETURNING ${FIELDS}`,
        [l.campanaId, l.clienteId, l.telefono, historial],
      );
      created.push(mapRow(rows[0]));
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return created;
}

export async function updateMessageLogSent(
  id: string,
  whatsappMessageId: string,
  metaMessageStatus?: string | null,
): Promise<void> {
  const entry = JSON.stringify([{ estado: 'enviado', fecha: new Date().toISOString() }]);
  await getPool().query(
    `UPDATE message_logs SET
      whatsapp_message_id = $2,
      estado_actual = 'enviado',
      meta_message_status = $3,
      historial_estados = historial_estados || $4::jsonb
     WHERE id = $1`,
    [id, whatsappMessageId, metaMessageStatus ?? null, entry],
  );
}

export async function updateMessageLogFailed(id: string, error: string): Promise<void> {
  const entry = JSON.stringify([{ estado: 'fallido', fecha: new Date().toISOString() }]);
  await getPool().query(
    `UPDATE message_logs SET estado_actual = 'fallido', error = $2, historial_estados = historial_estados || $3::jsonb
     WHERE id = $1`,
    [id, error, entry],
  );
}

export async function updateMessageLogStatus(
  id: string,
  nuevoEstado: EstadoMensaje,
): Promise<MessageLog | null> {
  const entry = JSON.stringify([{ estado: nuevoEstado, fecha: new Date().toISOString() }]);
  const { rows } = await getPool().query<Row>(
    `UPDATE message_logs SET estado_actual = $2, historial_estados = historial_estados || $3::jsonb
     WHERE id = $1 RETURNING ${FIELDS}`,
    [id, nuevoEstado, entry],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findQueuedLogs(limit: number): Promise<MessageLog[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM message_logs WHERE estado_actual = 'encolado'
     ORDER BY created_at ASC LIMIT $1`,
    [limit],
  );
  return rows.map(mapRow);
}

export async function findQueuedLogsByCampaign(campaignId: string, limit: number): Promise<MessageLog[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM message_logs
     WHERE campana_id = $1 AND estado_actual = 'encolado'
     ORDER BY created_at ASC LIMIT $2`,
    [campaignId, limit],
  );
  return rows.map(mapRow);
}

export async function countHeldLogs(campaignId: string): Promise<number> {
  try {
    const { rows } = await getPool().query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM message_logs
       WHERE campana_id = $1 AND meta_message_status IN ('held_for_quality_assessment', 'paused')`,
      [campaignId],
    );
    return Number(rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}
