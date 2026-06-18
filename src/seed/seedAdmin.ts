import { env } from '../config/env';
import { logger } from '../core/logger';
import { User } from '../models/user.model';
import { hashPassword } from '../modules/auth/auth.service';

/** Crea el usuario base admin si no existe ningún usuario. Idempotente. */
export async function seedAdmin(): Promise<void> {
  const count = await User.countDocuments();
  if (count > 0) {
    logger.info('Seed: ya existen usuarios, no se crea el admin base');
    return;
  }
  await User.create({
    nombre: 'Administrador',
    email: env.seedAdminEmail.toLowerCase(),
    rol: 'admin',
    activo: true,
    password_hash: await hashPassword(env.seedAdminPassword),
  });
  logger.info({ email: env.seedAdminEmail }, 'Seed: usuario admin base creado');
}
