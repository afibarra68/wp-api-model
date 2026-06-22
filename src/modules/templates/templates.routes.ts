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

const buttonSchema = z.object({
  tipo: z.enum(['quick_reply', 'url', 'phone']),
  texto: z.string().min(1),
  url: z.string().url().nullable().optional(),
  telefono: z.string().nullable().optional(),
});

const templateBodySchema = z.object({
  header_tipo: z.enum(['none', 'image', 'text']).default('none'),
  header_url: z.string().url().nullable().optional(),
  header_text: z.string().nullable().optional(),
  footer: z.string().nullable().optional(),
  botones: z.array(buttonSchema).max(3).default([]),
  cuerpo: z.string().min(1),
  variables: z.array(variableSchema).default([]),
});

function validateTemplateComponents(
  data: z.infer<typeof templateBodySchema>,
  ctx: z.RefinementCtx,
) {
  if (data.header_tipo === 'image' && !data.header_url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Indica header_url cuando header_tipo es image',
      path: ['header_url'],
    });
  }
  if (data.header_tipo === 'text' && !data.header_text?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Indica header_text cuando header_tipo es text',
      path: ['header_text'],
    });
  }
  data.botones.forEach((btn, i) => {
    if (btn.tipo === 'url' && !btn.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los botones URL requieren url',
        path: ['botones', i, 'url'],
      });
    }
    if (btn.tipo === 'phone' && !btn.telefono) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los botones de teléfono requieren telefono',
        path: ['botones', i, 'telefono'],
      });
    }
  });
}

const createSchema = templateBodySchema
  .extend({
    nombre_meta: z.string().min(1),
    idioma: z.string().min(2).default('es'),
    categoria: z.enum(['marketing', 'utility', 'authentication']).default('utility'),
  })
  .superRefine(validateTemplateComponents);

const updateSchema = templateBodySchema
  .partial()
  .extend({
    estado: z.enum(['borrador', 'pendiente', 'aprobada', 'rechazada']).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.header_tipo !== undefined ||
      data.header_url !== undefined ||
      data.header_text !== undefined ||
      data.botones !== undefined
    ) {
      validateTemplateComponents(
        {
          header_tipo: data.header_tipo ?? 'none',
          header_url: data.header_url,
          header_text: data.header_text,
          footer: data.footer ?? null,
          botones: data.botones ?? [],
          cuerpo: data.cuerpo ?? 'x',
          variables: data.variables ?? [],
        },
        ctx,
      );
    }
  });

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await templateRepo.findAllTemplates();
    res.json(items.map(serializeTemplate));
  }),
);

/** Plantilla oficial de prueba Meta (hello_world / en_US). */
router.get(
  '/hello-world',
  asyncHandler(async (_req, res) => {
    const template = await templateRepo.findTemplateByMetaName('hello_world', 'en_US');
    if (!template) {
      throw AppError.notFound('Plantilla hello_world no encontrada. Reinicia el servidor o ejecuta npm run seed');
    }
    res.json(serializeTemplate(template));
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
