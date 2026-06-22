import { toIso, withMongoShape } from '../core/apiShape';
import type {
  BotRule,
  Campaign,
  Client,
  Conversation,
  MessageLog,
  Template,
  User,
} from '../types/entities';

export function serializeUser(u: User) {
  return withMongoShape({
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    activo: u.activo,
    ultimo_login: u.ultimoLogin,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  });
}

export function serializeClient(c: Client) {
  return withMongoShape({
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono,
    activo: c.activo,
    opt_in: c.optIn,
    opt_out_fecha: c.optOutFecha,
    etiquetas: c.etiquetas,
    metadata: c.metadata,
    fecha_registro: c.fechaRegistro,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  });
}

export function serializeTemplate(t: Template) {
  return withMongoShape({
    id: t.id,
    nombre_meta: t.nombreMeta,
    idioma: t.idioma,
    categoria: t.categoria,
    estado: t.estado,
    header_tipo: t.headerTipo,
    header_url: t.headerUrl,
    header_text: t.headerText,
    footer: t.footer,
    botones: t.botones,
    cuerpo: t.cuerpo,
    variables: t.variables,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  });
}

export function serializeCampaign(c: Campaign) {
  return withMongoShape({
    id: c.id,
    nombre_campana: c.nombreCampana,
    plantilla_id: c.plantillaId,
    segmento: {
      etiquetas: c.segmento.etiquetas,
      solo_activos: c.segmento.soloActivos,
    },
    mapeo_variables: c.mapeoVariables,
    estado: c.estado,
    metricas: c.metricas,
    fecha_lanzamiento: c.fechaLanzamiento,
    fecha_finalizacion: c.fechaFinalizacion,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  });
}

export function serializeMessageLog(l: MessageLog) {
  return withMongoShape({
    id: l.id,
    campana_id: l.campanaId,
    cliente_id: l.clienteId,
    telefono: l.telefono,
    whatsapp_message_id: l.whatsappMessageId,
    meta_message_status: l.metaMessageStatus,
    estado_actual: l.estadoActual,
    error: l.error,
    historial_estados: l.historialEstados,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  });
}

export function serializeConversation(c: Conversation) {
  return withMongoShape({
    id: c.id,
    cliente_id: c.clienteId,
    telefono: c.telefono,
    ventana_abierta_hasta: c.ventanaAbiertaHasta,
    modo: c.modo,
    ultimo_mensaje_entrante: c.ultimoMensajeEntrante,
    ultima_actividad: c.ultimaActividad,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  });
}

export function serializeBotRule(r: BotRule) {
  return withMongoShape({
    id: r.id,
    nombre: r.nombre,
    palabras_clave: r.palabrasClave,
    respuesta_tipo: r.respuestaTipo,
    respuesta: r.respuesta,
    activo: r.activo,
    prioridad: r.prioridad,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });
}

/** Cliente en forma plana para resolveVariables (campos snake_case). */
export function clientForMapeo(c: Client): Record<string, unknown> {
  return {
    nombre: c.nombre,
    telefono: c.telefono,
    activo: c.activo,
    opt_in: c.optIn,
    metadata: c.metadata,
  };
}

export { toIso };
