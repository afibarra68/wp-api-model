import { logger } from '../core/logger';
import { Client } from '../models/client.model';
import { Template } from '../models/template.model';
import { BotRule } from '../models/botRule.model';

const CIUDADES = ['Cali', 'Bogotá', 'Medellín', 'Barranquilla'];
const SEGMENTOS = ['premium', 'frecuente', 'nuevo'];

/** Crea datos de prueba (clientes, plantillas, reglas) si las colecciones están vacías. */
export async function seedMockups(): Promise<void> {
  if ((await Template.countDocuments()) === 0) {
    await Template.create([
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
        variables: [{ indice: 1, nombre: 'nombre', ejemplo: 'María' }],
      },
      {
        nombre_meta: 'gracias_participacion',
        idioma: 'es',
        categoria: 'marketing',
        estado: 'aprobada',
        header_tipo: 'image',
        header_url: 'https://placehold.co/1080x540/25d366/06281a/png?text=Gracias+por+participar',
        cuerpo:
          'Gracias por participar {{1}}. A continuación encontrarás el detalle del evento. ¡Dios te bendiga!',
        variables: [{ indice: 1, nombre: 'nombre', ejemplo: 'Hermano Juan' }],
      },
    ]);
    logger.info('Seed: plantillas de prueba creadas');
  }

  if ((await Client.countDocuments()) === 0) {
    const clientes = Array.from({ length: 20 }).map((_, i) => {
      const n = i + 1;
      return {
        nombre: `Cliente ${n}`,
        telefono: `5730010${String(n).padStart(5, '0')}`,
        activo: n % 7 !== 0, // algunos inactivos
        opt_in: n % 11 !== 0, // algunos sin consentimiento
        etiquetas: [CIUDADES[i % CIUDADES.length].toLowerCase(), SEGMENTOS[i % SEGMENTOS.length]],
        metadata: { ciudad: CIUDADES[i % CIUDADES.length], segmento: SEGMENTOS[i % SEGMENTOS.length] },
      };
    });
    await Client.insertMany(clientes);
    logger.info('Seed: 20 clientes de prueba creados');
  }

  if ((await BotRule.countDocuments()) === 0) {
    await BotRule.create([
      {
        nombre: 'precios',
        palabras_clave: ['precio', 'tarifa', 'costo'],
        respuesta: 'Nuestras tarifas inician desde $50.000. ¿Quieres más detalles?',
        prioridad: 10,
      },
      {
        nombre: 'saludo',
        palabras_clave: ['hola', 'buenas', 'info'],
        respuesta: '¡Hola! Gracias por escribirnos. Escribe "precio" para ver tarifas o "asesor" para hablar con una persona.',
        prioridad: 1,
      },
    ]);
    logger.info('Seed: reglas de bot de prueba creadas');
  }
}
