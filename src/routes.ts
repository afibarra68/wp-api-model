import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import clientsRoutes from './modules/clients/clients.routes';
import templatesRoutes from './modules/templates/templates.routes';
import campaignsRoutes from './modules/campaigns/campaigns.routes';
import integrationsRoutes from './modules/integrations/integration.routes';
import messagesRoutes from './modules/messages/messages.routes';
import webhooksRoutes from './modules/webhooks/webhooks.routes';
import botRoutes, { conversationsRouter } from './modules/bot/bot.routes';
import internalRoutes from './modules/internal/internal.routes';
import personasRoutes from './modules/personas/personas.routes';
import pagosRoutes from './modules/pagos/pagos.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/clients', clientsRoutes);
router.use('/templates', templatesRoutes);
router.use('/campaigns', campaignsRoutes);
router.use('/integrations', integrationsRoutes);
router.use('/messages', messagesRoutes);
router.use('/bot', botRoutes);
router.use('/conversations', conversationsRouter);
router.use('/personas', personasRoutes);
router.use('/pagos', pagosRoutes);
router.use('/webhooks', webhooksRoutes);
router.use('/internal', internalRoutes);

export default router;
