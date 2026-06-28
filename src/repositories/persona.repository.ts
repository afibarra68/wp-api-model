import { getPool } from '../core/postgres';
import type { Persona, PersonaCategoria, PersonasConfig } from '../types/entities';

type CatRow = {
  slug: string;
  nombre: string;
  descripcion: string | null;
  color: string | null;
  activo: boolean;
  orden: number;
  created_at: Date;
  updated_at: Date;
};

function mapCat(r: CatRow): PersonaCategoria {
  return {
    slug: r.slug,
    nombre: r.nombre,
    descripcion: r.descripcion,
    color: r.color,
    activo: r.activo,
    orden: r.orden,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type Row = {
  id: string;
  nombre: string;
  telefono: string;
  categoria_slug: string;
  activo: boolean;
  notas: string | null;
  metadata: Record<string, unknown>;
  origen: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapRow(r: Row): Persona {
  return {
    id: r.id,
    nombre: r.nombre,
    telefono: r.telefono,
    categoriaSlug: r.categoria_slug,
    activo: r.activo,
    notas: r.notas,
    metadata: r.metadata ?? {},
    origen: r.origen,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const FIELDS = `id, nombre, telefono, categoria_slug, activo, notas, metadata, origen, created_at, updated_at`;

export interface PersonaFilter {
  categoriaSlug?: string;
  activo?: boolean;
  search?: string;
}

function buildWhere(filter: PersonaFilter): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filter.categoriaSlug) {
    clauses.push(`categoria_slug = $${i++}`);
    params.push(filter.categoriaSlug);
  }
  if (filter.activo !== undefined) {
    clauses.push(`activo = $${i++}`);
    params.push(filter.activo);
  }
  if (filter.search) {
    clauses.push(`(nombre ILIKE $${i} OR telefono LIKE $${i})`);
    params.push(`%${filter.search}%`);
    i++;
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export async function findCategorias(): Promise<PersonaCategoria[]> {
  const { rows } = await getPool().query<CatRow>(
    `SELECT slug, nombre, descripcion, color, activo, orden, created_at, updated_at
     FROM persona_categorias WHERE activo = TRUE ORDER BY orden, nombre`,
  );
  return rows.map(mapCat);
}

export async function findAllCategorias(): Promise<PersonaCategoria[]> {
  const { rows } = await getPool().query<CatRow>(
    `SELECT slug, nombre, descripcion, color, activo, orden, created_at, updated_at
     FROM persona_categorias ORDER BY orden, nombre`,
  );
  return rows.map(mapCat);
}

export async function countPersonas(filter: PersonaFilter = {}): Promise<number> {
  const { sql, params } = buildWhere(filter);
  const { rows } = await getPool().query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM personas ${sql}`,
    params,
  );
  return Number(rows[0]?.c ?? 0);
}

export async function findPersonas(
  filter: PersonaFilter,
  page: number,
  limit: number,
): Promise<Persona[]> {
  const { sql, params } = buildWhere(filter);
  const offset = (page - 1) * limit;
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM personas ${sql} ORDER BY nombre ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  return rows.map(mapRow);
}

export async function findPersonaById(id: string): Promise<Persona | null> {
  const { rows } = await getPool().query<Row>(`SELECT ${FIELDS} FROM personas WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findPersonaByTelefono(telefono: string): Promise<Persona | null> {
  const { rows } = await getPool().query<Row>(`SELECT ${FIELDS} FROM personas WHERE telefono = $1`, [
    telefono,
  ]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createPersona(input: {
  nombre: string;
  telefono: string;
  categoriaSlug: string;
  activo?: boolean;
  notas?: string;
  metadata?: Record<string, unknown>;
  origen?: string;
}): Promise<Persona> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO personas (nombre, telefono, categoria_slug, activo, notas, metadata, origen)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${FIELDS}`,
    [
      input.nombre,
      input.telefono,
      input.categoriaSlug,
      input.activo ?? true,
      input.notas ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.origen ?? null,
    ],
  );
  return mapRow(rows[0]);
}

export async function updatePersona(
  id: string,
  input: Partial<{
    nombre: string;
    telefono: string;
    categoriaSlug: string;
    activo: boolean;
    notas: string | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<Persona | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  let i = 2;
  if (input.nombre !== undefined) {
    sets.push(`nombre = $${i++}`);
    params.push(input.nombre);
  }
  if (input.telefono !== undefined) {
    sets.push(`telefono = $${i++}`);
    params.push(input.telefono);
  }
  if (input.categoriaSlug !== undefined) {
    sets.push(`categoria_slug = $${i++}`);
    params.push(input.categoriaSlug);
  }
  if (input.activo !== undefined) {
    sets.push(`activo = $${i++}`);
    params.push(input.activo);
  }
  if (input.notas !== undefined) {
    sets.push(`notas = $${i++}`);
    params.push(input.notas);
  }
  if (input.metadata !== undefined) {
    sets.push(`metadata = $${i++}`);
    params.push(JSON.stringify(input.metadata));
  }
  if (!sets.length) return findPersonaById(id);
  const { rows } = await getPool().query<Row>(
    `UPDATE personas SET ${sets.join(', ')} WHERE id = $1 RETURNING ${FIELDS}`,
    params,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deletePersona(id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(`DELETE FROM personas WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function bulkUpsertPersonas(
  items: Array<{
    nombre: string;
    telefono: string;
    categoriaSlug: string;
    notas?: string;
    metadata?: Record<string, unknown>;
    origen?: string;
  }>,
): Promise<{ insertados: number; actualizados: number }> {
  const pool = getPool();
  const client = await pool.connect();
  let insertados = 0;
  let actualizados = 0;
  try {
    await client.query('BEGIN');
    for (const p of items) {
      const { rows } = await client.query<{ is_insert: boolean }>(
        `INSERT INTO personas (nombre, telefono, categoria_slug, notas, metadata, origen)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (telefono) DO UPDATE SET
           nombre = EXCLUDED.nombre,
           categoria_slug = EXCLUDED.categoria_slug,
           notas = COALESCE(EXCLUDED.notas, personas.notas),
           metadata = personas.metadata || EXCLUDED.metadata,
           origen = COALESCE(EXCLUDED.origen, personas.origen)
         RETURNING (xmax = 0) AS is_insert`,
        [
          p.nombre,
          p.telefono,
          p.categoriaSlug,
          p.notas ?? null,
          JSON.stringify(p.metadata ?? {}),
          p.origen ?? null,
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

type ConfigRow = {
  id: string;
  default_country_code: string;
  auto_pago_pendiente: boolean;
  categoria_pendientes_slug: string;
  sync_to_clients: boolean;
  updated_at: Date;
};

function mapConfig(r: ConfigRow): PersonasConfig {
  return {
    id: r.id,
    defaultCountryCode: r.default_country_code,
    autoPagoPendiente: r.auto_pago_pendiente,
    categoriaPendientesSlug: r.categoria_pendientes_slug,
    syncToClients: r.sync_to_clients,
    updatedAt: r.updated_at,
  };
}

export async function getPersonasConfig(): Promise<PersonasConfig> {
  const { rows } = await getPool().query<ConfigRow>(
    `SELECT id, default_country_code, auto_pago_pendiente, categoria_pendientes_slug,
            sync_to_clients, updated_at FROM personas_config WHERE id = 'default'`,
  );
  if (!rows[0]) throw new Error('personas_config no inicializada');
  return mapConfig(rows[0]);
}

export async function updatePersonasConfig(input: Partial<{
  defaultCountryCode: string;
  autoPagoPendiente: boolean;
  categoriaPendientesSlug: string;
  syncToClients: boolean;
}>): Promise<PersonasConfig> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.defaultCountryCode !== undefined) {
    sets.push(`default_country_code = $${i++}`);
    params.push(input.defaultCountryCode);
  }
  if (input.autoPagoPendiente !== undefined) {
    sets.push(`auto_pago_pendiente = $${i++}`);
    params.push(input.autoPagoPendiente);
  }
  if (input.categoriaPendientesSlug !== undefined) {
    sets.push(`categoria_pendientes_slug = $${i++}`);
    params.push(input.categoriaPendientesSlug);
  }
  if (input.syncToClients !== undefined) {
    sets.push(`sync_to_clients = $${i++}`);
    params.push(input.syncToClients);
  }
  if (!sets.length) return getPersonasConfig();
  const { rows } = await getPool().query<ConfigRow>(
    `UPDATE personas_config SET ${sets.join(', ')} WHERE id = 'default'
     RETURNING id, default_country_code, auto_pago_pendiente, categoria_pendientes_slug,
               sync_to_clients, updated_at`,
    params,
  );
  return mapConfig(rows[0]);
}

export async function findPersonasByCategoria(categoriaSlug: string): Promise<Persona[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM personas WHERE categoria_slug = $1 AND activo = TRUE ORDER BY nombre`,
    [categoriaSlug],
  );
  return rows.map(mapRow);
}
