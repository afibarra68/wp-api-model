import { logger } from '../core/logger';
import * as templateRepo from '../repositories/template.repository';
import * as convRepo from '../repositories/conversation.repository';

/** Plantillas y reglas bot opcionales (SEED_MOCKUPS=true). No crea clientes. */
export async function seedMockups(): Promise<void> {
  if ((await templateRepo.countTemplates()) === 0) {
    await templateRepo.createTemplatesBulk([
      {
        nombre_meta: 'notificacion_pedido',
        idioma: 'es',
        categoria: 'utility',
        estado: 'aprobada',
        cuerpo: 'Hola {{1}}, tu pedido {{2}} ya va en camino.',
        variables: [
          { indice: 1, nombre: 'nombre', ejemplo: 'Carlos' },
          { indice: 2, nombre: 'pedido', ejemplo: '10254' },
        ],
      },
      {
        nombre_meta: 'promocion_junio',
        idioma: 'es',
        categoria: 'marketing',
        estado: 'aprobada',
        cuerpo: 'Hola {{1}}, tenemos ofertas exclusivas para ti este mes.',
        variables: [{ indice: 1, nombre: 'nombre', ejemplo: 'Maria' }],
      },
    ]);
    logger.info('Seed: plantillas de prueba creadas');
  }

  if ((await convRepo.countBotRules()) === 0) {
    await convRepo.createBotRulesBulk([
      {
        nombre: 'precios',
        palabras_clave: ['precio', 'tarifa', 'costo'],
        respuesta: 'Nuestras tarifas inician desde $50.000. ¿Quieres mas detalles?',
        prioridad: 10,
      },
      {
        nombre: 'saludo',
        palabras_clave: ['hola', 'buenas', 'info'],
        respuesta:
          'Hola! Gracias por escribirnos. Escribe "precio" para ver tarifas o "asesor" para hablar con una persona.',
        prioridad: 1,
      },
    ]);
    logger.info('Seed: reglas de bot de prueba creadas');
  }
}
