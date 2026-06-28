import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt } from '../../middlewares/auth';
import { loginLimiter, registerLimiter } from '../../middlewares/rateLimit';
import * as authService from './auth.service';
import * as mfaService from './mfa.service';
import { AppError } from '../../core/errors';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

const registerSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const mfaVerifySchema = z.object({
  mfaToken: z.string().min(10),
  code: z.string().min(6).max(8),
});

const mfaEnableSchema = z.object({
  secret: z.string().min(10),
  code: z.string().min(6).max(8),
});

const mfaDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(6).max(8),
});

router.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  }),
);

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
  '/mfa/verify',
  loginLimiter,
  validateBody(mfaVerifySchema),
  asyncHandler(async (req, res) => {
    const result = await mfaService.verifyMfaLogin(req.body.mfaToken, req.body.code);
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

router.get(
  '/mfa/status',
  authJwt,
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const status = await mfaService.getMfaStatus(req.user.id);
    res.json(status);
  }),
);

router.post(
  '/mfa/setup',
  authJwt,
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const setup = await mfaService.setupMfa(req.user.id);
    res.json(setup);
  }),
);

router.post(
  '/mfa/enable',
  authJwt,
  validateBody(mfaEnableSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const result = await mfaService.enableMfa(req.user.id, req.body.secret, req.body.code);
    res.json(result);
  }),
);

router.post(
  '/mfa/disable',
  authJwt,
  validateBody(mfaDisableSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const result = await mfaService.disableMfa(req.user.id, req.body.password, req.body.code);
    res.json(result);
  }),
);

export default router;
