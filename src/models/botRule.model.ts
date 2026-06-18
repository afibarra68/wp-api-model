import { Schema, model, InferSchemaType } from 'mongoose';

const botRuleSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    palabras_clave: { type: [String], default: [] },
    respuesta_tipo: { type: String, enum: ['texto'], default: 'texto' },
    respuesta: { type: String, required: true },
    activo: { type: Boolean, default: true },
    prioridad: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type BotRuleDoc = InferSchemaType<typeof botRuleSchema>;
export const BotRule = model('BotRule', botRuleSchema);
