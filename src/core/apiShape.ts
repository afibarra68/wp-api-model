/** Serializa fechas como ISO string (compatible con el frontend). */
export function toIso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

/** Añade _id y createdAt/updatedAt en formato API (antes Mongoose). */
export function withMongoShape<T extends Record<string, unknown>>(
  row: T & { id: string; createdAt: Date; updatedAt?: Date },
): T & { _id: string; createdAt: string; updatedAt?: string } {
  const { id, createdAt, updatedAt, ...rest } = row;
  return {
    ...rest,
    _id: id,
    createdAt: toIso(createdAt)!,
    ...(updatedAt != null ? { updatedAt: toIso(updatedAt)! } : {}),
  } as unknown as T & { _id: string; createdAt: string; updatedAt?: string };
}
