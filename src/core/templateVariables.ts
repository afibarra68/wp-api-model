import type { TemplateVariable } from '../types/entities';

/** Extrae índices {{1}}, {{2}}… del cuerpo de una plantilla. */
export function parseTemplateVariables(cuerpo: string): TemplateVariable[] {
  const indices = [
    ...new Set(
      [...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number.parseInt(m[1], 10)).filter((n) => n > 0),
    ),
  ].sort((a, b) => a - b);

  return indices.map((indice) => ({ indice, nombre: `var${indice}` }));
}
