import { Schema, model, InferSchemaType } from 'mongoose';

const conversationSchema = new Schema(
  {
    cliente_id: { type: Schema.Types.ObjectId, ref: 'Client', required: true, unique: true },
    telefono: { type: String, required: true, index: true },
    ventana_abierta_hasta: { type: Date, default: null },
    modo: { type: String, enum: ['bot', 'humano'], default: 'bot' },
    ultimo_mensaje_entrante: { type: String, default: null },
    ultima_actividad: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export type ConversationDoc = InferSchemaType<typeof conversationSchema>;
export const Conversation = model('Conversation', conversationSchema);
