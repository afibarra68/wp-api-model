import { logger } from '../core/logger';
import * as templateRepo from '../repositories/template.repository';

/** Plantilla oficial de prueba de Meta Cloud API (sin variables). */
export const HELLO_WORLD_META = {
  nombre_meta: 'hello_world',
  idioma: 'en_US',
  categoria: 'utility' as const,
  estado: 'aprobada' as const,
  cuerpo:
    'Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.',
  variables: [] as const,
};

/** Garantiza la plantilla hello_world en la base (idempotente). */
export async function seedHelloWorldTemplate(): Promise<void> {
  const template = await templateRepo.upsertTemplateByMetaName({
    ...HELLO_WORLD_META,
    variables: [],
  });
  logger.info({ id: template.id, nombre: template.nombreMeta }, 'Plantilla hello_world lista');
}
