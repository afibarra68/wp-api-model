import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { AppError } from '../../core/errors';
import { serializeTemplate } from '../../core/serializers';
import { parseTemplateVariables } from '../../core/templateVariables';
import * as templateRepo from '../../repositories/template.repository';

const router = Router();

router.use(authJwt, requireRole('admin', 'operador'));

const variableSchema = z.object({
  indice: z.number().int().positive(),
  nombre: z.string().min(1),
  ejemplo: z.string().optional(),
});

function mergeVariableNames(
  parsed: ReturnType<typeof parseTemplateVariables>,
  provided?: z.infer<typeof variableSchema>[],
) {
  if (!provided?.length) return parsed;
  const byIndex = new Map(provided.map((v) => [v.indice, v]));
  return parsed.map((v) => {
    const custom = byIndex.get(v.indice);
    return custom ? { ...v, nombre: custom.nombre, ejemplo: custom.ejemplo } : v;
  });
}

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
    const variables = mergeVariableNames(
      parseTemplateVariables(req.body.cuerpo),
      req.body.variables,
    );
    const template = await templateRepo.createTemplate({ ...req.body, variables });
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
    const patch = { ...req.body };
    if (req.body.cuerpo !== undefined) {
      patch.variables = mergeVariableNames(
        parseTemplateVariables(req.body.cuerpo),
        req.body.variables,
      );
    } else if (req.body.variables !== undefined) {
      const current = await templateRepo.findTemplateById(req.params.id);
      if (!current) throw AppError.notFound('Plantilla no encontrada');
      patch.variables = mergeVariableNames(parseTemplateVariables(current.cuerpo), req.body.variables);
    }
    const template = await templateRepo.updateTemplate(req.params.id, patch);
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
