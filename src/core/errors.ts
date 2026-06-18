import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger';
import { env } from '../config/env';

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'No autorizado') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'Sin permisos suficientes') {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Recurso no encontrado') {
    return new AppError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string, details?: unknown) {
    return new AppError(409, 'CONFLICT', message, details);
  }
  static validation(message: string, details?: unknown) {
    return new AppError(422, 'VALIDATION_ERROR', message, details);
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  // Errores de PostgreSQL duplicado (índice único)
  const pgErr = err as { code?: string; constraint?: string; detail?: string };
  if (pgErr?.code === '23505') {
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'Registro duplicado',
        details: pgErr.detail ?? pgErr.constraint,
      },
    });
  }

  logger.error({ err }, 'Error no controlado');
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: env.isProd ? 'Error interno del servidor' : String((err as Error)?.message ?? err),
    },
  });
}
