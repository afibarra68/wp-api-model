import { AppError } from '../core/errors';
import { getIntegrationSettings } from '../modules/integrations/integration.config';
import {
  MessageProvider,
  MetaCloudMessagePayload,
  MetaMessageStatus,
  SendInteractiveInput,
  SendMediaInput,
  SendResult,
  SendTemplateInput,
  SendTextInput,
} from './provider.interface';

type MetaPostResponse = {
  messages?: { id: string; message_status?: MetaMessageStatus }[];
  error?: { message: string };
};

/**
 * Proveedor oficial de Meta (WhatsApp Cloud API).
 * Credenciales desde integration_configs (Postgres) o .env fallback.
 */
export class MetaCloudProvider implements MessageProvider {
  readonly name = 'meta-cloud';

  private cfg() {
    return getIntegrationSettings();
  }

  private endpoint(kind: 'messages' | 'marketing_messages'): string {
    const c = this.cfg();
    return `https://graph.facebook.com/${c.whatsappApiVersion}/${c.whatsappPhoneNumberId}/${kind}`;
  }

  private buildBase(to: string, replyToMessageId?: string): Record<string, unknown> {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      ...(replyToMessageId ? { context: { message_id: replyToMessageId } } : {}),
    };
  }

  private async post(
    kind: 'messages' | 'marketing_messages',
    payload: unknown,
  ): Promise<SendResult> {
    const c = this.cfg();
    if (!c.whatsappToken || !c.whatsappPhoneNumberId) {
      throw AppError.badRequest(
        'Faltan credenciales WhatsApp. Configure en POST /integrations o WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID en .env',
      );
    }
    const resp = await fetch(this.endpoint(kind), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.whatsappToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as MetaPostResponse;
    if (!resp.ok) {
      throw new AppError(502, 'PROVIDER_ERROR', data.error?.message ?? 'Error de Meta', data);
    }
    const msg = data.messages?.[0];
    return { messageId: msg?.id ?? '', messageStatus: msg?.message_status };
  }

  async sendCloudMessage(payload: MetaCloudMessagePayload): Promise<SendResult> {
    return this.post('messages', payload);
  }

  private buildTemplateComponents(input: SendTemplateInput): unknown[] {
    const components: unknown[] = [];
    if (input.headerImageUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: input.headerImageUrl } }],
      });
    } else if (input.headerTextVariables?.length) {
      components.push({
        type: 'header',
        parameters: input.headerTextVariables.map((text) => ({ type: 'text', text })),
      });
    }
    if (input.variables.length) {
      components.push({
        type: 'body',
        parameters: input.variables.map((text) => ({ type: 'text', text })),
      });
    }
    if (input.buttonUrlVariables?.length) {
      for (const btn of input.buttonUrlVariables) {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: String(btn.index),
          parameters: [{ type: 'text', text: btn.text }],
        });
      }
    }
    return components;
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    const c = this.cfg();
    const isMarketing = input.templateCategory === 'marketing';
    const components = this.buildTemplateComponents(input);

    const payload: Record<string, unknown> = {
      ...this.buildBase(input.to),
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        ...(components.length ? { components } : {}),
      },
    };

    if (isMarketing) {
      const policy = input.productPolicy ?? c.whatsappProductPolicy;
      if (policy) payload.product_policy = policy;
      const sharing = input.messageActivitySharing ?? c.whatsappMessageActivitySharing;
      if (sharing !== undefined && sharing !== null) payload.message_activity_sharing = sharing;
      return this.post('marketing_messages', payload);
    }

    return this.post('messages', payload);
  }

  async sendText(input: SendTextInput): Promise<SendResult> {
    return this.post('messages', {
      ...this.buildBase(input.to, input.replyToMessageId),
      type: 'text',
      text: { body: input.text },
    });
  }

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    if (!input.link && !input.id) {
      throw AppError.badRequest('Indica "link" (URL) o "id" (media ID de Meta)');
    }
    const media: Record<string, string> = input.id ? { id: input.id } : { link: input.link! };
    if (input.caption) media.caption = input.caption;
    if (input.filename && input.type === 'document') media.filename = input.filename;

    return this.post('messages', {
      ...this.buildBase(input.to, input.replyToMessageId),
      type: input.type,
      [input.type]: media,
    });
  }

  async sendInteractive(input: SendInteractiveInput): Promise<SendResult> {
    return this.post('messages', {
      ...this.buildBase(input.to, input.replyToMessageId),
      type: 'interactive',
      interactive: input.interactive,
    });
  }
}
