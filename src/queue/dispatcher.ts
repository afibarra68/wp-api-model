import { logger } from '../core/logger';
import { getQueue } from './index';
import { processEmissionJob } from './emission.processor';

/** Registra el procesador en la cola. Llamar una vez al arrancar el servidor. */
export function startDispatcher(): void {
  getQueue().process(processEmissionJob);
  logger.info('Dispatcher de emisión registrado');
}

export { processEmissionJob } from './emission.processor';
