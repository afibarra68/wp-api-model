import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { AppError } from '../../core/errors';
import { serializeUser } from '../../core/serializers';
import * as userRepo from '../../repositories/user.repository';
import { hashPassword } from '../auth/auth.service';

const router = Router();

router.use(authJwt, requireRole('admin'));

const createSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  rol: z.enum(['admin', 'operador', 'agente']).default('agente'),
});

const updateSchema = z.object({
  nombre: z.string().min(1).optional(),
  rol: z.enum(['admin', 'operador', 'agente']).optional(),
  activo: z.boolean().optional(),
});

const passwordSchema = z.object({ password: z.string().min(8) });

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await userRepo.findAllUsers();
    res.json(users.map(serializeUser));
  }),
);

router.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const { nombre, email, password, rol } = req.body;
    const exists = await userRepo.findUserByEmail(email);
    if (exists) throw AppError.conflict('El email ya está registrado');
    const user = await userRepo.createUser({
      nombre,
      email,
      rol,
      passwordHash: await hashPassword(password),
    });
    res.status(201).json(serializeUser(user));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await userRepo.findUserById(req.params.id);
    if (!user) throw AppError.notFound('Usuario no encontrado');
    res.json(serializeUser(user));
  }),
);

router.patch(
  '/:id',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const user = await userRepo.updateUser(req.params.id, req.body);
    if (!user) throw AppError.notFound('Usuario no encontrado');
    res.json(serializeUser(user));
  }),
);

router.patch(
  '/:id/password',
  validateBody(passwordSchema),
  asyncHandler(async (req, res) => {
    const user = await userRepo.findUserById(req.params.id);
    if (!user) throw AppError.notFound('Usuario no encontrado');
    await userRepo.updateUser(req.params.id, {
      passwordHash: await hashPassword(req.body.password),
    });
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.user?.id === req.params.id) {
      throw AppError.badRequest('No puedes eliminar tu propio usuario');
    }
    const ok = await userRepo.deleteUser(req.params.id);
    if (!ok) throw AppError.notFound('Usuario no encontrado');
    res.json({ ok: true });
  }),
);

export default router;
