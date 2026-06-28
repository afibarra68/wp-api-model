import { Router } from 'express';
import { env } from '../../config/env';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { DbQueue } from '../../queue/db.queue';
import { getQueue } from '../../queue';

const router = Router();

/** Cron de Vercel: procesa mensajes encolados en MongoDB. */
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
    if (!(queue instanceof DbQueue)) {
      return res.json({ processed: 0, queue: queue.name, note: 'Cola no basada en DB' });
    }

    const batchSize = Math.max(1, env.sendRatePerSecond * 55);
    const processed = await queue.runBatch(batchSize);
    res.json({ processed, queue: queue.name });
  }),
);

export default router;
