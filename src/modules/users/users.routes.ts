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
  asyncHandler(async (req, res) => {
    const { estado_aprobacion } = req.query as Record<string, string>;
    const filter: userRepo.UserListFilter = {};
    if (
      estado_aprobacion === 'pendiente' ||
      estado_aprobacion === 'aprobado' ||
      estado_aprobacion === 'rechazado'
    ) {
      filter.estadoAprobacion = estado_aprobacion;
    }
    const users = await userRepo.findAllUsers(filter);
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
      activo: true,
      estadoAprobacion: 'aprobado',
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

router.post(
  '/:id/aprobar',
  asyncHandler(async (req, res) => {
    const user = await userRepo.findUserById(req.params.id);
    if (!user) throw AppError.notFound('Usuario no encontrado');
    if (user.estadoAprobacion === 'aprobado' && user.activo) {
      throw AppError.conflict('El usuario ya está aprobado');
    }
    const updated = await userRepo.updateUser(req.params.id, {
      estadoAprobacion: 'aprobado',
      activo: true,
    });
    res.json(serializeUser(updated!));
  }),
);

router.post(
  '/:id/rechazar',
  asyncHandler(async (req, res) => {
    const user = await userRepo.findUserById(req.params.id);
    if (!user) throw AppError.notFound('Usuario no encontrado');
    if (req.user?.id === req.params.id) {
      throw AppError.badRequest('No puedes rechazar tu propio usuario');
    }
    const updated = await userRepo.updateUser(req.params.id, {
      estadoAprobacion: 'rechazado',
      activo: false,
    });
    res.json(serializeUser(updated!));
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
