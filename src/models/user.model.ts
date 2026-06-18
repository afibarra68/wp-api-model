import { Schema, model, InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true, select: false },
    rol: { type: String, enum: ['admin', 'operador', 'agente'], default: 'agente' },
    activo: { type: Boolean, default: true },
    ultimo_login: { type: Date, default: null },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
