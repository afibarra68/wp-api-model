import { logger } from '../../core/logger';
import { Campaign } from '../../models/campaign.model';
import { Client } from '../../models/client.model';
import {
  EstadoMensaje,
  MessageLog,
  ORDEN_ESTADO,
} from '../../models/messageLog.model';
import { handleInbound } from '../bot/bot.service';

const METRICA_POR_ESTADO: Partial<Record<EstadoMensaje, string>> = {
  enviado: 'metricas.enviados',
  entregado: 'metricas.entregados',
  leido: 'metricas.leidos',
  fallido: 'metricas.fallidos',
};

/** Mapea los estados de Meta a los estados internos. */
export function mapMetaStatus(status: string): EstadoMensaje | null {
  switch (status) {
    case 'sent':
      return 'enviado';
    case 'delivered':
      return 'entregado';
    case 'read':
      return 'leido';
    case 'failed':
      return 'fallido';
    default:
      return null;
  }
}

/** Actualiza el estado de un mensaje de forma idempotente y monotónica. */
export async function updateMessageStatus(
  whatsappMessageId: string,
  nuevoEstado: EstadoMensaje,
): Promise<{ updated: boolean }> {
  const log = await MessageLog.findOne({ whatsapp_message_id: whatsappMessageId });
  if (!log) {
    logger.warn({ whatsappMessageId }, 'Webhook de estado sin log asociado');
    return { updated: false };
  }

  const actual = log.estado_actual as EstadoMensaje;
  // No retroceder ni repetir (idempotencia).
  if (ORDEN_ESTADO[nuevoEstado] <= ORDEN_ESTADO[actual] && actual !== 'encolado') {
    return { updated: false };
  }

  log.estado_actual = nuevoEstado;
  log.historial_estados.push({ estado: nuevoEstado, fecha: new Date() });
  await log.save();

  const metricaKey = METRICA_POR_ESTADO[nuevoEstado];
  if (metricaKey) {
    await Campaign.findByIdAndUpdate(log.campana_id, { $inc: { [metricaKey]: 1 } });
  }

  // Limpieza de base: número fallido -> cliente inactivo.
  if (nuevoEstado === 'fallido') {
    await Client.findByIdAndUpdate(log.cliente_id, { $set: { activo: false } });
  }

  return { updated: true };
}

/** Procesa el payload del webhook de Meta (estructura real). */
export async function processMetaWebhook(body: unknown): Promise<void> {
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as Array<{ changes?: unknown[] }>) {
    for (const change of entry.changes ?? []) {
      const value = (change as { value?: Record<string, unknown> }).value ?? {};

      // Actualizaciones de estado.
      const statuses = (value.statuses as Array<{ id: string; status: string }>) ?? [];
      for (const s of statuses) {
        const estado = mapMetaStatus(s.status);
        if (estado) await updateMessageStatus(s.id, estado);
      }

      // Mensajes entrantes.
      const messages =
        (value.messages as Array<{ from: string; text?: { body: string }; type: string }>) ?? [];
      for (const m of messages) {
        const texto = m.text?.body ?? '';
        await handleInbound(m.from, texto);
      }
    }
  }
}
