import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import * as svc from './messages.service';

const router = Router();

router.use(authJwt, requireRole('admin', 'operador', 'agente'));

const recipientRefine = (d: { to?: string; cliente_id?: string }) => !!(d.to || d.cliente_id);

const sendSchema = z
  .object({
    to: z.string().min(8).optional(),
    cliente_id: z.string().optional(),
    plantilla_id: z.string().min(1),
    variables: z.array(z.string()).default([]),
    product_policy: z.enum(['CLOUD_API_FALLBACK', 'STRICT']).optional(),
    message_activity_sharing: z.boolean().optional(),
  })
  .refine(recipientRefine, { message: 'Indica "to" (teléfono) o "cliente_id"' });

const textSchema = z
  .object({
    to: z.string().min(8).optional(),
    cliente_id: z.string().optional(),
    text: z.string().min(1),
    reply_to_message_id: z.string().optional(),
    skip_window_check: z.boolean().optional(),
  })
  .refine(recipientRefine, { message: 'Indica "to" (teléfono) o "cliente_id"' });

const mediaSchema = z
  .object({
    to: z.string().min(8).optional(),
    cliente_id: z.string().optional(),
    type: z.enum(['image', 'audio', 'video', 'document', 'sticker']),
    link: z.string().url().optional(),
    id: z.string().optional(),
    caption: z.string().optional(),
    filename: z.string().optional(),
    reply_to_message_id: z.string().optional(),
    skip_window_check: z.boolean().optional(),
  })
  .refine(recipientRefine, { message: 'Indica "to" (teléfono) o "cliente_id"' })
  .refine((d) => d.link || d.id, { message: 'Indica "link" (URL) o "id" (media ID de Meta)' });

const interactiveSchema = z
  .object({
    to: z.string().min(8).optional(),
    cliente_id: z.string().optional(),
    interactive: z.object({
      type: z.enum(['button', 'list']),
      header: z.object({ type: z.literal('text'), text: z.string() }).optional(),
      body: z.object({ text: z.string().min(1) }),
      footer: z.object({ text: z.string() }).optional(),
      action: z.record(z.unknown()),
    }),
    reply_to_message_id: z.string().optional(),
    skip_window_check: z.boolean().optional(),
  })
  .refine(recipientRefine, { message: 'Indica "to" (teléfono) o "cliente_id"' });

const cloudSchema = z
  .object({
    messaging_product: z.literal('whatsapp'),
    recipient_type: z.enum(['individual', 'group']),
    to: z.string().min(1),
    type: z.string().min(1),
  })
  .passthrough();

/** Plantilla (utility/auth → /messages; marketing → /marketing_messages). */
router.post(
  '/send',
  validateBody(sendSchema),
  asyncHandler(async (req, res) => {
    const result = await svc.sendTemplateMessage({
      to: req.body.to,
      cliente_id: req.body.cliente_id,
      plantilla_id: req.body.plantilla_id,
      variables: req.body.variables,
      productPolicy: req.body.product_policy,
      messageActivitySharing: req.body.message_activity_sharing,
    });
    res.status(201).json(result);
  }),
);

router.post(
  '/marketing',
  validateBody(sendSchema),
  asyncHandler(async (req, res) => {
    const result = await svc.sendMarketingMessage({
      to: req.body.to,
      cliente_id: req.body.cliente_id,
      plantilla_id: req.body.plantilla_id,
      variables: req.body.variables,
      productPolicy: req.body.product_policy,
      messageActivitySharing: req.body.message_activity_sharing,
    });
    res.status(201).json(result);
  }),
);

/** Texto libre — Meta POST /messages type=text (ventana 24h). */
router.post(
  '/text',
  validateBody(textSchema),
  asyncHandler(async (req, res) => {
    const result = await svc.sendTextMessage({
      to: req.body.to,
      cliente_id: req.body.cliente_id,
      text: req.body.text,
      reply_to_message_id: req.body.reply_to_message_id,
      skip_window_check: req.body.skip_window_check,
    });
    res.status(201).json(result);
  }),
);

/** Media — Meta POST /messages type=image|audio|video|document|sticker. */
router.post(
  '/media',
  validateBody(mediaSchema),
  asyncHandler(async (req, res) => {
    const result = await svc.sendMediaMessage({
      to: req.body.to,
      cliente_id: req.body.cliente_id,
      type: req.body.type,
      link: req.body.link,
      id: req.body.id,
      caption: req.body.caption,
      filename: req.body.filename,
      replyToMessageId: req.body.reply_to_message_id,
      skip_window_check: req.body.skip_window_check,
    });
    res.status(201).json(result);
  }),
);

/** Interactivo — Meta POST /messages type=interactive (botones o listas). */
router.post(
  '/interactive',
  validateBody(interactiveSchema),
  asyncHandler(async (req, res) => {
    const result = await svc.sendInteractiveMessage({
      to: req.body.to,
      cliente_id: req.body.cliente_id,
      interactive: req.body.interactive,
      reply_to_message_id: req.body.reply_to_message_id,
      skip_window_check: req.body.skip_window_check,
    });
    res.status(201).json(result);
  }),
);

/** Payload crudo de Meta — casos avanzados (flows, contactos, ubicación, etc.). */
router.post(
  '/cloud',
  requireRole('admin', 'operador'),
  validateBody(cloudSchema),
  asyncHandler(async (req, res) => {
    const result = await svc.sendCloudMessage(req.body);
    res.status(201).json(result);
  }),
);

export default router;
