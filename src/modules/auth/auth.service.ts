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

function assertCanLogin(user: NonNullable<Awaited<ReturnType<typeof userRepo.findUserByEmail>>>) {
  if (user.estadoAprobacion === 'pendiente') {
    throw AppError.unauthorized(
      'Tu cuenta está pendiente de aprobación por un administrador',
    );
  }
  if (user.estadoAprobacion === 'rechazado') {
    throw AppError.unauthorized('Tu solicitud de registro fue rechazada');
  }
  if (!user.activo) {
    throw AppError.unauthorized('Credenciales inválidas');
  }
}

export async function login(email: string, password: string) {
  const user = await userRepo.findUserByEmail(email, true);
  if (!user || !user.passwordHash) {
    throw AppError.unauthorized('Credenciales inválidas');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw AppError.unauthorized('Credenciales inválidas');

  assertCanLogin(user);

  if (user.rol === 'admin' && user.mfaEnabled && user.totpSecret) {
    const { signMfaPending } = await import('./mfa.service');
    return {
      requiresMfa: true as const,
      mfaToken: signMfaPending(user.id),
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
      },
    };
  }

  return issueSession(user);
}

export async function issueSession(user: {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}) {
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
  if (!user) throw AppError.unauthorized('Usuario no válido');
  assertCanLogin(user);

  const pub: PublicUser = {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol as Role,
  };
  return { token: signAccess(pub) };
}

export async function me(userId: string): Promise<PublicUser & { mfaEnabled?: boolean }> {
  const user = await userRepo.findUserById(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol as Role,
    ...(user.rol === 'admin' ? { mfaEnabled: user.mfaEnabled } : {}),
  };
}

export async function register(input: {
  nombre: string;
  email: string;
  password: string;
}): Promise<{ ok: true; message: string }> {
  const email = input.email.trim().toLowerCase();
  const existing = await userRepo.findUserByEmail(email);
  if (existing) {
    if (existing.estadoAprobacion === 'pendiente') {
      throw AppError.conflict('Ya hay una solicitud pendiente con este correo');
    }
    throw AppError.conflict('El correo ya está registrado');
  }

  await userRepo.createUser({
    nombre: input.nombre.trim(),
    email,
    passwordHash: await hashPassword(input.password),
    rol: 'agente',
    activo: false,
    estadoAprobacion: 'pendiente',
  });

  return {
    ok: true,
    message:
      'Solicitud enviada. Un administrador debe aprobar tu cuenta antes de que puedas ingresar.',
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
