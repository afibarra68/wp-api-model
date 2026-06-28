import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../../core/errors';
import { Role } from '../../middlewares/auth';
import * as userRepo from '../../repositories/user.repository';

export interface PublicUser {
  id: string;
  nombre: string;
  email: string;
  rol: Role;
}

function signAccess(user: PublicUser): string {
  return jwt.sign({ email: user.email, rol: user.rol }, env.jwtSecret, {
    subject: user.id,
    expiresIn: env.jwtExpiresIn,
  } as SignOptions);
}

function signRefresh(userId: string): string {
  return jwt.sign({ type: 'refresh' }, env.jwtRefreshSecret, {
    subject: userId,
    expiresIn: env.jwtRefreshExpiresIn,
  } as SignOptions);
}

export async function login(email: string, password: string) {
  const user = await userRepo.findUserByEmail(email, true);
  if (!user || !user.activo || !user.passwordHash) {
    throw AppError.unauthorized('Credenciales inválidas');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw AppError.unauthorized('Credenciales inválidas');

  await userRepo.updateUser(user.id, { ultimoLogin: new Date() });

  const pub: PublicUser = {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol as Role,
  };

  return {
    token: signAccess(pub),
    refreshToken: signRefresh(pub.id),
    user: pub,
  };
}

export async function refresh(refreshToken: string) {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(refreshToken, env.jwtRefreshSecret) as jwt.JwtPayload;
  } catch {
    throw AppError.unauthorized('Refresh token inválido o expirado');
  }
  if (payload.type !== 'refresh') throw AppError.unauthorized('Token no es de refresco');

  const user = await userRepo.findUserById(payload.sub!);
  if (!user || !user.activo) throw AppError.unauthorized('Usuario no válido');

  const pub: PublicUser = {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol as Role,
  };
  return { token: signAccess(pub) };
}

export async function me(userId: string): Promise<PublicUser> {
  const user = await userRepo.findUserById(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol as Role,
  };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.bcryptRounds);
}

export async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  const user = await userRepo.findUserById(userId, true);
  if (!user?.passwordHash) return false;
  return bcrypt.compare(password, user.passwordHash);
}
