import { Schema, model, InferSchemaType } from 'mongoose';

const clientSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    telefono: { type: String, required: true, unique: true, trim: true },
    activo: { type: Boolean, default: true, index: true },
    opt_in: { type: Boolean, default: true, index: true },
    opt_out_fecha: { type: Date, default: null },
    etiquetas: { type: [String], default: [], index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    fecha_registro: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export type ClientDoc = InferSchemaType<typeof clientSchema>;
export const Client = model('Client', clientSchema);
