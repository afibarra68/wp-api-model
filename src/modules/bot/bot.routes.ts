import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { BotRule } from '../../models/botRule.model';
import { Conversation } from '../../models/conversation.model';
import { AppError } from '../../core/errors';
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

// --- Reglas del bot (solo admin) ---
router.get(
  '/rules',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    res.json(await BotRule.find().sort({ prioridad: -1 }));
  }),
);

router.post(
  '/rules',
  requireRole('admin'),
  validateBody(ruleSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await BotRule.create(req.body));
  }),
);

router.patch(
  '/rules/:id',
  requireRole('admin'),
  validateBody(ruleSchema.partial()),
  asyncHandler(async (req, res) => {
    const rule = await BotRule.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!rule) throw AppError.notFound('Regla no encontrada');
    res.json(rule);
  }),
);

router.delete(
  '/rules/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const rule = await BotRule.findByIdAndDelete(req.params.id);
    if (!rule) throw AppError.notFound('Regla no encontrada');
    res.json({ ok: true });
  }),
);

export default router;

// --- Conversaciones (admin, operador, agente) ---
export const conversationsRouter = Router();
conversationsRouter.use(authJwt, requireRole('admin', 'operador', 'agente'));

conversationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { modo } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    if (modo) filter.modo = modo;
    res.json(await Conversation.find(filter).sort({ ultima_actividad: -1 }).limit(200));
  }),
);

conversationsRouter.post(
  '/:id/handoff',
  asyncHandler(async (req, res) => {
    const conv = await Conversation.findByIdAndUpdate(
      req.params.id,
      { $set: { modo: 'humano' } },
      { new: true },
    );
    if (!conv) throw AppError.notFound('Conversación no encontrada');
    res.json(conv);
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
    const conv = await Conversation.findById(req.params.id);
    if (!conv) throw AppError.notFound('Conversación no encontrada');
    const abierta = conv.ventana_abierta_hasta && conv.ventana_abierta_hasta > new Date();
    if (!abierta) {
      throw AppError.badRequest('La ventana de 24h está cerrada; usa una plantilla');
    }
    const result = await getProvider().sendText({
      to: conv.telefono,
      text: req.body.texto,
      replyToMessageId: req.body.reply_to_message_id,
    });
    await Conversation.updateOne(
      { _id: conv._id },
      { $set: { ultima_actividad: new Date() } },
    );
    res.json({ ok: true, messageId: result.messageId });
  }),
);
