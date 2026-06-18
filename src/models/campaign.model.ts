import { Schema, model, InferSchemaType } from 'mongoose';

const mapeoSchema = new Schema(
  {
    indice: { type: Number, required: true },
    origen: { type: String, enum: ['campo', 'fijo', 'metadata'], required: true },
    valor: { type: String, required: true },
  },
  { _id: false },
);

const campaignSchema = new Schema(
  {
    nombre_campana: { type: String, required: true, trim: true },
    plantilla_id: { type: Schema.Types.ObjectId, ref: 'Template', required: true },
    segmento: {
      etiquetas: { type: [String], default: [] },
      solo_activos: { type: Boolean, default: true },
    },
    mapeo_variables: { type: [mapeoSchema], default: [] },
    estado: {
      type: String,
      enum: ['borrador', 'en_progreso', 'pausada', 'finalizada', 'error'],
      default: 'borrador',
      index: true,
    },
    metricas: {
      total: { type: Number, default: 0 },
      encolados: { type: Number, default: 0 },
      enviados: { type: Number, default: 0 },
      entregados: { type: Number, default: 0 },
      leidos: { type: Number, default: 0 },
      fallidos: { type: Number, default: 0 },
    },
    fecha_lanzamiento: { type: Date, default: null },
    fecha_finalizacion: { type: Date, default: null },
  },
  { timestamps: true },
);

export type CampaignDoc = InferSchemaType<typeof campaignSchema>;
export const Campaign = model('Campaign', campaignSchema);
