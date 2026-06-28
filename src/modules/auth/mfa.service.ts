import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../../core/errors';
import * as userRepo from '../../repositories/user.repository';
import * as authService from './auth.service';
import {
  buildOtpAuthUrl,
  generateTotpSecret,
  verifyTotpCode,
} from './totp';

function assertAdmin(user: NonNullable<Awaited<ReturnType<typeof userRepo.findUserById>>>) {
  if (user.rol !== 'admin') {
    throw AppError.forbidden('La autenticación en dos pasos solo aplica a administradores');
  }
}

export function signMfaPending(userId: string): string {
  return jwt.sign({ type: 'mfa_pending' }, env.jwtSecret, {
    subject: userId,
    expiresIn: '5m',
  } as SignOptions);
}

export function verifyMfaPendingToken(mfaToken: string): string {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(mfaToken, env.jwtSecret) as jwt.JwtPayload;
  } catch {
    throw AppError.unauthorized('Sesión 2FA expirada. Vuelve a iniciar sesión.');
  }
  if (payload.type !== 'mfa_pending' || !payload.sub) {
    throw AppError.unauthorized('Token 2FA inválido');
  }
  return String(payload.sub);
}

export async function verifyMfaLogin(mfaToken: string, code: string) {
  const userId = verifyMfaPendingToken(mfaToken);
  const user = await userRepo.findUserById(userId);
  if (!user?.mfaEnabled || !user.totpSecret) {
    throw AppError.unauthorized('2FA no configurado para este usuario');
  }

  if (!verifyTotpCode(code, user.totpSecret)) {
    throw AppError.unauthorized('Código 2FA incorrecto');
  }

  return authService.issueSession(user);
}

export async function getMfaStatus(userId: string) {
  const user = await userRepo.findUserById(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  assertAdmin(user);
  return { enabled: user.mfaEnabled, available: true };
}

export async function setupMfa(userId: string) {
  const user = await userRepo.findUserById(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  assertAdmin(user);
  if (user.mfaEnabled) throw AppError.conflict('2FA ya está activo');

  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpAuthUrl(user.email, secret);

  return { secret, otpauthUrl };
}

export async function enableMfa(userId: string, secret: string, code: string) {
  const user = await userRepo.findUserById(userId);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  assertAdmin(user);
  if (user.mfaEnabled) throw AppError.conflict('2FA ya está activo');
  if (!secret.trim()) throw AppError.badRequest('Secreto 2FA requerido');

  if (!verifyTotpCode(code, secret)) {
    throw AppError.badRequest('Código incorrecto. Escanea el QR e intenta de nuevo.');
  }

  await userRepo.updateUser(userId, { totpSecret: secret, mfaEnabled: true });
  return { ok: true, enabled: true };
}

export async function disableMfa(userId: string, password: string, code: string) {
  const user = await userRepo.findUserById(userId, true);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  assertAdmin(user);
  if (!user.mfaEnabled || !user.totpSecret) {
    throw AppError.badRequest('2FA no está activo');
  }

  const okPassword = await authService.verifyUserPassword(userId, password);
  if (!okPassword) throw AppError.unauthorized('Contraseña incorrecta');

  if (!verifyTotpCode(code, user.totpSecret)) {
    throw AppError.unauthorized('Código 2FA incorrecto');
  }

  await userRepo.updateUser(userId, { totpSecret: null, mfaEnabled: false });
  return { ok: true, enabled: false };
}
