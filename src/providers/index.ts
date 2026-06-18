import { logger } from '../core/logger';
import { getIntegrationSettings } from '../modules/integrations/integration.config';
import { MessageProvider } from './provider.interface';
import { SimulationProvider } from './simulation.provider';
import { MetaCloudProvider } from './metaCloud.provider';
import { EvolutionProvider } from './evolution.provider';

let instance: MessageProvider | null = null;

/** Invalida el singleton (tras cambiar integración en Postgres). */
export function resetProvider(): void {
  instance = null;
}

/** Devuelve el proveedor según la integración activa (Postgres o .env). */
export function getProvider(): MessageProvider {
  if (instance) return instance;
  const settings = getIntegrationSettings();
  switch (settings.provider) {
    case 'meta-cloud':
      instance = new MetaCloudProvider();
      break;
    case 'evolution':
      instance = new EvolutionProvider();
      break;
    case 'simulation':
    default:
      instance = new SimulationProvider();
      break;
  }
  logger.info({ provider: instance.name, config: settings.name }, 'Proveedor de mensajes inicializado');
  return instance;
}

export * from './provider.interface';
