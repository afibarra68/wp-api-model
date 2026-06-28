import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import * as svc from './integration.service';
import { UpsertIntegrationInput } from './integration.types';

const router = Router();

router.use(authJwt, requireRole('admin'));

const providerEnum = z.enum(['simulation', 'meta-cloud', 'evolution']);

const upsertSchema = z.object({
  name: z.string().min(1),
  provider: providerEnum,
  whatsapp_token: z.string().optional().nullable(),
  whatsapp_phone_number_id: z.string().optional().nullable(),
  whatsapp_api_version: z.string().optional(),
  whatsapp_product_policy: z.enum(['CLOUD_API_FALLBACK', 'STRICT']).optional().nullable(),
  whatsapp_message_activity_sharing: z.boolean().optional().nullable(),
  webhook_verify_token: z.string().min(1).optional(),
  webhook_public_url: z.string().url().optional().nullable(),
  evolution_base_url: z.string().url().optional().nullable(),
  evolution_api_key: z.string().optional().nullable(),
  evolution_instance: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function mapBody(body: z.infer<typeof upsertSchema>): UpsertIntegrationInput {
  return {
    name: body.name,
    provider: body.provider,
    whatsappToken: body.whatsapp_token,
    whatsappPhoneNumberId: body.whatsapp_phone_number_id,
    whatsappApiVersion: body.whatsapp_api_version,
    whatsappProductPolicy: body.whatsapp_product_policy,
    whatsappMessageActivitySharing: body.whatsapp_message_activity_sharing,
    webhookVerifyToken: body.webhook_verify_token,
    webhookPublicUrl: body.webhook_public_url,
    evolutionBaseUrl: body.evolution_base_url,
    evolutionApiKey: body.evolution_api_key,
    evolutionInstance: body.evolution_instance,
    notes: body.notes,
  };
}

function mapPartialBody(body: Partial<z.infer<typeof upsertSchema>>): Partial<UpsertIntegrationInput> {
  const out: Partial<UpsertIntegrationInput> = {};
  if (body.name !== undefined) out.name = body.name;
  if (body.provider !== undefined) out.provider = body.provider;
  if (body.whatsapp_token !== undefined) out.whatsappToken = body.whatsapp_token;
  if (body.whatsapp_phone_number_id !== undefined) out.whatsappPhoneNumberId = body.whatsapp_phone_number_id;
  if (body.whatsapp_api_version !== undefined) out.whatsappApiVersion = body.whatsapp_api_version;
  if (body.whatsapp_product_policy !== undefined) out.whatsappProductPolicy = body.whatsapp_product_policy;
  if (body.whatsapp_message_activity_sharing !== undefined) {
    out.whatsappMessageActivitySharing = body.whatsapp_message_activity_sharing;
  }
  if (body.webhook_verify_token !== undefined) out.webhookVerifyToken = body.webhook_verify_token;
  if (body.webhook_public_url !== undefined) out.webhookPublicUrl = body.webhook_public_url;
  if (body.evolution_base_url !== undefined) out.evolutionBaseUrl = body.evolution_base_url;
  if (body.evolution_api_key !== undefined) out.evolutionApiKey = body.evolution_api_key;
  if (body.evolution_instance !== undefined) out.evolutionInstance = body.evolution_instance;
  if (body.notes !== undefined) out.notes = body.notes;
  return out;
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await svc.listIntegrations());
  }),
);

router.get(
  '/active',
  asyncHandler(async (_req, res) => {
    const active = await svc.getActiveIntegration();
    res.json({
      id: active.id,
      name: active.name,
      provider: active.provider,
      whatsappPhoneNumberId: active.whatsappPhoneNumberId,
      whatsappApiVersion: active.whatsappApiVersion,
      webhookPublicUrl: active.webhookPublicUrl,
      hasWhatsappToken: !!active.whatsappToken,
      hasEvolutionApiKey: !!active.evolutionApiKey,
    });
  }),
);

router.post(
  '/',
  validateBody(upsertSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await svc.createIntegration(mapBody(req.body)));
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (_req, res) => {
    res.json(await svc.refreshIntegration());
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await svc.getIntegration(req.params.id));
  }),
);

router.patch(
  '/:id',
  validateBody(upsertSchema.partial()),
  asyncHandler(async (req, res) => {
    res.json(await svc.updateIntegration(req.params.id, mapPartialBody(req.body)));
  }),
);

router.post(
  '/:id/activate',
  asyncHandler(async (req, res) => {
    res.json(await svc.activateIntegration(req.params.id));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await svc.deleteIntegration(req.params.id);
    res.json({ ok: true });
  }),
);

export default router;
