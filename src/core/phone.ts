/** Normaliza teléfono a dígitos E.164 sin "+". */
export function normalizePhone(raw: string, defaultCc = '57'): string | null {
  if (!raw) return null;
  let d = raw.trim();
  const hadPlus = d.startsWith('+') || d.includes('+');
  // Google export: "::: +57 322 ..."
  const segment = d.split(':::').map((s) => s.trim()).find((s) => /\d/.test(s)) ?? d;
  d = segment.replace(/\D/g, '');
  if (!d) return null;
  if (!hadPlus && d.length === 10 && d.startsWith('3')) {
    d = defaultCc + d;
  }
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length < 8 || d.length > 15) return null;
  return d;
}
