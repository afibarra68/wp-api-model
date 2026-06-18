import { logger } from '../../core/logger';
import { Client } from '../../models/client.model';
import { Conversation } from '../../models/conversation.model';
import { BotRule } from '../../models/botRule.model';
import { getProvider } from '../../providers';

const VENTANA_MS = 24 * 60 * 60 * 1000;
const STOP_WORDS = ['stop', 'salir', 'baja', 'cancelar'];
const HUMANO_WORDS = ['asesor', 'humano', 'agente'];

/** Abre o renueva la ventana de 24h y registra la última actividad. */
async function upsertConversation(telefono: string, texto: string) {
  const client = await Client.findOne({ telefono });
  if (!client) {
    logger.warn({ telefono }, 'Mensaje entrante de un número no registrado');
    return null;
  }
  const conv = await Conversation.findOneAndUpdate(
    { cliente_id: client._id },
    {
      $set: {
        telefono,
        ventana_abierta_hasta: new Date(Date.now() + VENTANA_MS),
        ultimo_mensaje_entrante: texto,
        ultima_actividad: new Date(),
      },
    },
    { new: true, upsert: true },
  );
  return { client, conv };
}

/**
 * Procesa un mensaje entrante del cliente.
 * - STOP/SALIR -> opt-out.
 * - ASESOR/HUMANO -> handoff (modo humano).
 * - coincide regla -> responde por el proveedor.
 * - sin match -> deja en modo bot sin responder (o se podría enviar fallback).
 */
export async function handleInbound(telefono: string, texto: string): Promise<{ accion: string }> {
  const ctx = await upsertConversation(telefono, texto);
  if (!ctx) return { accion: 'ignorado_no_registrado' };

  const provider = getProvider();
  const lower = texto.trim().toLowerCase();

  if (STOP_WORDS.some((w) => lower === w || lower.includes(w))) {
    await Client.updateOne(
      { _id: ctx.client._id },
      { $set: { activo: false, opt_in: false, opt_out_fecha: new Date() } },
    );
    await provider.sendText({
      to: telefono,
      text: 'Has sido dado de baja. No recibirás más mensajes. Gracias.',
    });
    return { accion: 'opt_out' };
  }

  if (HUMANO_WORDS.some((w) => lower.includes(w))) {
    await Conversation.updateOne({ _id: ctx.conv._id }, { $set: { modo: 'humano' } });
    await provider.sendText({
      to: telefono,
      text: 'Te estamos transfiriendo con un asesor. En breve te atenderá.',
    });
    return { accion: 'handoff' };
  }

  // Si ya está en modo humano, no responde el bot.
  if (ctx.conv.modo === 'humano') {
    return { accion: 'modo_humano_sin_respuesta' };
  }

  const rules = await BotRule.find({ activo: true }).sort({ prioridad: -1 });
  for (const rule of rules) {
    if (rule.palabras_clave.some((k) => lower.includes(k.toLowerCase()))) {
      await provider.sendText({ to: telefono, text: rule.respuesta });
      return { accion: `regla:${rule.nombre}` };
    }
  }

  return { accion: 'sin_coincidencia' };
}
