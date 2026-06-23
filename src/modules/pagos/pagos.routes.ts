import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/asyncHandler';
import { validateBody } from '../../middlewares/validate';
import { authJwt, requireRole } from '../../middlewares/auth';
import { AppError } from '../../core/errors';
import { serializePago } from '../../core/serializers';
import * as pagoRepo from '../../repositories/pago.repository';
import * as personaRepo from '../../repositories/persona.repository';

const router = Router();

router.use(authJwt, requireRole('admin', 'operador'));

const createSchema = z.object({
  persona_id: z.string().uuid(),
  monto: z.number().positive().optional(),
  moneda: z.string().default('COP'),
  concepto: z.string().optional(),
  fecha_vencimiento: z.string().optional(),
  referencia: z.string().optional(),
  notas: z.string().optional(),
});

const updateSchema = z.object({
  estado: z.enum(['pendiente', 'pagado', 'cancelado']).optional(),
  monto: z.number().positive().nullable().optional(),
  moneda: z.string().optional(),
  concepto: z.string().nullable().optional(),
  fecha_vencimiento: z.string().nullable().optional(),
  fecha_pago: z.string().nullable().optional(),
  referencia: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
});

router.get(
  '/resumen',
  asyncHandler(async (_req, res) => {
    res.json(await pagoRepo.resumenPagos());
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { estado, persona_id, categoria, search } = req.query as Record<string, string>;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const filter: pagoRepo.PagoFilter = {};
    if (estado === 'pendiente' || estado === 'pagado' || estado === 'cancelado') {
      filter.estado = estado;
    }
    if (persona_id) filter.personaId = persona_id;
    if (categoria) filter.categoriaSlug = categoria;
    if (search) filter.search = search;

    const [items, total] = await Promise.all([
      pagoRepo.findPagos(filter, page, limit),
      pagoRepo.countPagos(filter),
    ]);

    res.json({
      items: items.map(serializePago),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  }),
);

router.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const persona = await personaRepo.findPersonaById(req.body.persona_id);
    if (!persona) throw AppError.notFound('Persona no encontrada');

    const pago = await pagoRepo.createPago({
      personaId: req.body.persona_id,
      monto: req.body.monto,
      moneda: req.body.moneda,
      concepto: req.body.concepto,
      fechaVencimiento: req.body.fecha_vencimiento
        ? new Date(req.body.fecha_vencimiento)
        : undefined,
      referencia: req.body.referencia,
      notas: req.body.notas,
    });
    const full = await pagoRepo.findPagoById(pago.id);
    res.status(201).json(serializePago(full!));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const pago = await pagoRepo.findPagoById(req.params.id);
    if (!pago) throw AppError.notFound('Pago no encontrado');
    res.json(serializePago(pago));
  }),
);

router.patch(
  '/:id',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const patch: Parameters<typeof pagoRepo.updatePago>[1] = {
      estado: req.body.estado,
      monto: req.body.monto,
      moneda: req.body.moneda,
      concepto: req.body.concepto,
      referencia: req.body.referencia,
      notas: req.body.notas,
    };
    if (req.body.fecha_vencimiento !== undefined) {
      patch.fechaVencimiento = req.body.fecha_vencimiento
        ? new Date(req.body.fecha_vencimiento)
        : null;
    }
    if (req.body.fecha_pago !== undefined) {
      patch.fechaPago = req.body.fecha_pago ? new Date(req.body.fecha_pago) : null;
    }
    if (req.body.estado === 'pagado' && !req.body.fecha_pago) {
      patch.fechaPago = new Date();
    }

    const pago = await pagoRepo.updatePago(req.params.id, patch);
    if (!pago) throw AppError.notFound('Pago no encontrado');
    const full = await pagoRepo.findPagoById(pago.id);
    res.json(serializePago(full!));
  }),
);

export default router;
