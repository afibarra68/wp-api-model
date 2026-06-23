import { getPool } from '../core/postgres';
import type { BotConfig } from '../types/entities';

type Row = {
  id: string;
  mensaje_cierre: string;
  enviar_mensaje_cierre: boolean;
  updated_at: Date;
};

function mapRow(r: Row): BotConfig {
  return {
    id: r.id,
    mensajeCierre: r.mensaje_cierre,
    enviarMensajeCierre: r.enviar_mensaje_cierre,
    updatedAt: r.updated_at,
  };
}

const FIELDS = 'id, mensaje_cierre, enviar_mensaje_cierre, updated_at';

export async function getBotConfig(): Promise<BotConfig> {
  const { rows } = await getPool().query<Row>(`SELECT ${FIELDS} FROM bot_config WHERE id = 'default'`);
  if (rows[0]) return mapRow(rows[0]);
  const { rows: inserted } = await getPool().query<Row>(
    `INSERT INTO bot_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING
     RETURNING ${FIELDS}`,
  );
  if (inserted[0]) return mapRow(inserted[0]);
  const { rows: again } = await getPool().query<Row>(`SELECT ${FIELDS} FROM bot_config WHERE id = 'default'`);
  return mapRow(again[0]);
}

export async function updateBotConfig(patch: {
  mensajeCierre?: string;
  enviarMensajeCierre?: boolean;
}): Promise<BotConfig> {
  await getBotConfig();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.mensajeCierre !== undefined) {
    sets.push(`mensaje_cierre = $${i++}`);
    vals.push(patch.mensajeCierre);
  }
  if (patch.enviarMensajeCierre !== undefined) {
    sets.push(`enviar_mensaje_cierre = $${i++}`);
    vals.push(patch.enviarMensajeCierre);
  }
  if (!sets.length) return getBotConfig();
  const { rows } = await getPool().query<Row>(
    `UPDATE bot_config SET ${sets.join(', ')} WHERE id = 'default' RETURNING ${FIELDS}`,
    vals,
  );
  return mapRow(rows[0]);
}
