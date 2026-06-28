/** Quita BOM UTF-8 si el archivo lo trae al inicio. */
export function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Normaliza saltos de línea y elimina BOM. */
export function normalizeTextInput(text: string): string {
  return stripUtf8Bom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function detectDelimiter(headerLine: string): ',' | ';' | '\t' {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  if (semicolons > commas) return ';';
  if (commas > 0) return ',';
  return '\t';
}

/** Parser RFC 4180 mínimo: comillas escapadas y delimitador configurable. */
export function parseCsvLine(line: string, delimiter = ','): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      fields.push(field);
      field = '';
    } else {
      field += c;
    }
  }

  fields.push(field);
  return fields;
}

/** Parsea texto delimitado respetando campos entre comillas (UTF-8). */
export function parseDelimitedCsv(text: string): string[][] {
  const normalized = normalizeTextInput(text);
  const lines = normalized.split('\n');
  if (!lines.length) return [];

  const delim = detectDelimiter(lines.find((l) => l.trim()) ?? lines[0]);
  const rows: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    rows.push(parseCsvLine(line, delim).map((c) => c.trim()));
  }

  return rows;
}

/** Escapa un valor para CSV con comillas cuando hace falta. */
export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Decodifica un buffer de texto: UTF-8 (con o sin BOM) o Latin-1 / Windows-1252.
 * Los CSV exportados desde Excel suelen venir en Windows-1252.
 */
export function decodeTextBuffer(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString('utf8');
  }
  const asUtf8 = buf.toString('utf8');
  if (asUtf8.includes('\uFFFD')) {
    return buf.toString('latin1');
  }
  return asUtf8;
}

/** @deprecated Usa decodeTextBuffer */
export const decodeUtf8Buffer = decodeTextBuffer;
