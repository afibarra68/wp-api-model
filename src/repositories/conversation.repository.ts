import { getPool } from '../core/postgres';
import type { BotRule, Conversation } from '../types/entities';

// --- Conversations ---

type ConvRow = {
  id: string;
  cliente_id: string;
  telefono: string;
  ventana_abierta_hasta: Date | null;
  modo: Conversation['modo'];
  ultimo_mensaje_entrante: string | null;
  ultima_actividad: Date;
  created_at: Date;
  updated_at: Date;
};

function mapConv(r: ConvRow): Conversation {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    telefono: r.telefono,
    ventanaAbiertaHasta: r.ventana_abierta_hasta,
    modo: r.modo,
    ultimoMensajeEntrante: r.ultimo_mensaje_entrante,
    ultimaActividad: r.ultima_actividad,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const CONV_FIELDS = `id, cliente_id, telefono, ventana_abierta_hasta, modo,
  ultimo_mensaje_entrante, ultima_actividad, created_at, updated_at`;

export async function findConversations(modo?: string): Promise<Conversation[]> {
  const params: unknown[] = [];
  let where = '';
  if (modo) {
    where = 'WHERE modo = $1';
    params.push(modo);
  }
  const { rows } = await getPool().query<ConvRow>(
    `SELECT ${CONV_FIELDS} FROM conversations ${where} ORDER BY ultima_actividad DESC LIMIT 200`,
    params,
  );
  return rows.map(mapConv);
}

export async function findConversationById(id: string): Promise<Conversation | null> {
  const { rows } = await getPool().query<ConvRow>(
    `SELECT ${CONV_FIELDS} FROM conversations WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapConv(rows[0]) : null;
}

export async function findConversationByTelefono(telefono: string): Promise<Conversation | null> {
  const { rows } = await getPool().query<ConvRow>(
    `SELECT ${CONV_FIELDS} FROM conversations WHERE telefono = $1`,
    [telefono],
  );
  return rows[0] ? mapConv(rows[0]) : null;
}

export async function upsertConversation(input: {
  clienteId: string;
  telefono: string;
  texto: string;
  ventanaHasta: Date;
}): Promise<Conversation> {
  const { rows } = await getPool().query<ConvRow>(
    `INSERT INTO conversations (cliente_id, telefono, ventana_abierta_hasta, ultimo_mensaje_entrante, ultima_actividad)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (cliente_id) DO UPDATE SET
       telefono = EXCLUDED.telefono,
       ventana_abierta_hasta = EXCLUDED.ventana_abierta_hasta,
       ultimo_mensaje_entrante = EXCLUDED.ultimo_mensaje_entrante,
       ultima_actividad = NOW()
     RETURNING ${CONV_FIELDS}`,
    [input.clienteId, input.telefono, input.ventanaHasta, input.texto],
  );
  return mapConv(rows[0]);
}

export async function setConversationModo(id: string, modo: Conversation['modo']): Promise<Conversation | null> {
  const { rows } = await getPool().query<ConvRow>(
    `UPDATE conversations SET modo = $2 WHERE id = $1 RETURNING ${CONV_FIELDS}`,
    [id, modo],
  );
  return rows[0] ? mapConv(rows[0]) : null;
}

export async function touchConversation(id: string): Promise<void> {
  await getPool().query(`UPDATE conversations SET ultima_actividad = NOW() WHERE id = $1`, [id]);
}

// --- Bot rules ---

type RuleRow = {
  id: string;
  nombre: string;
  palabras_clave: string[];
  respuesta_tipo: BotRule['respuestaTipo'];
  respuesta: string;
  activo: boolean;
  prioridad: number;
  created_at: Date;
  updated_at: Date;
};

function mapRule(r: RuleRow): BotRule {
  return {
    id: r.id,
    nombre: r.nombre,
    palabrasClave: r.palabras_clave ?? [],
    respuestaTipo: r.respuesta_tipo,
    respuesta: r.respuesta,
    activo: r.activo,
    prioridad: r.prioridad,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const RULE_FIELDS =
  'id, nombre, palabras_clave, respuesta_tipo, respuesta, activo, prioridad, created_at, updated_at';

export async function countBotRules(): Promise<number> {
  const { rows } = await getPool().query<{ c: string }>('SELECT COUNT(*)::text AS c FROM bot_rules');
  return Number(rows[0]?.c ?? 0);
}

export async function findActiveBotRules(): Promise<BotRule[]> {
  const { rows } = await getPool().query<RuleRow>(
    `SELECT ${RULE_FIELDS} FROM bot_rules WHERE activo = TRUE ORDER BY prioridad DESC`,
  );
  return rows.map(mapRule);
}

export async function findAllBotRules(): Promise<BotRule[]> {
  const { rows } = await getPool().query<RuleRow>(
    `SELECT ${RULE_FIELDS} FROM bot_rules ORDER BY prioridad DESC`,
  );
  return rows.map(mapRule);
}

export async function createBotRule(input: {
  nombre: string;
  palabras_clave: string[];
  respuesta_tipo?: BotRule['respuestaTipo'];
  respuesta: string;
  activo?: boolean;
  prioridad?: number;
}): Promise<BotRule> {
  const { rows } = await getPool().query<RuleRow>(
    `INSERT INTO bot_rules (nombre, palabras_clave, respuesta_tipo, respuesta, activo, prioridad)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${RULE_FIELDS}`,
    [
      input.nombre,
      input.palabras_clave,
      input.respuesta_tipo ?? 'texto',
      input.respuesta,
      input.activo ?? true,
      input.prioridad ?? 0,
    ],
  );
  return mapRule(rows[0]);
}

export async function createBotRulesBulk(
  rules: Array<{
    nombre: string;
    palabras_clave: string[];
    respuesta: string;
    prioridad?: number;
  }>,
): Promise<void> {
  for (const r of rules) {
    await createBotRule(r);
  }
}

export async function updateBotRule(
  id: string,
  patch: Partial<{
    nombre: string;
    palabras_clave: string[];
    respuesta_tipo: BotRule['respuestaTipo'];
    respuesta: string;
    activo: boolean;
    prioridad: number;
  }>,
): Promise<BotRule | null> {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  let i = 2;
  if (patch.nombre !== undefined) { sets.push(`nombre = $${i++}`); vals.push(patch.nombre); }
  if (patch.palabras_clave !== undefined) { sets.push(`palabras_clave = $${i++}`); vals.push(patch.palabras_clave); }
  if (patch.respuesta_tipo !== undefined) { sets.push(`respuesta_tipo = $${i++}`); vals.push(patch.respuesta_tipo); }
  if (patch.respuesta !== undefined) { sets.push(`respuesta = $${i++}`); vals.push(patch.respuesta); }
  if (patch.activo !== undefined) { sets.push(`activo = $${i++}`); vals.push(patch.activo); }
  if (patch.prioridad !== undefined) { sets.push(`prioridad = $${i++}`); vals.push(patch.prioridad); }
  if (sets.length === 0) {
    const { rows } = await getPool().query<RuleRow>(`SELECT ${RULE_FIELDS} FROM bot_rules WHERE id = $1`, [id]);
    return rows[0] ? mapRule(rows[0]) : null;
  }
  const { rows } = await getPool().query<RuleRow>(
    `UPDATE bot_rules SET ${sets.join(', ')} WHERE id = $1 RETURNING ${RULE_FIELDS}`,
    vals,
  );
  return rows[0] ? mapRule(rows[0]) : null;
}

export async function deleteBotRule(id: string): Promise<boolean> {
  const { rowCount } = await getPool().query('DELETE FROM bot_rules WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
