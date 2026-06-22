import { logger } from '../../core/logger';
import * as campaignRepo from '../../repositories/campaign.repository';
import * as clientRepo from '../../repositories/client.repository';
import * as messageLogRepo from '../../repositories/messageLog.repository';
import * as convMsgRepo from '../../repositories/conversationMessage.repository';
import { EstadoMensaje, ORDEN_ESTADO } from '../../types/entities';
import { handleInbound } from '../bot/bot.service';

const METRICA_POR_ESTADO: Partial<Record<EstadoMensaje, 'enviados' | 'entregados' | 'leidos' | 'fallidos'>> = {
  enviado: 'enviados',
  entregado: 'entregados',
  leido: 'leidos',
  fallido: 'fallidos',
};

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

export async function updateMessageStatus(
  whatsappMessageId: string,
  nuevoEstado: EstadoMensaje,
): Promise<{ updated: boolean }> {
  const log = await messageLogRepo.findMessageLogByWamid(whatsappMessageId);
  if (!log) {
    const convUpdated = await convMsgRepo.updateConversationMessageStatusByWamid(
      whatsappMessageId,
      nuevoEstado,
    );
    if (convUpdated) return { updated: true };
    logger.warn({ whatsappMessageId }, 'Webhook de estado sin log asociado');
    return { updated: false };
  }

  const actual = log.estadoActual;
  if (ORDEN_ESTADO[nuevoEstado] <= ORDEN_ESTADO[actual] && actual !== 'encolado') {
    return { updated: false };
  }

  await messageLogRepo.updateMessageLogStatus(log.id, nuevoEstado);

  const metricaKey = METRICA_POR_ESTADO[nuevoEstado];
  if (metricaKey) {
    await campaignRepo.incrementCampaignMetric(log.campanaId, metricaKey);
  }

  if (nuevoEstado === 'fallido') {
    await clientRepo.updateClient(log.clienteId, { activo: false });
  }

  return { updated: true };
}

export async function processMetaWebhook(body: unknown): Promise<void> {
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as Array<{ changes?: unknown[] }>) {
    for (const change of entry.changes ?? []) {
      const value = (change as { value?: Record<string, unknown> }).value ?? {};

      const statuses = (value.statuses as Array<{ id: string; status: string }>) ?? [];
      for (const s of statuses) {
        const estado = mapMetaStatus(s.status);
        if (estado) await updateMessageStatus(s.id, estado);
      }

      const messages =
        (value.messages as Array<{ id: string; from: string; text?: { body: string }; type: string }>) ?? [];
      for (const m of messages) {
        const texto = m.text?.body ?? '';
        if (!texto && m.type !== 'text') continue;
        await handleInbound(m.from, texto || `[${m.type}]`, m.id);
      }
    }
  }
}
