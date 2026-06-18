import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { Template } from '../../models/template.model';
import { AppError } from '../../core/errors';

const router = Router();

router.use(authJwt, requireRole('admin', 'operador'));

const variableSchema = z.object({
  indice: z.number().int().positive(),
  nombre: z.string().min(1),
  ejemplo: z.string().optional(),
});

const createSchema = z.object({
  nombre_meta: z.string().min(1),
  idioma: z.string().min(2).default('es'),
  categoria: z.enum(['marketing', 'utility', 'authentication']).default('utility'),
  header_tipo: z.enum(['none', 'image']).default('none'),
  header_url: z.string().url().nullable().optional(),
  cuerpo: z.string().min(1),
  variables: z.array(variableSchema).default([]),
});

const updateSchema = z.object({
  estado: z.enum(['borrador', 'pendiente', 'aprobada', 'rechazada']).optional(),
  cuerpo: z.string().min(1).optional(),
  categoria: z.enum(['marketing', 'utility', 'authentication']).optional(),
  header_tipo: z.enum(['none', 'image']).optional(),
  header_url: z.string().url().nullable().optional(),
  variables: z.array(variableSchema).optional(),
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await Template.find().sort({ createdAt: -1 });
    res.json(items);
  }),
);

router.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const template = await Template.create(req.body);
    res.status(201).json(template);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const template = await Template.findById(req.params.id);
    if (!template) throw AppError.notFound('Plantilla no encontrada');
    res.json(template);
  }),
);

router.patch(
  '/:id',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const template = await Template.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!template) throw AppError.notFound('Plantilla no encontrada');
    res.json(template);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const template = await Template.findByIdAndDelete(req.params.id);
    if (!template) throw AppError.notFound('Plantilla no encontrada');
    res.json({ ok: true });
  }),
);

export default router;
