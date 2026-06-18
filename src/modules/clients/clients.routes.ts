import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { AppError } from '../../core/errors';
import { serializeClient } from '../../core/serializers';
import * as clientRepo from '../../repositories/client.repository';
import { verifyUserPassword } from '../auth/auth.service';

const router = Router();

router.use(authJwt, requireRole('admin', 'operador'));

const telefonoRegex = /^[0-9]{8,15}$/;

const createSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().regex(telefonoRegex, 'Teléfono en formato E.164 sin "+": solo dígitos'),
  opt_in: z.boolean().default(true),
  etiquetas: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  nombre: z.string().min(1).optional(),
  etiquetas: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  activo: z.boolean().optional(),
  opt_in: z.boolean().optional(),
});

const bulkSchema = z.object({
  clientes: z.array(createSchema).min(1).max(5000),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { activo, etiqueta, search } = req.query as Record<string, string>;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const filter: clientRepo.ClientFilter = {};
    if (activo === 'true') filter.activo = true;
    if (activo === 'false') filter.activo = false;
    if (etiqueta) filter.etiqueta = etiqueta;
    if (search) filter.search = search;

    const [items, total] = await Promise.all([
      clientRepo.findClients(filter, page, limit),
      clientRepo.countClients(filter),
    ]);

    res.json({
      items: items.map(serializeClient),
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
    const exists = await clientRepo.findClientByTelefono(req.body.telefono);
    if (exists) throw AppError.conflict('El teléfono ya está registrado');
    const client = await clientRepo.createClient({
      nombre: req.body.nombre,
      telefono: req.body.telefono,
      optIn: req.body.opt_in,
      etiquetas: req.body.etiquetas,
      metadata: req.body.metadata,
    });
    res.status(201).json(serializeClient(client));
  }),
);

router.post(
  '/bulk',
  validateBody(bulkSchema),
  asyncHandler(async (req, res) => {
    const result = await clientRepo.bulkUpsertClients(req.body.clientes);
    res.status(201).json({
      insertados: result.insertados,
      actualizados: result.actualizados,
      total: req.body.clientes.length,
    });
  }),
);

const purgeSchema = z.object({ password: z.string().min(1) });
router.post(
  '/purge',
  requireRole('admin'),
  validateBody(purgeSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const ok = await verifyUserPassword(req.user.id, req.body.password);
    if (!ok) throw AppError.unauthorized('Contraseña incorrecta');
    const eliminados = await clientRepo.deleteAllClients();
    res.json({ eliminados });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const client = await clientRepo.findClientById(req.params.id);
    if (!client) throw AppError.notFound('Cliente no encontrado');
    res.json(serializeClient(client));
  }),
);

router.patch(
  '/:id',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const client = await clientRepo.updateClient(req.params.id, {
      nombre: req.body.nombre,
      etiquetas: req.body.etiquetas,
      metadata: req.body.metadata,
      activo: req.body.activo,
      optIn: req.body.opt_in,
    });
    if (!client) throw AppError.notFound('Cliente no encontrado');
    res.json(serializeClient(client));
  }),
);

router.post(
  '/:id/opt-out',
  asyncHandler(async (req, res) => {
    const client = await clientRepo.updateClient(req.params.id, {
      activo: false,
      optIn: false,
      optOutFecha: new Date(),
    });
    if (!client) throw AppError.notFound('Cliente no encontrado');
    res.json(serializeClient(client));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ok = await clientRepo.deleteClient(req.params.id);
    if (!ok) throw AppError.notFound('Cliente no encontrado');
    res.json({ ok: true });
  }),
);

export default router;
