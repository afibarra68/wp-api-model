import { toIso, withMongoShape } from '../core/apiShape';
import type {
  BotConfig,
  BotRule,
  Campaign,
  Client,
  Conversation,
  ConversationMessage,
  MessageLog,
  Pago,
  Persona,
  PersonaCategoria,
  PersonasConfig,
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
    estado_aprobacion: u.estadoAprobacion,
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
    config_envio: c.configEnvio
      ? {
          tope_diario: c.configEnvio.topeDiario,
          dias_estimados: c.configEnvio.diasEstimados,
          ventana_inicio: c.configEnvio.ventanaInicio,
          enviados_en_ventana: c.configEnvio.enviadosEnVentana,
          intervalo_min_seg: c.configEnvio.intervaloMinSeg ?? 1,
          intervalo_max_seg: c.configEnvio.intervaloMaxSeg ?? 10,
        }
      : c.configPreferencias.topeDiario ||
          c.configPreferencias.diasPlanificados ||
          c.configPreferencias.intervaloMinSeg ||
          c.configPreferencias.intervaloMaxSeg
        ? {
            tope_diario: c.configPreferencias.topeDiario ?? null,
            dias_planificados: c.configPreferencias.diasPlanificados ?? null,
            intervalo_min_seg: c.configPreferencias.intervaloMinSeg ?? 1,
            intervalo_max_seg: c.configPreferencias.intervaloMaxSeg ?? 10,
          }
        : null,
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

export function serializeConversation(c: Conversation, extra?: Record<string, unknown>) {
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
    ...extra,
  });
}

export function serializeConversationMessage(m: ConversationMessage) {
  return withMongoShape({
    id: m.id,
    conversation_id: m.conversationId,
    direction: m.direction,
    origen: m.origen,
    texto: m.texto,
    whatsapp_message_id: m.whatsappMessageId,
    estado: m.estado,
    createdAt: m.createdAt,
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

export function serializeBotConfig(c: BotConfig) {
  return {
    mensaje_cierre: c.mensajeCierre,
    enviar_mensaje_cierre: c.enviarMensajeCierre,
    updated_at: toIso(c.updatedAt),
  };
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

export function serializePersonaCategoria(c: PersonaCategoria) {
  return withMongoShape({
    id: c.slug,
    slug: c.slug,
    nombre: c.nombre,
    descripcion: c.descripcion,
    color: c.color,
    activo: c.activo,
    orden: c.orden,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  });
}

export function serializePersona(p: Persona) {
  return withMongoShape({
    id: p.id,
    nombre: p.nombre,
    telefono: p.telefono,
    categoria_slug: p.categoriaSlug,
    activo: p.activo,
    notas: p.notas,
    metadata: p.metadata,
    origen: p.origen,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  });
}

export function serializePersonasConfig(c: PersonasConfig) {
  return {
    default_country_code: c.defaultCountryCode,
    auto_pago_pendiente: c.autoPagoPendiente,
    categoria_pendientes_slug: c.categoriaPendientesSlug,
    sync_to_clients: c.syncToClients,
    updated_at: toIso(c.updatedAt),
  };
}

export function serializePago(
  p: Pago & { personaNombre?: string; personaTelefono?: string; categoriaSlug?: string },
) {
  return withMongoShape({
    id: p.id,
    persona_id: p.personaId,
    estado: p.estado,
    monto: p.monto,
    moneda: p.moneda,
    concepto: p.concepto,
    fecha_vencimiento: p.fechaVencimiento,
    fecha_pago: p.fechaPago,
    referencia: p.referencia,
    notas: p.notas,
    metadata: p.metadata,
    persona_nombre: p.personaNombre ?? null,
    persona_telefono: p.personaTelefono ?? null,
    categoria_slug: p.categoriaSlug ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  });
}

export { toIso };
