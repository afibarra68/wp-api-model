import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { logger } from '../../core/logger';
import { getIntegrationSettings } from '../integrations/integration.config';
import { ESTADOS_MENSAJE } from '../../models/messageLog.model';
import { handleInbound } from '../bot/bot.service';
import { processMetaWebhook, updateMessageStatus } from './webhooks.service';

const router = Router();

// Verificación del webhook (Meta hace un GET con hub.challenge).
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === getIntegrationSettings().webhookVerifyToken) {
    return res.status(200).send(String(challenge));
  }
  return res.sendStatus(403);
});

// Recepción de eventos reales de Meta.
router.post(
  '/whatsapp',
  asyncHandler(async (req, res) => {
    // Responder 200 rápido; Meta reintenta si no.
    res.status(200).send('EVENT_RECEIVED');
    try {
      await processMetaWebhook(req.body);
    } catch (err) {
      logger.error({ err }, 'Error procesando webhook de Meta');
    }
  }),
);

// Endpoint de simulación para pruebas locales (sin Meta).
const simulateSchema = z.union([
  z.object({
    whatsapp_message_id: z.string().min(1),
    nuevo_estado: z.enum(ESTADOS_MENSAJE),
  }),
  z.object({
    telefono: z.string().min(1),
    texto: z.string().min(1),
  }),
]);

router.post(
  '/simulate',
  validateBody(simulateSchema),
  asyncHandler(async (req, res) => {
    if ('whatsapp_message_id' in req.body) {
      const result = await updateMessageStatus(req.body.whatsapp_message_id, req.body.nuevo_estado);
      return res.json(result);
    }
    const result = await handleInbound(req.body.telefono, req.body.texto);
    return res.json(result);
  }),
);

export default router;
