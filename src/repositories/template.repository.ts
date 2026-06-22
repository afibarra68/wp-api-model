import { getPool } from '../core/postgres';
import type { Template, TemplateButton, TemplateVariable } from '../types/entities';

type Row = {
  id: string;
  nombre_meta: string;
  idioma: string;
  categoria: Template['categoria'];
  estado: Template['estado'];
  header_tipo: Template['headerTipo'];
  header_url: string | null;
  header_text: string | null;
  footer: string | null;
  botones: TemplateButton[];
  cuerpo: string;
  variables: TemplateVariable[];
  created_at: Date;
  updated_at: Date;
};

function mapRow(r: Row): Template {
  return {
    id: r.id,
    nombreMeta: r.nombre_meta,
    idioma: r.idioma,
    categoria: r.categoria,
    estado: r.estado,
    headerTipo: r.header_tipo,
    headerUrl: r.header_url,
    headerText: r.header_text,
    footer: r.footer,
    botones: r.botones ?? [],
    cuerpo: r.cuerpo,
    variables: r.variables ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const FIELDS =
  'id, nombre_meta, idioma, categoria, estado, header_tipo, header_url, header_text, footer, botones, cuerpo, variables, created_at, updated_at';

type TemplateInput = {
  nombre_meta: string;
  idioma?: string;
  categoria?: Template['categoria'];
  estado?: Template['estado'];
  header_tipo?: Template['headerTipo'];
  header_url?: string | null;
  header_text?: string | null;
  footer?: string | null;
  botones?: TemplateButton[];
  cuerpo: string;
  variables?: TemplateVariable[];
};

function baseValues(input: TemplateInput) {
  return [
    input.nombre_meta,
    input.idioma ?? 'es',
    input.categoria ?? 'utility',
    input.header_tipo ?? 'none',
    input.header_url ?? null,
    input.header_text ?? null,
    input.footer ?? null,
    JSON.stringify(input.botones ?? []),
    input.cuerpo,
    JSON.stringify(input.variables ?? []),
  ];
}

function insertValues(input: TemplateInput) {
  return [
    input.nombre_meta,
    input.idioma ?? 'es',
    input.categoria ?? 'utility',
    input.estado ?? 'borrador',
    input.header_tipo ?? 'none',
    input.header_url ?? null,
    input.header_text ?? null,
    input.footer ?? null,
    JSON.stringify(input.botones ?? []),
    input.cuerpo,
    JSON.stringify(input.variables ?? []),
  ];
}

export async function countTemplates(): Promise<number> {
  const { rows } = await getPool().query<{ c: string }>('SELECT COUNT(*)::text AS c FROM templates');
  return Number(rows[0]?.c ?? 0);
}

export async function findAllTemplates(): Promise<Template[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM templates ORDER BY created_at DESC`,
  );
  return rows.map(mapRow);
}

export async function findTemplateById(id: string): Promise<Template | null> {
  const { rows } = await getPool().query<Row>(`SELECT ${FIELDS} FROM templates WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findTemplateByMetaName(
  nombreMeta: string,
  idioma: string,
): Promise<Template | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM templates WHERE nombre_meta = $1 AND idioma = $2`,
    [nombreMeta, idioma],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertTemplateByMetaName(input: TemplateInput): Promise<Template> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO templates (
       nombre_meta, idioma, categoria, estado, header_tipo, header_url, header_text, footer, botones, cuerpo, variables
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (nombre_meta, idioma) DO UPDATE SET
       categoria = EXCLUDED.categoria,
       estado = EXCLUDED.estado,
       header_tipo = EXCLUDED.header_tipo,
       header_url = EXCLUDED.header_url,
       header_text = EXCLUDED.header_text,
       footer = EXCLUDED.footer,
       botones = EXCLUDED.botones,
       cuerpo = EXCLUDED.cuerpo,
       variables = EXCLUDED.variables,
       updated_at = NOW()
     RETURNING ${FIELDS}`,
    insertValues({ ...input, estado: input.estado ?? 'aprobada' }),
  );
  return mapRow(rows[0]);
}

export async function createTemplate(input: TemplateInput): Promise<Template> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO templates (
       nombre_meta, idioma, categoria, header_tipo, header_url, header_text, footer, botones, cuerpo, variables
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${FIELDS}`,
    baseValues(input),
  );
  return mapRow(rows[0]);
}

export async function createTemplatesBulk(items: TemplateInput[]): Promise<void> {
  for (const t of items) {
    await getPool().query(
      `INSERT INTO templates (
         nombre_meta, idioma, categoria, estado, header_tipo, header_url, header_text, footer, botones, cuerpo, variables
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      insertValues(t),
    );
  }
}

export async function updateTemplate(
  id: string,
  patch: Partial<Omit<TemplateInput, 'nombre_meta'>>,
): Promise<Template | null> {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  let i = 2;
  if (patch.estado !== undefined) { sets.push(`estado = $${i++}`); vals.push(patch.estado); }
  if (patch.cuerpo !== undefined) { sets.push(`cuerpo = $${i++}`); vals.push(patch.cuerpo); }
  if (patch.categoria !== undefined) { sets.push(`categoria = $${i++}`); vals.push(patch.categoria); }
  if (patch.header_tipo !== undefined) { sets.push(`header_tipo = $${i++}`); vals.push(patch.header_tipo); }
  if (patch.header_url !== undefined) { sets.push(`header_url = $${i++}`); vals.push(patch.header_url); }
  if (patch.header_text !== undefined) { sets.push(`header_text = $${i++}`); vals.push(patch.header_text); }
  if (patch.footer !== undefined) { sets.push(`footer = $${i++}`); vals.push(patch.footer); }
  if (patch.botones !== undefined) { sets.push(`botones = $${i++}`); vals.push(JSON.stringify(patch.botones)); }
  if (patch.variables !== undefined) { sets.push(`variables = $${i++}`); vals.push(JSON.stringify(patch.variables)); }
  if (sets.length === 0) return findTemplateById(id);
  const { rows } = await getPool().query<Row>(
    `UPDATE templates SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING ${FIELDS}`,
    vals,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const { rowCount } = await getPool().query('DELETE FROM templates WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
