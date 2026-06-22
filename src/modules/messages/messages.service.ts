import { AppError } from '../../core/errors';
import { isValidId } from '../../core/id';
import { templateSendOptions } from '../../core/templateSend';
import type { Template } from '../../types/entities';
import * as clientRepo from '../../repositories/client.repository';
import * as convRepo from '../../repositories/conversation.repository';
import * as templateRepo from '../../repositories/template.repository';
import {
  getProvider,
  MetaCloudMessagePayload,
  ProductPolicy,
  SendInteractiveInput,
  SendMediaInput,
  SendResult,
} from '../../providers';

type RecipientInput = { to?: string; cliente_id?: string };

type SendByTemplateInput = RecipientInput & {
  plantilla_id: string;
  variables?: string[];
  productPolicy?: ProductPolicy;
  messageActivitySharing?: boolean;
};

export async function resolvePhone(input: RecipientInput): Promise<{ telefono: string }> {
  if (input.to) return { telefono: input.to };
  if (input.cliente_id) {
    if (!isValidId(input.cliente_id)) {
      throw AppError.badRequest('cliente_id inválido');
    }
    const client = await clientRepo.findClientById(input.cliente_id);
    if (!client) throw AppError.notFound('Cliente no encontrado');
    if (!client.activo || !client.optIn) {
      throw AppError.badRequest('El cliente no tiene opt-in activo');
    }
    return { telefono: client.telefono };
  }
  throw AppError.badRequest('Indica "to" (teléfono) o "cliente_id"');
}

export async function assertSessionWindow(telefono: string): Promise<void> {
  const conv = await convRepo.findConversationByTelefono(telefono);
  const abierta = conv?.ventanaAbiertaHasta && conv.ventanaAbiertaHasta > new Date();
  if (!abierta) {
    throw AppError.badRequest(
      'La ventana de 24h está cerrada. Usa POST /messages/send con plantilla o espera que el cliente escriba.',
    );
  }
}

async function loadTemplate(plantillaId: string): Promise<Template> {
  if (!isValidId(plantillaId)) {
    throw AppError.badRequest('plantilla_id inválido');
  }
  const template = await templateRepo.findTemplateById(plantillaId);
  if (!template) throw AppError.notFound('Plantilla no encontrada');
  if (template.estado !== 'aprobada') {
    throw AppError.badRequest('La plantilla debe estar en estado "aprobada"');
  }
  return template;
}

function buildSendInput(
  telefono: string,
  template: Template,
  variables: string[],
  opts?: { productPolicy?: ProductPolicy; messageActivitySharing?: boolean },
) {
  return {
    to: telefono,
    ...templateSendOptions(template, variables),
    productPolicy: opts?.productPolicy,
    messageActivitySharing: opts?.messageActivitySharing,
  };
}

export async function sendTemplateMessage(input: SendByTemplateInput): Promise<SendResult & { endpoint: string }> {
  const { telefono } = await resolvePhone(input);
  const template = await loadTemplate(input.plantilla_id);
  const provider = getProvider();

  const result = await provider.sendTemplate(
    buildSendInput(telefono, template, input.variables ?? [], {
      productPolicy: input.productPolicy,
      messageActivitySharing: input.messageActivitySharing,
    }),
  );

  return {
    ...result,
    endpoint: template.categoria === 'marketing' ? 'marketing_messages' : 'messages',
  };
}

export async function sendMarketingMessage(
  input: SendByTemplateInput,
): Promise<SendResult & { endpoint: 'marketing_messages' }> {
  const { telefono } = await resolvePhone(input);
  const template = await loadTemplate(input.plantilla_id);

  if (template.categoria !== 'marketing') {
    throw AppError.badRequest(
      'Esta plantilla no es de categoría marketing. Usa POST /messages/send para utility/authentication.',
    );
  }

  const provider = getProvider();
  const result = await provider.sendTemplate(
    buildSendInput(telefono, template, input.variables ?? [], {
      productPolicy: input.productPolicy,
      messageActivitySharing: input.messageActivitySharing,
    }),
  );

  return { ...result, endpoint: 'marketing_messages' };
}

export async function sendTextMessage(input: RecipientInput & {
  text: string;
  reply_to_message_id?: string;
  skip_window_check?: boolean;
}): Promise<SendResult & { endpoint: 'messages' }> {
  const { telefono } = await resolvePhone(input);
  if (!input.skip_window_check) await assertSessionWindow(telefono);

  const result = await getProvider().sendText({
    to: telefono,
    text: input.text,
    replyToMessageId: input.reply_to_message_id,
  });
  return { ...result, endpoint: 'messages' };
}

export async function sendMediaMessage(input: RecipientInput & SendMediaInput & {
  skip_window_check?: boolean;
}): Promise<SendResult & { endpoint: 'messages' }> {
  const { telefono } = await resolvePhone(input);
  if (!input.skip_window_check) await assertSessionWindow(telefono);

  const result = await getProvider().sendMedia({
    to: telefono,
    type: input.type,
    link: input.link,
    id: input.id,
    caption: input.caption,
    filename: input.filename,
    replyToMessageId: input.replyToMessageId,
  });
  return { ...result, endpoint: 'messages' };
}

export async function sendInteractiveMessage(input: RecipientInput & {
  interactive: SendInteractiveInput['interactive'];
  reply_to_message_id?: string;
  skip_window_check?: boolean;
}): Promise<SendResult & { endpoint: 'messages' }> {
  const { telefono } = await resolvePhone(input);
  if (!input.skip_window_check) await assertSessionWindow(telefono);

  const result = await getProvider().sendInteractive({
    to: telefono,
    interactive: input.interactive,
    replyToMessageId: input.reply_to_message_id,
  });
  return { ...result, endpoint: 'messages' };
}

export async function sendCloudMessage(
  payload: MetaCloudMessagePayload,
): Promise<SendResult & { endpoint: 'messages' }> {
  const provider = getProvider();
  if (!provider.sendCloudMessage) {
    throw AppError.badRequest('sendCloudMessage solo está disponible con PROVIDER=meta-cloud');
  }
  const result = await provider.sendCloudMessage(payload);
  return { ...result, endpoint: 'messages' };
}
