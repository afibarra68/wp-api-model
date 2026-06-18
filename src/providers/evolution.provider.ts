import { AppError } from '../core/errors';
import { getIntegrationSettings } from '../modules/integrations/integration.config';
import {
  MessageProvider,
  SendInteractiveInput,
  SendMediaInput,
  SendResult,
  SendTemplateInput,
  SendTextInput,
} from './provider.interface';

/**
 * Proveedor vía Evolution API (gateway autoalojado).
 * Credenciales desde integration_configs (Postgres) o .env fallback.
 */
export class EvolutionProvider implements MessageProvider {
  readonly name = 'evolution';

  private cfg() {
    return getIntegrationSettings();
  }

  private async sendMessage(to: string, text: string): Promise<SendResult> {
    const c = this.cfg();
    if (!c.evolutionBaseUrl || !c.evolutionApiKey || !c.evolutionInstance) {
      throw AppError.badRequest('Faltan credenciales Evolution. Configure en /integrations o EVOLUTION_* en .env');
    }
    const url = `${c.evolutionBaseUrl}/message/sendText/${c.evolutionInstance}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { apikey: c.evolutionApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: to, text }),
    });
    const data = (await resp.json()) as { key?: { id: string } };
    if (!resp.ok) {
      throw new AppError(502, 'PROVIDER_ERROR', 'Error de Evolution API', data);
    }
    return { messageId: data.key?.id ?? '' };
  }

  private async sendMediaUrl(to: string, mediaUrl: string, caption: string): Promise<SendResult> {
    const c = this.cfg();
    if (!c.evolutionBaseUrl || !c.evolutionApiKey || !c.evolutionInstance) {
      throw AppError.badRequest('Faltan credenciales Evolution');
    }
    const url = `${c.evolutionBaseUrl}/message/sendMedia/${c.evolutionInstance}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { apikey: c.evolutionApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: to, mediatype: 'image', media: mediaUrl, caption }),
    });
    const data = (await resp.json()) as { key?: { id: string } };
    if (!resp.ok) throw new AppError(502, 'PROVIDER_ERROR', 'Error de Evolution API (media)', data);
    return { messageId: data.key?.id ?? '' };
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    let text = input.templateName;
    input.variables.forEach((v, i) => {
      text = text.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), v);
    });
    const caption = text || input.variables.join(' ');
    if (input.headerImageUrl) {
      return this.sendMediaUrl(input.to, input.headerImageUrl, caption);
    }
    return this.sendMessage(input.to, caption);
  }

  async sendText(input: SendTextInput): Promise<SendResult> {
    return this.sendMessage(input.to, input.text);
  }

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    if (input.type !== 'image' || !input.link) {
      throw AppError.badRequest('Evolution solo soporta image por URL en esta implementación');
    }
    return this.sendMediaUrl(input.to, input.link, input.caption ?? '');
  }

  async sendInteractive(input: SendInteractiveInput): Promise<SendResult> {
    return this.sendMessage(input.to, input.interactive.body.text);
  }
}
