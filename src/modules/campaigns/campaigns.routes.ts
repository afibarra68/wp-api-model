import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { Campaign } from '../../models/campaign.model';
import { MessageLog } from '../../models/messageLog.model';
import { AppError } from '../../core/errors';
import * as svc from './campaigns.service';

const router = Router();

router.use(authJwt, requireRole('admin', 'operador'));

const mapeoSchema = z.object({
  indice: z.number().int().positive(),
  origen: z.enum(['campo', 'fijo', 'metadata']),
  valor: z.string().min(1),
});

const createSchema = z.object({
  nombre_campana: z.string().min(1),
  plantilla_id: z.string().refine(svc.isValidId, 'plantilla_id inválido'),
  segmento: z
    .object({
      etiquetas: z.array(z.string()).optional(),
      solo_activos: z.boolean().optional(),
    })
    .default({ solo_activos: true }),
  mapeo_variables: z.array(mapeoSchema).default([]),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { estado } = req.query as Record<string, string>;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const filter: Record<string, unknown> = {};
    if (estado) filter.estado = estado;

    const [items, total] = await Promise.all([
      Campaign.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Campaign.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  }),
);

router.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const campaign = await Campaign.create(req.body);
    res.status(201).json(campaign);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!svc.isValidId(req.params.id)) throw AppError.badRequest('ID inválido');
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) throw AppError.notFound('Campaña no encontrada');
    res.json(campaign);
  }),
);

router.get(
  '/:id/preview',
  asyncHandler(async (req, res) => {
    res.json(await svc.previewCampaign(req.params.id));
  }),
);

router.post(
  '/:id/launch',
  asyncHandler(async (req, res) => {
    res.json(await svc.launchCampaign(req.params.id));
  }),
);

router.post(
  '/:id/pause',
  asyncHandler(async (req, res) => {
    res.json(await svc.pauseCampaign(req.params.id));
  }),
);

router.post(
  '/:id/resume',
  asyncHandler(async (req, res) => {
    res.json(await svc.resumeCampaign(req.params.id));
  }),
);

router.get(
  '/:id/logs',
  asyncHandler(async (req, res) => {
    if (!svc.isValidId(req.params.id)) throw AppError.badRequest('ID inválido');
    const { estado } = req.query as Record<string, string>;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const filter: Record<string, unknown> = { campana_id: req.params.id };
    if (estado) filter.estado_actual = estado;

    const [items, total] = await Promise.all([
      MessageLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      MessageLog.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  }),
);

router.get(
  '/:id/report',
  asyncHandler(async (req, res) => {
    res.json(await svc.campaignReport(req.params.id));
  }),
);

export default router;
