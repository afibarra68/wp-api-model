import { randomUUID } from 'crypto';
import { logger } from '../core/logger';
import {
  MessageProvider,
  SendInteractiveInput,
  SendMediaInput,
  SendResult,
  SendTemplateInput,
  SendTextInput,
} from './provider.interface';

function fakeWamid(to: string): string {
  return `wamid.SIM.${to}.${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
}

/**
 * Proveedor de SIMULACIÓN: no contacta a WhatsApp.
 * Genera un message_id falso y registra el envío. Sirve para desarrollar y probar
 * todo el flujo (campañas, colas, webhooks, bot) sin SIM ni costo.
 */
export class SimulationProvider implements MessageProvider {
  readonly name = 'simulation';

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    const messageId = fakeWamid(input.to);
    logger.info(
      {
        to: input.to,
        template: input.templateName,
        category: input.templateCategory ?? 'utility',
        vars: input.variables,
        banner: input.headerImageUrl ?? null,
        messageId,
      },
      '[SIM] plantilla enviada',
    );
    return {
      messageId,
      messageStatus: input.templateCategory === 'marketing' ? 'accepted' : undefined,
    };
  }

  async sendText(input: SendTextInput): Promise<SendResult> {
    const messageId = fakeWamid(input.to);
    logger.info(
      { to: input.to, text: input.text, replyTo: input.replyToMessageId ?? null, messageId },
      '[SIM] texto enviado',
    );
    return { messageId };
  }

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    const messageId = fakeWamid(input.to);
    logger.info({ to: input.to, type: input.type, link: input.link, messageId }, '[SIM] media enviado');
    return { messageId };
  }

  async sendInteractive(input: SendInteractiveInput): Promise<SendResult> {
    const messageId = fakeWamid(input.to);
    logger.info(
      { to: input.to, type: input.interactive.type, messageId },
      '[SIM] interactivo enviado',
    );
    return { messageId };
  }
}
