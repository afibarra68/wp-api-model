import { AppError } from '../../core/errors';
import { normalizeTextInput, parseCsvLine, parseDelimitedCsv } from '../../core/csv';
import { normalizePhone } from '../../core/phone';import * as personaRepo from '../../repositories/persona.repository';
import * as pagoRepo from '../../repositories/pago.repository';
import * as clientRepo from '../../repositories/client.repository';

export const CATEGORIA_SLUGS = [
  'amigos_guabinas',
  'contactos_celular',
  'nuevos',
  'pendientes_por_pagar',
] as const;

export type CategoriaSlug = (typeof CATEGORIA_SLUGS)[number];

function colAlias(header: string[], aliases: string[]): number {  const norm = header.map((h) =>
    h
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, ''),
  );
  for (const alias of aliases) {
    const a = alias
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    const idx = norm.indexOf(a);
    if (idx >= 0) return idx;
  }
  return -1;
}

export interface ParsedPersonaRow {
  nombre: string;
  telefono: string;
  categoriaSlug: string;
}

/** Parsea CSV simple (nombre, celular, categoria) o Google Contacts. */
export async function parsePersonasCsv(
  csvText: string,
  defaultCategoria: string,
): Promise<{ rows: ParsedPersonaRow[]; descartados: number; format: string }> {
  const config = await personaRepo.getPersonasConfig();
  const cc = config.defaultCountryCode;

  const trimmed = normalizeTextInput(csvText).trim();
  if (trimmed.toLowerCase().includes('first name') || trimmed.includes('Phone 1 - Value')) {
    return parseGooglePersonasCsv(trimmed, defaultCategoria, cc);
  }

  const rows = parseDelimitedCsv(trimmed);  if (rows.length < 2) return { rows: [], descartados: 0, format: 'simple' };

  const header = rows[0];
  const iNombre = colAlias(header, ['nombre', 'name']);
  const iCelular = colAlias(header, ['celular', 'telefono', 'tel', 'mobile', 'phone']);
  const iCategoria = colAlias(header, ['categoria', 'category', 'etiqueta']);

  if (iNombre < 0 || iCelular < 0) {
    throw AppError.badRequest('CSV debe incluir columnas nombre y celular/telefono');
  }

  const seen = new Set<string>();
  const result: ParsedPersonaRow[] = [];
  let descartados = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const nombre = (cells[iNombre] || '').trim();
    const rawTel = (cells[iCelular] || '').trim();
    if (!rawTel) {
      descartados++;
      continue;
    }
    const tel = normalizePhone(rawTel, cc);
    if (!tel) {
      descartados++;
      continue;
    }
    if (seen.has(tel)) continue;
    seen.add(tel);

    let cat = defaultCategoria;
    if (iCategoria >= 0 && cells[iCategoria]?.trim()) {
      cat = slugifyCategoria(cells[iCategoria].trim());
    }

    result.push({
      nombre: nombre || `Persona ${tel}`,
      telefono: tel,
      categoriaSlug: cat,
    });
  }

  return { rows: result, descartados, format: 'simple' };
}

function parseGooglePersonasCsv(
  csvText: string,
  defaultCategoria: string,
  cc: string,
): { rows: ParsedPersonaRow[]; descartados: number; format: string } {
  const lines = normalizeTextInput(csvText).split('\n').filter((l) => l.trim());
  const header = parseCsvLine(lines[0]).map((h) => h.trim());  const iFirst = header.findIndex((h) => h === 'First Name');
  const iMiddle = header.findIndex((h) => h === 'Middle Name');
  const iLast = header.findIndex((h) => h === 'Last Name');
  const iOrg = header.findIndex((h) => h === 'Organization Name');
  const phoneCols = header
    .map((h, idx) => ({ h: h.trim(), idx }))
    .filter((x) => /^Phone \d+ - Value$/i.test(x.h))
    .map((x) => x.idx);

  const seen = new Set<string>();
  const result: ParsedPersonaRow[] = [];
  let descartados = 0;

  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    const nombrePartes = [iFirst, iMiddle, iLast]
      .map((i) => (i >= 0 ? (cells[i] || '').trim() : ''))
      .filter(Boolean);
    let nombre = nombrePartes.join(' ');
    if (!nombre && iOrg >= 0) nombre = (cells[iOrg] || '').trim();

    for (const pc of phoneCols) {
      const raw = cells[pc];
      if (!raw?.trim()) continue;
      const tel = normalizePhone(raw, cc);
      if (!tel) {
        descartados++;
        continue;
      }
      if (seen.has(tel)) continue;
      seen.add(tel);
      result.push({
        nombre: nombre || `Persona ${tel}`,
        telefono: tel,
        categoriaSlug: defaultCategoria,
      });
    }
  }

  return { rows: result, descartados, format: 'google' };
}

export function slugifyCategoria(raw: string): string {  const map: Record<string, string> = {
    'amigos guabinas': 'amigos_guabinas',
    amigos_guabinas: 'amigos_guabinas',
    'contactos celular': 'contactos_celular',
    contactos_celular: 'contactos_celular',
    nuevos: 'nuevos',
    'pendientes por pagar': 'pendientes_por_pagar',
    pendientes_por_pagar: 'pendientes_por_pagar',
  };
  const key = raw.trim().toLowerCase();
  if (map[key]) return map[key];
  return key
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export async function importPersonas(
  items: ParsedPersonaRow[],
  origen?: string,
): Promise<{ insertados: number; actualizados: number; pagosCreados: number }> {
  const config = await personaRepo.getPersonasConfig();
  const upsert = await personaRepo.bulkUpsertPersonas(
    items.map((p) => ({
      nombre: p.nombre,
      telefono: p.telefono,
      categoriaSlug: p.categoriaSlug,
      origen: origen ?? 'import',
    })),
  );

  let pagosCreados = 0;
  if (config.autoPagoPendiente) {
    pagosCreados = await pagoRepo.generarPagosPendientes(config.categoriaPendientesSlug);
  }

  if (config.syncToClients) {
    await clientRepo.bulkUpsertClients(
      items.map((p) => ({
        nombre: p.nombre,
        telefono: p.telefono,
        opt_in: true,
        etiquetas: [p.categoriaSlug],
      })),
    );
  }

  return { ...upsert, pagosCreados };
}

export async function syncPendientesPagos(): Promise<number> {
  const config = await personaRepo.getPersonasConfig();
  return pagoRepo.generarPagosPendientes(config.categoriaPendientesSlug);
}
