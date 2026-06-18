import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { AppError } from '../../core/errors';
import { serializeCampaign, serializeMessageLog } from '../../core/serializers';
import * as campaignRepo from '../../repositories/campaign.repository';
import * as messageLogRepo from '../../repositories/messageLog.repository';
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
    const { items, total } = await campaignRepo.findCampaigns(estado, page, limit);
    res.json({ items: items.map(serializeCampaign), total, page, limit });
  }),
);

router.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const campaign = await campaignRepo.createCampaign(req.body);
    res.status(201).json(serializeCampaign(campaign));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!svc.isValidId(req.params.id)) throw AppError.badRequest('ID inválido');
    const campaign = await campaignRepo.findCampaignById(req.params.id);
    if (!campaign) throw AppError.notFound('Campaña no encontrada');
    res.json(serializeCampaign(campaign));
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
    const c = await svc.pauseCampaign(req.params.id);
    res.json(serializeCampaign(c!));
  }),
);

router.post(
  '/:id/resume',
  asyncHandler(async (req, res) => {
    const c = await svc.resumeCampaign(req.params.id);
    res.json(serializeCampaign(c!));
  }),
);

router.get(
  '/:id/logs',
  asyncHandler(async (req, res) => {
    if (!svc.isValidId(req.params.id)) throw AppError.badRequest('ID inválido');
    const { estado } = req.query as Record<string, string>;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const { items, total } = await messageLogRepo.findMessageLogs(
      req.params.id,
      estado,
      page,
      limit,
    );
    res.json({ items: items.map(serializeMessageLog), total, page, limit });
  }),
);

router.get(
  '/:id/report',
  asyncHandler(async (req, res) => {
    res.json(await svc.campaignReport(req.params.id));
  }),
);

export default router;
