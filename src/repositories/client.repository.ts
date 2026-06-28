import { getPool } from '../core/postgres';
import type { Client } from '../types/entities';

type Row = {
  id: string;
  nombre: string;
  telefono: string;
  activo: boolean;
  opt_in: boolean;
  opt_out_fecha: Date | null;
  etiquetas: string[];
  metadata: Record<string, unknown>;
  fecha_registro: Date;
  created_at: Date;
  updated_at: Date;
};

function mapRow(r: Row): Client {
  return {
    id: r.id,
    nombre: r.nombre,
    telefono: r.telefono,
    activo: r.activo,
    optIn: r.opt_in,
    optOutFecha: r.opt_out_fecha,
    etiquetas: r.etiquetas ?? [],
    metadata: r.metadata ?? {},
    fechaRegistro: r.fecha_registro,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const FIELDS =
  'id, nombre, telefono, activo, opt_in, opt_out_fecha, etiquetas, metadata, fecha_registro, created_at, updated_at';

export interface ClientFilter {
  activo?: boolean;
  etiqueta?: string;
  search?: string;
}

function buildWhere(filter: ClientFilter): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filter.activo !== undefined) {
    clauses.push(`activo = $${i++}`);
    params.push(filter.activo);
  }
  if (filter.etiqueta) {
    clauses.push(`$${i++} = ANY(etiquetas)`);
    params.push(filter.etiqueta);
  }
  if (filter.search) {
    clauses.push(`(nombre ILIKE $${i} OR telefono LIKE $${i})`);
    params.push(`%${filter.search}%`);
    i++;
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export async function countClients(filter: ClientFilter = {}): Promise<number> {
  const { sql, params } = buildWhere(filter);
  const { rows } = await getPool().query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM clients ${sql}`,
    params,
  );
  return Number(rows[0]?.c ?? 0);
}

export async function findClients(
  filter: ClientFilter,
  page: number,
  limit: number,
): Promise<Client[]> {
  const { sql, params } = buildWhere(filter);
  const offset = (page - 1) * limit;
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM clients ${sql} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  return rows.map(mapRow);
}

export async function findClientById(id: string): Promise<Client | null> {
  const { rows } = await getPool().query<Row>(`SELECT ${FIELDS} FROM clients WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findClientByTelefono(telefono: string): Promise<Client | null> {
  const { rows } = await getPool().query<Row>(`SELECT ${FIELDS} FROM clients WHERE telefono = $1`, [
    telefono,
  ]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findClientsForSegment(filter: {
  activo?: boolean;
  optIn?: boolean;
  etiquetas?: string[];
}): Promise<Client[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filter.activo !== undefined) {
    clauses.push(`activo = $${i++}`);
    params.push(filter.activo);
  }
  if (filter.optIn !== undefined) {
    clauses.push(`opt_in = $${i++}`);
    params.push(filter.optIn);
  }
  if (filter.etiquetas && filter.etiquetas.length > 0) {
    clauses.push(`etiquetas && $${i++}::text[]`);
    params.push(filter.etiquetas);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM clients ${where}`,
    params,
  );
  return rows.map(mapRow);
}

export async function countClientsForSegment(filter: {
  activo?: boolean;
  optIn?: boolean;
  etiquetas?: string[];
}): Promise<number> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filter.activo !== undefined) {
    clauses.push(`activo = $${i++}`);
    params.push(filter.activo);
  }
  if (filter.optIn !== undefined) {
    clauses.push(`opt_in = $${i++}`);
    params.push(filter.optIn);
  }
  if (filter.etiquetas && filter.etiquetas.length > 0) {
    clauses.push(`etiquetas && $${i++}::text[]`);
    params.push(filter.etiquetas);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await getPool().query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM clients ${where}`,
    params,
  );
  return Number(rows[0]?.c ?? 0);
}

export async function findOneClientForSegment(filter: {
  activo?: boolean;
  optIn?: boolean;
  etiquetas?: string[];
}): Promise<Client | null> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filter.activo !== undefined) {
    clauses.push(`activo = $${i++}`);
    params.push(filter.activo);
  }
  if (filter.optIn !== undefined) {
    clauses.push(`opt_in = $${i++}`);
    params.push(filter.optIn);
  }
  if (filter.etiquetas && filter.etiquetas.length > 0) {
    clauses.push(`etiquetas && $${i++}::text[]`);
    params.push(filter.etiquetas);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM clients ${where} LIMIT 1`,
    params,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createClient(input: {
  nombre: string;
  telefono: string;
  optIn?: boolean;
  etiquetas?: string[];
  metadata?: Record<string, unknown>;
}): Promise<Client> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO clients (nombre, telefono, opt_in, etiquetas, metadata)
     VALUES ($1,$2,$3,$4,$5) RETURNING ${FIELDS}`,
    [
      input.nombre,
      input.telefono,
      input.optIn ?? true,
      input.etiquetas ?? [],
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return mapRow(rows[0]);
}

export async function bulkUpsertClients(
  clientes: Array<{
    nombre: string;
    telefono: string;
    opt_in?: boolean;
    etiquetas?: string[];
    metadata?: Record<string, unknown>;
  }>,
): Promise<{ insertados: number; actualizados: number }> {
  const pool = getPool();
  const client = await pool.connect();
  let insertados = 0;
  let actualizados = 0;
  try {
    await client.query('BEGIN');
    for (const c of clientes) {
      const { rows } = await client.query<{ is_insert: boolean }>(
        `INSERT INTO clients (nombre, telefono, opt_in, etiquetas, metadata)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (telefono) DO UPDATE SET
           nombre = EXCLUDED.nombre,
           opt_in = EXCLUDED.opt_in,
           etiquetas = EXCLUDED.etiquetas,
           metadata = EXCLUDED.metadata
         RETURNING (xmax = 0) AS is_insert`,
        [
          c.nombre,
          c.telefono,
          c.opt_in ?? true,
          c.etiquetas ?? [],
          JSON.stringify(c.metadata ?? {}),
        ],
      );
      if (rows[0]?.is_insert) insertados++;
      else actualizados++;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { insertados, actualizados };
}

export async function updateClient(
  id: string,
  patch: Partial<{
    nombre: string;
    etiquetas: string[];
    metadata: Record<string, unknown>;
    activo: boolean;
    optIn: boolean;
    optOutFecha: Date | null;
  }>,
): Promise<Client | null> {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  let i = 2;
  if (patch.nombre !== undefined) { sets.push(`nombre = $${i++}`); vals.push(patch.nombre); }
  if (patch.etiquetas !== undefined) { sets.push(`etiquetas = $${i++}`); vals.push(patch.etiquetas); }
  if (patch.metadata !== undefined) { sets.push(`metadata = $${i++}`); vals.push(JSON.stringify(patch.metadata)); }
  if (patch.activo !== undefined) { sets.push(`activo = $${i++}`); vals.push(patch.activo); }
  if (patch.optIn !== undefined) { sets.push(`opt_in = $${i++}`); vals.push(patch.optIn); }
  if (patch.optOutFecha !== undefined) { sets.push(`opt_out_fecha = $${i++}`); vals.push(patch.optOutFecha); }
  if (sets.length === 0) return findClientById(id);
  const { rows } = await getPool().query<Row>(
    `UPDATE clients SET ${sets.join(', ')} WHERE id = $1 RETURNING ${FIELDS}`,
    vals,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteClient(id: string): Promise<boolean> {
  const { rowCount } = await getPool().query('DELETE FROM clients WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

export async function deleteAllClients(): Promise<number> {
  const { rowCount } = await getPool().query('DELETE FROM clients');
  return rowCount ?? 0;
}

export async function countAllClients(): Promise<number> {
  return countClients();
}
