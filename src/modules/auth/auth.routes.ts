import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt } from '../../middlewares/auth';
import { loginLimiter } from '../../middlewares/rateLimit';
import * as authService from './auth.service';
import { AppError } from '../../core/errors';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

router.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  }),
);

router.post(
  '/refresh',
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.refresh(req.body.refreshToken);
    res.json(result);
  }),
);

router.get(
  '/me',
  authJwt,
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const user = await authService.me(req.user.id);
    res.json(user);
  }),
);

export default router;
