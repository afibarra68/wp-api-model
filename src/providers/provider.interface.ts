export type TemplateCategory = 'marketing' | 'utility' | 'authentication';
export type ProductPolicy = 'CLOUD_API_FALLBACK' | 'STRICT';
export type MetaMessageStatus = 'accepted' | 'held_for_quality_assessment' | 'paused';

export interface SendTemplateInput {
  to: string;
  templateName: string;
  languageCode: string;
  variables: string[];
  /** URL pública de una imagen para el encabezado (banner) de la plantilla. Opcional. */
  headerImageUrl?: string | null;
  /** Categoría de la plantilla; marketing usa el endpoint /marketing_messages de Meta. */
  templateCategory?: TemplateCategory;
  /** Solo aplica en plantillas marketing. Ver docs de Meta Marketing Messages API. */
  productPolicy?: ProductPolicy;
  messageActivitySharing?: boolean;
}

export interface SendTextInput {
  to: string;
  text: string;
  /** Responde en hilo al mensaje indicado (context.message_id de Meta). */
  replyToMessageId?: string;
}

export type MediaMessageType = 'image' | 'audio' | 'video' | 'document' | 'sticker';

export interface SendMediaInput {
  to: string;
  type: MediaMessageType;
  /** URL pública del archivo (alternativa a id). */
  link?: string;
  /** ID de media subido previamente a Meta (alternativa a link). */
  id?: string;
  caption?: string;
  filename?: string;
  replyToMessageId?: string;
}

export interface SendInteractiveInput {
  to: string;
  interactive: {
    type: 'button' | 'list';
    header?: { type: 'text'; text: string };
    body: { text: string };
    footer?: { text: string };
    action: Record<string, unknown>;
  };
  replyToMessageId?: string;
}

/** Payload crudo compatible con POST /{version}/{phone-id}/messages de Meta. */
export type MetaCloudMessagePayload = Record<string, unknown> & {
  messaging_product: 'whatsapp';
  recipient_type: 'individual' | 'group';
  to: string;
  type: string;
};

export interface SendResult {
  messageId: string;
  /** Estado inicial devuelto por Meta en marketing_messages (accepted, held_for_quality_assessment, paused). */
  messageStatus?: MetaMessageStatus;
}

/** Contrato común para todos los proveedores de envío (simulation | meta-cloud | evolution). */
export interface MessageProvider {
  readonly name: string;
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
  sendText(input: SendTextInput): Promise<SendResult>;
  sendMedia(input: SendMediaInput): Promise<SendResult>;
  sendInteractive(input: SendInteractiveInput): Promise<SendResult>;
  /** Envía un payload tal cual a Meta POST /messages (solo meta-cloud). */
  sendCloudMessage?(input: MetaCloudMessagePayload): Promise<SendResult>;
}
