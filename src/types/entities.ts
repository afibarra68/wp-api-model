export const ESTADOS_MENSAJE = [
  'encolado',
  'enviado',
  'entregado',
  'leido',
  'fallido',
] as const;

export type EstadoMensaje = (typeof ESTADOS_MENSAJE)[number];

export const ORDEN_ESTADO: Record<EstadoMensaje, number> = {
  encolado: 0,
  enviado: 1,
  entregado: 2,
  leido: 3,
  fallido: 4,
};

export type Role = 'admin' | 'operador' | 'agente';

export interface User {
  id: string;
  nombre: string;
  email: string;
  passwordHash?: string;
  rol: Role;
  activo: boolean;
  ultimoLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Client {
  id: string;
  nombre: string;
  telefono: string;
  activo: boolean;
  optIn: boolean;
  optOutFecha: Date | null;
  etiquetas: string[];
  metadata: Record<string, unknown>;
  fechaRegistro: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVariable {
  indice: number;
  nombre: string;
  ejemplo?: string;
}

/** Botón de plantilla Meta (quick reply, URL o teléfono). */
export interface TemplateButton {
  tipo: 'quick_reply' | 'url' | 'phone';
  texto: string;
  url?: string | null;
  telefono?: string | null;
}

export interface Template {
  id: string;
  nombreMeta: string;
  idioma: string;
  categoria: 'marketing' | 'utility' | 'authentication';
  estado: 'borrador' | 'pendiente' | 'aprobada' | 'rechazada';
  headerTipo: 'none' | 'image' | 'text';
  headerUrl: string | null;
  headerText: string | null;
  footer: string | null;
  botones: TemplateButton[];
  cuerpo: string;
  variables: TemplateVariable[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignMapeo {
  indice: number;
  origen: 'campo' | 'fijo' | 'metadata';
  valor: string;
}

export interface CampaignSegmento {
  etiquetas: string[];
  soloActivos: boolean;
}

export interface CampaignMetricas {
  total: number;
  encolados: number;
  enviados: number;
  entregados: number;
  leidos: number;
  fallidos: number;
}

export interface Campaign {
  id: string;
  nombreCampana: string;
  plantillaId: string;
  integrationId: string | null;
  segmento: CampaignSegmento;
  mapeoVariables: CampaignMapeo[];
  estado: 'borrador' | 'en_progreso' | 'pausada' | 'finalizada' | 'error';
  metricas: CampaignMetricas;
  fechaLanzamiento: Date | null;
  fechaFinalizacion: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HistorialEstado {
  estado: EstadoMensaje;
  fecha: Date | string;
}

export interface MessageLog {
  id: string;
  campanaId: string;
  clienteId: string;
  telefono: string;
  whatsappMessageId: string | null;
  metaMessageStatus: 'accepted' | 'held_for_quality_assessment' | 'paused' | null;
  estadoActual: EstadoMensaje;
  error: string | null;
  historialEstados: HistorialEstado[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  clienteId: string;
  telefono: string;
  ventanaAbiertaHasta: Date | null;
  modo: 'bot' | 'humano';
  ultimoMensajeEntrante: string | null;
  ultimaActividad: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationMessageOrigen = 'cliente' | 'bot' | 'agente' | 'sistema';

export interface ConversationMessage {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  origen: ConversationMessageOrigen;
  texto: string;
  whatsappMessageId: string | null;
  estado: 'enviado' | 'entregado' | 'leido' | 'fallido' | null;
  createdAt: Date;
}

export interface BotRule {
  id: string;
  nombre: string;
  palabrasClave: string[];
  respuestaTipo: 'texto';
  respuesta: string;
  activo: boolean;
  prioridad: number;
  createdAt: Date;
  updatedAt: Date;
}
