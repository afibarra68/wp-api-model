import { Schema, model, InferSchemaType } from 'mongoose';

const variableSchema = new Schema(
  {
    indice: { type: Number, required: true },
    nombre: { type: String, required: true },
    ejemplo: { type: String, default: '' },
  },
  { _id: false },
);

const templateSchema = new Schema(
  {
    nombre_meta: { type: String, required: true, trim: true },
    idioma: { type: String, required: true, default: 'es' },
    categoria: {
      type: String,
      enum: ['marketing', 'utility', 'authentication'],
      default: 'utility',
    },
    estado: {
      type: String,
      enum: ['borrador', 'pendiente', 'aprobada', 'rechazada'],
      default: 'borrador',
    },
    // Encabezado opcional (banner). 'image' = imagen vía URL pública.
    header_tipo: { type: String, enum: ['none', 'image'], default: 'none' },
    header_url: { type: String, default: null },
    cuerpo: { type: String, required: true },
    variables: { type: [variableSchema], default: [] },
  },
  { timestamps: true },
);

templateSchema.index({ nombre_meta: 1, idioma: 1 }, { unique: true });

export type TemplateDoc = InferSchemaType<typeof templateSchema>;
export const Template = model('Template', templateSchema);
