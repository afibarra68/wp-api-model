import { Router } from 'express';
import { env } from '../../config/env';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { DbQueue } from '../../queue/db.queue';
import { getQueue } from '../../queue';
import { releaseAllCampaignBatches } from '../campaigns/campaignScheduler';

const router = Router();

/** Cron: procesa mensajes encolados y libera lotes diarios de campañas. */
router.get(
  '/process-queue',
  asyncHandler(async (req, res) => {
    if (env.cronSecret) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${env.cronSecret}`) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Cron no autorizado' } });
      }
    }

    const queue = getQueue();
    let processed = 0;
    if (queue instanceof DbQueue) {
      const batchSize = Math.max(1, env.sendRatePerSecond * 55);
      processed = await queue.runBatch(batchSize);
    }

    const released = await releaseAllCampaignBatches();
    res.json({ processed, released, queue: queue.name });
  }),
);

export default router;
