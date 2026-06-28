import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { AppError } from '../../core/errors';
import { serializeBotRule, serializeConversation } from '../../core/serializers';
import * as convRepo from '../../repositories/conversation.repository';
import { getProvider } from '../../providers';

const router = Router();

router.use(authJwt);

const ruleSchema = z.object({
  nombre: z.string().min(1),
  palabras_clave: z.array(z.string()).min(1),
  respuesta_tipo: z.enum(['texto']).default('texto'),
  respuesta: z.string().min(1),
  activo: z.boolean().default(true),
  prioridad: z.number().int().default(0),
});

router.get(
  '/rules',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const rules = await convRepo.findAllBotRules();
    res.json(rules.map(serializeBotRule));
  }),
);

router.post(
  '/rules',
  requireRole('admin'),
  validateBody(ruleSchema),
  asyncHandler(async (req, res) => {
    const rule = await convRepo.createBotRule(req.body);
    res.status(201).json(serializeBotRule(rule));
  }),
);

router.patch(
  '/rules/:id',
  requireRole('admin'),
  validateBody(ruleSchema.partial()),
  asyncHandler(async (req, res) => {
    const rule = await convRepo.updateBotRule(req.params.id, req.body);
    if (!rule) throw AppError.notFound('Regla no encontrada');
    res.json(serializeBotRule(rule));
  }),
);

router.delete(
  '/rules/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const ok = await convRepo.deleteBotRule(req.params.id);
    if (!ok) throw AppError.notFound('Regla no encontrada');
    res.json({ ok: true });
  }),
);

export default router;

export const conversationsRouter = Router();
conversationsRouter.use(authJwt, requireRole('admin', 'operador', 'agente'));

conversationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { modo } = req.query as Record<string, string>;
    const items = await convRepo.findConversations(modo);
    res.json(items.map(serializeConversation));
  }),
);

conversationsRouter.post(
  '/:id/handoff',
  asyncHandler(async (req, res) => {
    const conv = await convRepo.setConversationModo(req.params.id, 'humano');
    if (!conv) throw AppError.notFound('Conversación no encontrada');
    res.json(serializeConversation(conv));
  }),
);

const replySchema = z.object({
  texto: z.string().min(1),
  reply_to_message_id: z.string().optional(),
});

conversationsRouter.post(
  '/:id/reply',
  validateBody(replySchema),
  asyncHandler(async (req, res) => {
    const conv = await convRepo.findConversationById(req.params.id);
    if (!conv) throw AppError.notFound('Conversación no encontrada');
    const abierta = conv.ventanaAbiertaHasta && conv.ventanaAbiertaHasta > new Date();
    if (!abierta) {
      throw AppError.badRequest('La ventana de 24h está cerrada; usa una plantilla');
    }
    const result = await getProvider().sendText({
      to: conv.telefono,
      text: req.body.texto,
      replyToMessageId: req.body.reply_to_message_id,
    });
    await convRepo.touchConversation(conv.id);
    res.json({ ok: true, messageId: result.messageId });
  }),
);
