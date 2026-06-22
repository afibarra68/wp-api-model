import { logger } from '../../core/logger';
import * as clientRepo from '../../repositories/client.repository';
import * as convRepo from '../../repositories/conversation.repository';
import * as msgRepo from '../../repositories/conversationMessage.repository';
import { getProvider } from '../../providers';

const VENTANA_MS = 24 * 60 * 60 * 1000;
const STOP_WORDS = ['stop', 'salir', 'baja', 'cancelar'];
const HUMANO_WORDS = ['asesor', 'humano', 'agente'];

async function logOutbound(
  conversationId: string,
  texto: string,
  origen: 'bot' | 'sistema',
  messageId?: string,
) {
  await msgRepo.insertConversationMessage({
    conversationId,
    direction: 'outbound',
    origen,
    texto,
    whatsappMessageId: messageId ?? null,
  });
}

async function upsertConversation(telefono: string, texto: string, whatsappMessageId?: string) {
  const client = await clientRepo.findClientByTelefono(telefono);
  if (!client) {
    logger.warn({ telefono }, 'Mensaje entrante de un número no registrado');
    return null;
  }
  const conv = await convRepo.upsertConversation({
    clienteId: client.id,
    telefono,
    texto,
    ventanaHasta: new Date(Date.now() + VENTANA_MS),
  });
  await msgRepo.insertConversationMessage({
    conversationId: conv.id,
    direction: 'inbound',
    origen: 'cliente',
    texto,
    whatsappMessageId: whatsappMessageId ?? null,
  });
  return { client, conv };
}

export async function handleInbound(
  telefono: string,
  texto: string,
  whatsappMessageId?: string,
): Promise<{ accion: string }> {
  const ctx = await upsertConversation(telefono, texto, whatsappMessageId);
  if (!ctx) return { accion: 'ignorado_no_registrado' };

  const provider = getProvider();
  const lower = texto.trim().toLowerCase();

  if (STOP_WORDS.some((w) => lower === w || lower.includes(w))) {
    await clientRepo.updateClient(ctx.client.id, {
      activo: false,
      optIn: false,
      optOutFecha: new Date(),
    });
    const reply = 'Has sido dado de baja. No recibirás más mensajes. Gracias.';
    const result = await provider.sendText({ to: telefono, text: reply });
    await logOutbound(ctx.conv.id, reply, 'sistema', result.messageId);
    return { accion: 'opt_out' };
  }

  if (HUMANO_WORDS.some((w) => lower.includes(w))) {
    await convRepo.setConversationModo(ctx.conv.id, 'humano');
    const reply = 'Te estamos transfiriendo con un asesor. En breve te atenderá.';
    const result = await provider.sendText({ to: telefono, text: reply });
    await logOutbound(ctx.conv.id, reply, 'bot', result.messageId);
    return { accion: 'handoff' };
  }

  if (ctx.conv.modo === 'humano') {
    return { accion: 'modo_humano_sin_respuesta' };
  }

  const rules = await convRepo.findActiveBotRules();
  for (const rule of rules) {
    if (rule.palabrasClave.some((k) => lower.includes(k.toLowerCase()))) {
      const result = await provider.sendText({ to: telefono, text: rule.respuesta });
      await logOutbound(ctx.conv.id, rule.respuesta, 'bot', result.messageId);
      return { accion: `regla:${rule.nombre}` };
    }
  }

  return { accion: 'sin_coincidencia' };
}
