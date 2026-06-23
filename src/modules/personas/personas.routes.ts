import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { AppError } from '../../core/errors';
import {
  serializePersona,
  serializePersonaCategoria,
  serializePersonasConfig,
} from '../../core/serializers';
import { normalizePhone } from '../../core/phone';
import * as personaRepo from '../../repositories/persona.repository';
import * as svc from './personas.service';

const router = Router();

router.use(authJwt, requireRole('admin', 'operador'));

const telefonoRegex = /^[0-9]{8,15}$/;

const createSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().regex(telefonoRegex, 'Teléfono: solo dígitos, 8–15 caracteres'),
  categoria_slug: z.string().min(1),
  activo: z.boolean().optional(),
  notas: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateSchema = createSchema.partial();

const bulkSchema = z.object({
  categoria_slug: z.string().min(1).optional(),
  origen: z.string().optional(),
  personas: z
    .array(
      z.object({
        nombre: z.string().min(1),
        telefono: z.string().min(8),
        categoria_slug: z.string().optional(),
      }),
    )
    .min(1)
    .max(10000),
});

const importCsvSchema = z.object({
  csv: z.string().min(1),
  categoria_slug: z.string().min(1).default('contactos_celular'),
  origen: z.string().optional(),
});

const configSchema = z.object({
  default_country_code: z.string().regex(/^\d{1,4}$/).optional(),
  auto_pago_pendiente: z.boolean().optional(),
  categoria_pendientes_slug: z.string().min(1).optional(),
  sync_to_clients: z.boolean().optional(),
});

router.get(
  '/categorias',
  asyncHandler(async (_req, res) => {
    const cats = await personaRepo.findCategorias();
    res.json(cats.map(serializePersonaCategoria));
  }),
);

router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const config = await personaRepo.getPersonasConfig();
    res.json(serializePersonasConfig(config));
  }),
);

router.patch(
  '/config',
  requireRole('admin'),
  validateBody(configSchema),
  asyncHandler(async (req, res) => {
    const config = await personaRepo.updatePersonasConfig({
      defaultCountryCode: req.body.default_country_code,
      autoPagoPendiente: req.body.auto_pago_pendiente,
      categoriaPendientesSlug: req.body.categoria_pendientes_slug,
      syncToClients: req.body.sync_to_clients,
    });
    res.json(serializePersonasConfig(config));
  }),
);

router.post(
  '/sync-pagos-pendientes',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const creados = await svc.syncPendientesPagos();
    res.json({ pagos_creados: creados });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { categoria, search, activo } = req.query as Record<string, string>;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const filter: personaRepo.PersonaFilter = {};
    if (categoria) filter.categoriaSlug = categoria;
    if (search) filter.search = search;
    if (activo === 'true') filter.activo = true;
    if (activo === 'false') filter.activo = false;

    const [items, total] = await Promise.all([
      personaRepo.findPersonas(filter, page, limit),
      personaRepo.countPersonas(filter),
    ]);

    res.json({
      items: items.map(serializePersona),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  }),
);

router.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const config = await personaRepo.getPersonasConfig();
    const tel = normalizePhone(req.body.telefono, config.defaultCountryCode);
    if (!tel) throw AppError.badRequest('Teléfono inválido');

    const exists = await personaRepo.findPersonaByTelefono(tel);
    if (exists) throw AppError.conflict('El teléfono ya está registrado');

    const persona = await personaRepo.createPersona({
      nombre: req.body.nombre,
      telefono: tel,
      categoriaSlug: req.body.categoria_slug,
      activo: req.body.activo,
      notas: req.body.notas,
      metadata: req.body.metadata,
    });
    res.status(201).json(serializePersona(persona));
  }),
);

router.post(
  '/bulk',
  validateBody(bulkSchema),
  asyncHandler(async (req, res) => {
    const config = await personaRepo.getPersonasConfig();
    const defaultCat = req.body.categoria_slug ?? 'contactos_celular';
    const parsed = req.body.personas
      .map((p: { nombre: string; telefono: string; categoria_slug?: string }) => {
        const tel = normalizePhone(p.telefono, config.defaultCountryCode);
        if (!tel) return null;
        return {
          nombre: p.nombre,
          telefono: tel,
          categoriaSlug: p.categoria_slug ?? defaultCat,
        };
      })
      .filter(Boolean) as svc.ParsedPersonaRow[];

    if (!parsed.length) throw AppError.badRequest('Ningún teléfono válido en el lote');

    const result = await svc.importPersonas(parsed, req.body.origen);
    res.status(201).json(result);
  }),
);

router.post(
  '/import-csv',
  validateBody(importCsvSchema),
  asyncHandler(async (req, res) => {
    const { rows, descartados, format } = await svc.parsePersonasCsv(
      req.body.csv,
      req.body.categoria_slug,
    );
    if (!rows.length) {
      throw AppError.badRequest('No se encontraron filas válidas en el CSV');
    }
    const result = await svc.importPersonas(rows, req.body.origen ?? `csv:${format}`);
    res.status(201).json({ ...result, descartados, filas_procesadas: rows.length, format });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const persona = await personaRepo.findPersonaById(req.params.id);
    if (!persona) throw AppError.notFound('Persona no encontrada');
    res.json(serializePersona(persona));
  }),
);

router.patch(
  '/:id',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const existing = await personaRepo.findPersonaById(req.params.id);
    if (!existing) throw AppError.notFound('Persona no encontrada');

    const config = await personaRepo.getPersonasConfig();
    const patch: Parameters<typeof personaRepo.updatePersona>[1] = {
      nombre: req.body.nombre,
      categoriaSlug: req.body.categoria_slug,
      activo: req.body.activo,
      notas: req.body.notas,
      metadata: req.body.metadata,
    };
    if (req.body.telefono) {
      const tel = normalizePhone(req.body.telefono, config.defaultCountryCode);
      if (!tel) throw AppError.badRequest('Teléfono inválido');
      if (tel !== existing.telefono) {
        const dup = await personaRepo.findPersonaByTelefono(tel);
        if (dup) throw AppError.conflict('El teléfono ya está registrado');
      }
      patch.telefono = tel;
    }
    const persona = await personaRepo.updatePersona(req.params.id, patch);
    if (!persona) throw AppError.notFound('Persona no encontrada');
    res.json(serializePersona(persona));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ok = await personaRepo.deletePersona(req.params.id);
    if (!ok) throw AppError.notFound('Persona no encontrada');
    res.json({ ok: true });
  }),
);

export default router;
