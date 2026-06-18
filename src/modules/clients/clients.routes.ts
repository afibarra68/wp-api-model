import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { Client } from '../../models/client.model';
import { AppError } from '../../core/errors';
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

    const filter: Record<string, unknown> = {};
    if (activo === 'true') filter.activo = true;
    if (activo === 'false') filter.activo = false;
    if (etiqueta) filter.etiquetas = etiqueta;
    if (search) {
      filter.$or = [
        { nombre: { $regex: search, $options: 'i' } },
        { telefono: { $regex: search } },
      ];
    }

    const [items, total] = await Promise.all([
      Client.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Client.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
  }),
);

router.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const exists = await Client.findOne({ telefono: req.body.telefono });
    if (exists) throw AppError.conflict('El teléfono ya está registrado');
    const client = await Client.create(req.body);
    res.status(201).json(client);
  }),
);

// Carga masiva idempotente por teléfono (upsert).
router.post(
  '/bulk',
  validateBody(bulkSchema),
  asyncHandler(async (req, res) => {
    const ops = req.body.clientes.map((c: z.infer<typeof createSchema>) => ({
      updateOne: {
        filter: { telefono: c.telefono },
        update: { $set: c, $setOnInsert: { fecha_registro: new Date() } },
        upsert: true,
      },
    }));
    const result = await Client.bulkWrite(ops);
    res.status(201).json({
      insertados: result.upsertedCount,
      actualizados: result.modifiedCount,
      total: req.body.clientes.length,
    });
  }),
);

// Borrado masivo de TODOS los clientes. Requiere rol admin + contraseña del usuario.
const purgeSchema = z.object({ password: z.string().min(1) });
router.post(
  '/purge',
  requireRole('admin'),
  validateBody(purgeSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const ok = await verifyUserPassword(req.user.id, req.body.password);
    if (!ok) throw AppError.unauthorized('Contraseña incorrecta');
    const result = await Client.deleteMany({});
    res.json({ eliminados: result.deletedCount ?? 0 });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) throw AppError.notFound('Cliente no encontrado');
    res.json(client);
  }),
);

router.patch(
  '/:id',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!client) throw AppError.notFound('Cliente no encontrado');
    res.json(client);
  }),
);

router.post(
  '/:id/opt-out',
  asyncHandler(async (req, res) => {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { activo: false, opt_in: false, opt_out_fecha: new Date() },
      { new: true },
    );
    if (!client) throw AppError.notFound('Cliente no encontrado');
    res.json(client);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) throw AppError.notFound('Cliente no encontrado');
    res.json({ ok: true });
  }),
);

export default router;
