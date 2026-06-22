import { getPool } from '../core/postgres';
import type { ConversationMessage, EstadoMensaje } from '../types/entities';

type Row = {
  id: string;
  conversation_id: string;
  direction: ConversationMessage['direction'];
  origen: ConversationMessage['origen'];
  texto: string;
  whatsapp_message_id: string | null;
  estado: ConversationMessage['estado'];
  created_at: Date;
};

const FIELDS =
  'id, conversation_id, direction, origen, texto, whatsapp_message_id, estado, created_at';

function mapRow(r: Row): ConversationMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    direction: r.direction,
    origen: r.origen,
    texto: r.texto,
    whatsappMessageId: r.whatsapp_message_id,
    estado: r.estado,
    createdAt: r.created_at,
  };
}

export async function insertConversationMessage(input: {
  conversationId: string;
  direction: ConversationMessage['direction'];
  origen: ConversationMessage['origen'];
  texto: string;
  whatsappMessageId?: string | null;
  estado?: ConversationMessage['estado'];
}): Promise<ConversationMessage> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO conversation_messages
       (conversation_id, direction, origen, texto, whatsapp_message_id, estado)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING ${FIELDS}`,
    [
      input.conversationId,
      input.direction,
      input.origen,
      input.texto,
      input.whatsappMessageId ?? null,
      input.estado ?? (input.direction === 'outbound' ? 'enviado' : null),
    ],
  );
  return mapRow(rows[0]);
}

export async function findMessagesByConversation(
  conversationId: string,
  limit = 100,
): Promise<ConversationMessage[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM conversation_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [conversationId, limit],
  );
  return rows.map(mapRow);
}

export async function findConversationMessageByWamid(
  whatsappMessageId: string,
): Promise<ConversationMessage | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM conversation_messages WHERE whatsapp_message_id = $1`,
    [whatsappMessageId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateConversationMessageStatus(
  id: string,
  estado: Exclude<ConversationMessage['estado'], null>,
): Promise<void> {
  await getPool().query(`UPDATE conversation_messages SET estado = $2 WHERE id = $1`, [id, estado]);
}

export async function updateConversationMessageStatusByWamid(
  whatsappMessageId: string,
  nuevoEstado: EstadoMensaje,
): Promise<boolean> {
  if (nuevoEstado === 'encolado') return false;
  const msg = await findConversationMessageByWamid(whatsappMessageId);
  if (!msg || msg.direction !== 'outbound') return false;

  const orden: Record<string, number> = { enviado: 1, entregado: 2, leido: 3, fallido: 4 };
  const actual = msg.estado ?? 'enviado';
  if (nuevoEstado === 'fallido' || orden[nuevoEstado] > (orden[actual] ?? 0)) {
    await updateConversationMessageStatus(msg.id, nuevoEstado);
    return true;
  }
  return false;
}

export async function getLastMessage(
  conversationId: string,
): Promise<ConversationMessage | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM conversation_messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [conversationId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
