import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

type Schema = ZodTypeAny;

/** Valida req.body contra un esquema Zod y reemplaza el body por el valor parseado. */
export function validateBody(schema: Schema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };
}

/** Valida req.query contra un esquema Zod. */
export function validateQuery(schema: Schema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    // Express 4: req.query es de solo lectura en algunos setups; usamos un cast seguro.
    (req as unknown as { validatedQuery: unknown }).validatedQuery = result.data;
    next();
  };
}
