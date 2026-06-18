import { Schema, model, InferSchemaType } from 'mongoose';

export const ESTADOS_MENSAJE = [
  'encolado',
  'enviado',
  'entregado',
  'leido',
  'fallido',
] as const;

export type EstadoMensaje = (typeof ESTADOS_MENSAJE)[number];

/** Orden monotónico de estados: nunca se retrocede. */
export const ORDEN_ESTADO: Record<EstadoMensaje, number> = {
  encolado: 0,
  enviado: 1,
  entregado: 2,
  leido: 3,
  fallido: 4,
};

const historialSchema = new Schema(
  {
    estado: { type: String, enum: ESTADOS_MENSAJE, required: true },
    fecha: { type: Date, default: Date.now },
  },
  { _id: false },
);

const messageLogSchema = new Schema(
  {
    campana_id: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    cliente_id: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    telefono: { type: String, required: true },
    whatsapp_message_id: { type: String, default: null, index: true, sparse: true },
    /** Estado inicial de Meta (marketing_messages): accepted | held_for_quality_assessment | paused */
    meta_message_status: {
      type: String,
      enum: ['accepted', 'held_for_quality_assessment', 'paused'],
      default: null,
    },
    estado_actual: { type: String, enum: ESTADOS_MENSAJE, default: 'encolado', index: true },
    error: { type: String, default: null },
    historial_estados: { type: [historialSchema], default: [] },
  },
  { timestamps: true },
);

export type MessageLogDoc = InferSchemaType<typeof messageLogSchema>;
export const MessageLog = model('MessageLog', messageLogSchema);
