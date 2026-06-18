import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../core/errors';

export type Role = 'admin' | 'operador' | 'agente';

export interface AuthUser {
  id: string;
  email: string;
  rol: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Verifica el access token y coloca req.user. */
export function authJwt(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Falta el token Bearer'));
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    req.user = {
      id: String(payload.sub),
      email: String(payload.email ?? ''),
      rol: (payload.rol as Role) ?? 'agente',
    };
    next();
  } catch {
    next(AppError.unauthorized('Token inválido o expirado'));
  }
}

/** Exige que el usuario tenga alguno de los roles indicados. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.rol)) {
      return next(AppError.forbidden(`Requiere rol: ${roles.join(' | ')}`));
    }
    next();
  };
}
