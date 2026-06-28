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

export type UserApprovalStatus = 'pendiente' | 'aprobado' | 'rechazado';

export interface User {
  id: string;
  nombre: string;
  email: string;
  passwordHash?: string;
  rol: Role;
  activo: boolean;
  estadoAprobacion: UserApprovalStatus;
  mfaEnabled: boolean;
  totpSecret?: string | null;
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

export interface Template {
  id: string;
  nombreMeta: string;
  idioma: string;
  categoria: 'marketing' | 'utility' | 'authentication';
  estado: 'borrador' | 'pendiente' | 'aprobada' | 'rechazada';
  headerTipo: 'none' | 'text' | 'image';
  headerUrl: string | null;
  headerText: string | null;
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

export interface CampaignSettings {
  sendRatePerSecond: number;
  releaseBatchSize: number;
  productPolicy: 'CLOUD_API_FALLBACK' | 'STRICT' | null;
  messageActivitySharing: boolean | null;
  updatedAt: Date;
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

export interface BotConfig {
  id: string;
  mensajeCierre: string;
  enviarMensajeCierre: boolean;
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

export interface PersonaCategoria {
  slug: string;
  nombre: string;
  descripcion: string | null;
  color: string | null;
  activo: boolean;
  orden: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Persona {
  id: string;
  nombre: string;
  telefono: string;
  categoriaSlug: string;
  activo: boolean;
  notas: string | null;
  metadata: Record<string, unknown>;
  origen: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PagoEstado = 'pendiente' | 'pagado' | 'cancelado';

export interface Pago {
  id: string;
  personaId: string;
  estado: PagoEstado;
  monto: number | null;
  moneda: string;
  concepto: string | null;
  fechaVencimiento: Date | null;
  fechaPago: Date | null;
  referencia: string | null;
  notas: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonasConfig {
  id: string;
  defaultCountryCode: string;
  autoPagoPendiente: boolean;
  categoriaPendientesSlug: string;
  syncToClients: boolean;
  updatedAt: Date;
}
