import { getPool } from '../core/postgres';
import type { Pago, PagoEstado } from '../types/entities';

type Row = {
  id: string;
  persona_id: string;
  estado: PagoEstado;
  monto: string | null;
  moneda: string;
  concepto: string | null;
  fecha_vencimiento: Date | null;
  fecha_pago: Date | null;
  referencia: string | null;
  notas: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type EnrichedRow = Row & {
  persona_nombre: string;
  persona_telefono: string;
  categoria_slug: string;
};

function mapRow(r: Row): Pago {
  return {
    id: r.id,
    personaId: r.persona_id,
    estado: r.estado,
    monto: r.monto != null ? Number(r.monto) : null,
    moneda: r.moneda,
    concepto: r.concepto,
    fechaVencimiento: r.fecha_vencimiento,
    fechaPago: r.fecha_pago,
    referencia: r.referencia,
    notas: r.notas,
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type PagoWithPersona = Pago & {
  personaNombre: string;
  personaTelefono: string;
  categoriaSlug: string;
};

function mapEnriched(r: EnrichedRow): PagoWithPersona {
  return {
    ...mapRow(r),
    personaNombre: r.persona_nombre,
    personaTelefono: r.persona_telefono,
    categoriaSlug: r.categoria_slug,
  };
}

const FIELDS = `p.id, p.persona_id, p.estado, p.monto, p.moneda, p.concepto,
  p.fecha_vencimiento, p.fecha_pago, p.referencia, p.notas, p.metadata, p.created_at, p.updated_at`;

export interface PagoFilter {
  estado?: PagoEstado;
  personaId?: string;
  categoriaSlug?: string;
  search?: string;
}

function buildWhere(filter: PagoFilter): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filter.estado) {
    clauses.push(`p.estado = $${i++}`);
    params.push(filter.estado);
  }
  if (filter.personaId) {
    clauses.push(`p.persona_id = $${i++}`);
    params.push(filter.personaId);
  }
  if (filter.categoriaSlug) {
    clauses.push(`pe.categoria_slug = $${i++}`);
    params.push(filter.categoriaSlug);
  }
  if (filter.search) {
    clauses.push(`(pe.nombre ILIKE $${i} OR pe.telefono LIKE $${i} OR p.referencia ILIKE $${i})`);
    params.push(`%${filter.search}%`);
    i++;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { sql: where, params };
}

export async function countPagos(filter: PagoFilter = {}): Promise<number> {
  const { sql, params } = buildWhere(filter);
  const { rows } = await getPool().query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM pagos p
     JOIN personas pe ON pe.id = p.persona_id ${sql}`,
    params,
  );
  return Number(rows[0]?.c ?? 0);
}

export async function findPagos(
  filter: PagoFilter,
  page: number,
  limit: number,
): Promise<PagoWithPersona[]> {
  const { sql, params } = buildWhere(filter);
  const offset = (page - 1) * limit;
  const { rows } = await getPool().query<EnrichedRow>(
    `SELECT ${FIELDS}, pe.nombre AS persona_nombre, pe.telefono AS persona_telefono,
            pe.categoria_slug AS categoria_slug
     FROM pagos p
     JOIN personas pe ON pe.id = p.persona_id
     ${sql}
     ORDER BY p.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  return rows.map(mapEnriched);
}

export async function findPagoById(id: string): Promise<PagoWithPersona | null> {
  const { rows } = await getPool().query<EnrichedRow>(
    `SELECT ${FIELDS}, pe.nombre AS persona_nombre, pe.telefono AS persona_telefono,
            pe.categoria_slug AS categoria_slug
     FROM pagos p
     JOIN personas pe ON pe.id = p.persona_id
     WHERE p.id = $1`,
    [id],
  );
  return rows[0] ? mapEnriched(rows[0]) : null;
}

export async function findPagoPendienteByPersona(personaId: string): Promise<Pago | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT id, persona_id, estado, monto, moneda, concepto, fecha_vencimiento, fecha_pago,
            referencia, notas, metadata, created_at, updated_at
     FROM pagos WHERE persona_id = $1 AND estado = 'pendiente' LIMIT 1`,
    [personaId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createPago(input: {
  personaId: string;
  estado?: PagoEstado;
  monto?: number | null;
  moneda?: string;
  concepto?: string;
  fechaVencimiento?: Date | null;
  referencia?: string;
  notas?: string;
  metadata?: Record<string, unknown>;
}): Promise<Pago> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO pagos (persona_id, estado, monto, moneda, concepto, fecha_vencimiento, referencia, notas, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, persona_id, estado, monto, moneda, concepto, fecha_vencimiento, fecha_pago,
               referencia, notas, metadata, created_at, updated_at`,
    [
      input.personaId,
      input.estado ?? 'pendiente',
      input.monto ?? null,
      input.moneda ?? 'COP',
      input.concepto ?? null,
      input.fechaVencimiento ?? null,
      input.referencia ?? null,
      input.notas ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return mapRow(rows[0]);
}

export async function updatePago(
  id: string,
  input: Partial<{
    estado: PagoEstado;
    monto: number | null;
    moneda: string;
    concepto: string | null;
    fechaVencimiento: Date | null;
    fechaPago: Date | null;
    referencia: string | null;
    notas: string | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<Pago | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  let i = 2;
  if (input.estado !== undefined) {
    sets.push(`estado = $${i++}`);
    params.push(input.estado);
  }
  if (input.monto !== undefined) {
    sets.push(`monto = $${i++}`);
    params.push(input.monto);
  }
  if (input.moneda !== undefined) {
    sets.push(`moneda = $${i++}`);
    params.push(input.moneda);
  }
  if (input.concepto !== undefined) {
    sets.push(`concepto = $${i++}`);
    params.push(input.concepto);
  }
  if (input.fechaVencimiento !== undefined) {
    sets.push(`fecha_vencimiento = $${i++}`);
    params.push(input.fechaVencimiento);
  }
  if (input.fechaPago !== undefined) {
    sets.push(`fecha_pago = $${i++}`);
    params.push(input.fechaPago);
  }
  if (input.referencia !== undefined) {
    sets.push(`referencia = $${i++}`);
    params.push(input.referencia);
  }
  if (input.notas !== undefined) {
    sets.push(`notas = $${i++}`);
    params.push(input.notas);
  }
  if (input.metadata !== undefined) {
    sets.push(`metadata = $${i++}`);
    params.push(JSON.stringify(input.metadata));
  }
  if (!sets.length) {
    const p = await findPagoById(id);
    return p ? mapRow(p as EnrichedRow) : null;
  }
  const { rows } = await getPool().query<Row>(
    `UPDATE pagos SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, persona_id, estado, monto, moneda, concepto, fecha_vencimiento, fecha_pago,
               referencia, notas, metadata, created_at, updated_at`,
    params,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function resumenPagos(): Promise<{
  pendientes: number;
  pagados: number;
  cancelados: number;
  montoPendiente: number;
  montoPagado: number;
}> {
  const { rows } = await getPool().query<{
    estado: PagoEstado;
    c: string;
    monto: string | null;
  }>(
    `SELECT estado, COUNT(*)::text AS c, COALESCE(SUM(monto), 0)::text AS monto
     FROM pagos GROUP BY estado`,
  );
  let pendientes = 0;
  let pagados = 0;
  let cancelados = 0;
  let montoPendiente = 0;
  let montoPagado = 0;
  for (const r of rows) {
    const c = Number(r.c);
    const m = Number(r.monto ?? 0);
    if (r.estado === 'pendiente') {
      pendientes = c;
      montoPendiente = m;
    } else if (r.estado === 'pagado') {
      pagados = c;
      montoPagado = m;
    } else if (r.estado === 'cancelado') cancelados = c;
  }
  return { pendientes, pagados, cancelados, montoPendiente, montoPagado };
}

export async function generarPagosPendientes(categoriaSlug: string): Promise<number> {
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT pe.id FROM personas pe
     WHERE pe.categoria_slug = $1 AND pe.activo = TRUE
       AND NOT EXISTS (
         SELECT 1 FROM pagos pa WHERE pa.persona_id = pe.id AND pa.estado = 'pendiente'
       )`,
    [categoriaSlug],
  );
  if (!rows.length) return 0;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(
        `INSERT INTO pagos (persona_id, estado, concepto) VALUES ($1, 'pendiente', 'Cuota pendiente')`,
        [r.id],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return rows.length;
}
