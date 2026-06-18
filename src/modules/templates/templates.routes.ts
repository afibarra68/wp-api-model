import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { AppError } from '../../core/errors';
import { serializeTemplate } from '../../core/serializers';
import * as templateRepo from '../../repositories/template.repository';

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
    const items = await templateRepo.findAllTemplates();
    res.json(items.map(serializeTemplate));
  }),
);

router.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const template = await templateRepo.createTemplate(req.body);
    res.status(201).json(serializeTemplate(template));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const template = await templateRepo.findTemplateById(req.params.id);
    if (!template) throw AppError.notFound('Plantilla no encontrada');
    res.json(serializeTemplate(template));
  }),
);

router.patch(
  '/:id',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const template = await templateRepo.updateTemplate(req.params.id, req.body);
    if (!template) throw AppError.notFound('Plantilla no encontrada');
    res.json(serializeTemplate(template));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ok = await templateRepo.deleteTemplate(req.params.id);
    if (!ok) throw AppError.notFound('Plantilla no encontrada');
    res.json({ ok: true });
  }),
);

export default router;
