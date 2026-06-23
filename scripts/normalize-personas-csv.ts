/**
 * Normaliza los 4 CSV fuente a formato estándar de importación:
 *   nombre,telefono,categoria
 *
 * Uso: npx tsx scripts/normalize-personas-csv.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodeTextBuffer, escapeCsvField, normalizeTextInput, parseCsvLine } from '../src/core/csv';
import { normalizePhone } from '../src/core/phone';
import { slugifyCategoria } from '../src/modules/personas/personas.service';

const ROOT = path.join(__dirname, '../../pdfexcle');
const OUT = path.join(ROOT, 'import');

const SOURCES = [
  {
    file: 'DATOS API - AMIGOS GUABINAS.csv',
    categoria: 'amigos_guabinas',
    out: '01-amigos-guabinas.csv',
  },
  {
    file: 'DATOS API - CONTACTOS CELULAR.csv',
    categoria: 'contactos_celular',
    out: '02-contactos-celular.csv',
  },
  {
    file: 'DATOS API - NUEVOS.csv',
    categoria: 'nuevos',
    out: '03-nuevos.csv',
  },
  {
    file: 'DATOS API - PENDIENTES POR PAGAR.csv',
    categoria: 'pendientes_por_pagar',
    out: '04-pendientes-por-pagar.csv',
  },
] as const;

function readSourceCsv(filePath: string): string {
  return normalizeTextInput(decodeTextBuffer(fs.readFileSync(filePath)));
}

function parseSemicolonSimple(text: string, defaultCat: string) {
  const lines = text.split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const rows: Array<{ nombre: string; telefono: string; categoria: string }> = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i], ';').map((p) => p.trim());
    const nombre = parts[0] || '';
    const rawTel = parts[1] || '';
    const catRaw = parts[2] || defaultCat;
    const tel = normalizePhone(rawTel);
    if (!tel || seen.has(tel)) continue;
    seen.add(tel);
    rows.push({
      nombre: nombre || `Persona ${tel}`,
      telefono: tel,
      categoria: catRaw ? slugifyCategoria(catRaw) : defaultCat,
    });
  }
  return rows;
}

function parseGoogleContacts(text: string, defaultCat: string) {
  const lines = text.split('\n').filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const iFirst = header.indexOf('First Name');
  const iMiddle = header.indexOf('Middle Name');
  const iLast = header.indexOf('Last Name');
  const iOrg = header.indexOf('Organization Name');
  const phoneCols = header
    .map((h, idx) => ({ h: h.trim(), idx }))
    .filter((x) => /^Phone \d+ - Value$/i.test(x.h))
    .map((x) => x.idx);

  const seen = new Set<string>();
  const rows: Array<{ nombre: string; telefono: string; categoria: string }> = [];

  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li]);
    const nombrePartes = [iFirst, iMiddle, iLast]
      .map((i) => (i >= 0 ? (cells[i] || '').trim() : ''))
      .filter(Boolean);
    let nombre = nombrePartes.join(' ');
    if (!nombre && iOrg >= 0) nombre = (cells[iOrg] || '').trim();

    for (const pc of phoneCols) {
      const raw = cells[pc];
      if (!raw?.trim()) continue;
      const tel = normalizePhone(raw);
      if (!tel || seen.has(tel)) continue;
      seen.add(tel);
      rows.push({ nombre: nombre || `Persona ${tel}`, telefono: tel, categoria: defaultCat });
    }
  }
  return rows;
}

function writeCsv(outPath: string, rows: Array<{ nombre: string; telefono: string; categoria: string }>) {
  const lines = ['nombre,telefono,categoria'];
  for (const r of rows) {
    lines.push(
      [escapeCsvField(r.nombre), escapeCsvField(r.telefono), escapeCsvField(r.categoria)].join(','),
    );
  }
  fs.writeFileSync(outPath, `\uFEFF${lines.join('\n')}`, 'utf8');
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const summary: Array<{ file: string; rows: number; out: string }> = [];

  for (const src of SOURCES) {
    const inPath = path.join(ROOT, src.file);
    if (!fs.existsSync(inPath)) {
      console.warn(`⚠ No encontrado: ${inPath}`);
      continue;
    }
    const text = readSourceCsv(inPath);
    const isGoogle = text.includes('First Name') || text.includes('Phone 1 - Value');
    const rows = isGoogle
      ? parseGoogleContacts(text, src.categoria)
      : parseSemicolonSimple(text, src.categoria);

    const outPath = path.join(OUT, src.out);
    writeCsv(outPath, rows);
    summary.push({ file: src.file, rows: rows.length, out: src.out });
    console.log(`✓ ${src.out}: ${rows.length} filas`);
  }

  const readme = `# Archivos de importación · Personas

Formato estándar compatible con \`POST /api/v1/personas/import-csv\` y carga masiva del panel.

| Archivo | Categoría | Origen |
|---------|-----------|--------|
${summary.map((s) => `| ${s.out} | ver columna categoria | ${s.file} (${s.rows} filas) |`).join('\n')}

## Columnas

\`\`\`
nombre,telefono,categoria
\`\`\`

- **telefono**: dígitos E.164 sin \`+\` (ej. \`573001234567\`)
- **categoria**: \`amigos_guabinas\` | \`contactos_celular\` | \`nuevos\` | \`pendientes_por_pagar\`

Generado con: \`npx tsx scripts/normalize-personas-csv.ts\`
`;
  fs.writeFileSync(path.join(OUT, 'README.md'), readme, 'utf8');
  console.log(`\nListo → ${OUT}`);
}

main();
