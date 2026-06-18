import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { User } from '../../models/user.model';
import { AppError } from '../../core/errors';
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

function publicUser(u: InstanceType<typeof User>) {
  return {
    id: String(u._id),
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    activo: u.activo,
    ultimo_login: u.ultimo_login,
  };
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users.map(publicUser));
  }),
);

router.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const { nombre, email, password, rol } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) throw AppError.conflict('El email ya está registrado');
    const user = await User.create({
      nombre,
      email,
      rol,
      password_hash: await hashPassword(password),
    });
    res.status(201).json(publicUser(user));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw AppError.notFound('Usuario no encontrado');
    res.json(publicUser(user));
  }),
);

router.patch(
  '/:id',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!user) throw AppError.notFound('Usuario no encontrado');
    res.json(publicUser(user));
  }),
);

router.patch(
  '/:id/password',
  validateBody(passwordSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw AppError.notFound('Usuario no encontrado');
    user.password_hash = await hashPassword(req.body.password);
    await user.save();
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.user?.id === req.params.id) {
      throw AppError.badRequest('No puedes eliminar tu propio usuario');
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) throw AppError.notFound('Usuario no encontrado');
    res.json({ ok: true });
  }),
);

export default router;
