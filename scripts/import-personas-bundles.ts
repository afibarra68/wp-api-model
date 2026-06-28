/**
 * Importa los 4 CSV normalizados de pdfexcle/import a la base de datos.
 *
 * Uso:
 *   npx tsx scripts/import-personas-bundles.ts
 *   npx tsx scripts/import-personas-bundles.ts --only pendientes
 *   npx tsx scripts/import-personas-bundles.ts --sync-pagos
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { connectPostgres, disconnectPostgres } from '../src/core/postgres';
import { importPersonas, parsePersonasCsv } from '../src/modules/personas/personas.service';
import * as personaRepo from '../src/repositories/persona.repository';
import * as pagoRepo from '../src/repositories/pago.repository';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../config.env') });

const IMPORT_DIR = path.join(__dirname, '../../pdfexcle/import');

const BUNDLES = [
  { file: '01-amigos-guabinas.csv', categoria: 'amigos_guabinas', label: 'Amigos Guabinas' },
  { file: '02-contactos-celular.csv', categoria: 'contactos_celular', label: 'Contactos celular' },
  { file: '03-nuevos.csv', categoria: 'nuevos', label: 'Nuevos' },
  { file: '04-pendientes-por-pagar.csv', categoria: 'pendientes_por_pagar', label: 'Pendientes por pagar' },
] as const;

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  await connectPostgres();
  try {
    await runImport();
  } finally {
    await disconnectPostgres();
  }
}

async function runImport() {
  const only = argValue('only');
  const syncPagos = argFlag('sync-pagos');

  const selected = only
    ? BUNDLES.filter((b) => b.file.includes(only) || b.categoria.includes(only))
    : [...BUNDLES];

  if (!selected.length) {
    console.error(`No hay bundles que coincidan con --only ${only}`);
    process.exit(1);
  }

  let totalInsertados = 0;
  let totalActualizados = 0;
  let totalPagos = 0;

  for (const bundle of selected) {
    const filePath = path.join(IMPORT_DIR, bundle.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`? No encontrado: ${filePath}`);
      console.warn('  Ejecuta primero: npm run personas:normalize-csv');
      continue;
    }

    const csv = fs.readFileSync(filePath, 'utf8');
    const { rows, descartados, format } = await parsePersonasCsv(csv, bundle.categoria);
    if (!rows.length) {
      console.warn(`? ${bundle.file}: sin filas vlidas`);
      continue;
    }

    const result = await importPersonas(rows, `bundle:${bundle.file}`);
    totalInsertados += result.insertados;
    totalActualizados += result.actualizados;
    totalPagos += result.pagosCreados;

    console.log(
      `? ${bundle.label} (${bundle.file}, ${format}): ` +
        `${result.insertados} nuevas, ${result.actualizados} actualizadas` +
        (descartados ? `, ${descartados} descartadas` : '') +
        (result.pagosCreados ? `, ${result.pagosCreados} pagos` : ''),
    );
  }

  if (syncPagos) {
    const config = await personaRepo.getPersonasConfig();
    const creados = await pagoRepo.generarPagosPendientes(config.categoriaPendientesSlug);
    totalPagos += creados;
    console.log(`? Pagos pendientes generados: ${creados}`);
  }

  console.log(
    `\nResumen: ${totalInsertados} insertadas, ${totalActualizados} actualizadas, ${totalPagos} pagos creados`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
