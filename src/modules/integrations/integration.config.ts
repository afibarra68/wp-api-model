import { env } from '../../config/env';
import { logger } from '../../core/logger';
import { isPostgresConnected } from '../../core/postgres';
import * as repo from './integration.repository';
import { IntegrationConfigRow, IntegrationSettings } from './integration.types';

let cached: IntegrationSettings | null = null;

/** Construye settings desde variables de entorno (.env fallback). */
export function settingsFromEnv(): IntegrationSettings {
  return {
    name: 'Entorno (.env)',
    provider: env.provider,
    webhookVerifyToken: env.webhookVerifyToken,
    webhookPublicUrl: null,
    whatsappToken: env.whatsappToken,
    whatsappPhoneNumberId: env.whatsappPhoneNumberId,
    whatsappApiVersion: env.whatsappApiVersion,
    whatsappProductPolicy: env.whatsappProductPolicy || null,
    whatsappMessageActivitySharing: env.whatsappMessageActivitySharing ?? null,
    evolutionBaseUrl: env.evolutionBaseUrl,
    evolutionApiKey: env.evolutionApiKey,
    evolutionInstance: env.evolutionInstance,
  };
}

function rowToSettings(row: IntegrationConfigRow): IntegrationSettings {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    webhookVerifyToken: row.webhookVerifyToken,
    webhookPublicUrl: row.webhookPublicUrl,
    whatsappToken: row.whatsappToken ?? '',
    whatsappPhoneNumberId: row.whatsappPhoneNumberId ?? '',
    whatsappApiVersion: row.whatsappApiVersion,
    whatsappProductPolicy: (row.whatsappProductPolicy as IntegrationSettings['whatsappProductPolicy']) ?? null,
    whatsappMessageActivitySharing: row.whatsappMessageActivitySharing,
    evolutionBaseUrl: row.evolutionBaseUrl ?? '',
    evolutionApiKey: row.evolutionApiKey ?? '',
    evolutionInstance: row.evolutionInstance ?? '',
  };
}

/** Carga la integración activa desde Postgres (o .env si no hay DB). */
export async function loadIntegrationSettings(): Promise<IntegrationSettings> {
  if (!isPostgresConnected()) {
    cached = settingsFromEnv();
    return cached;
  }
  const active = await repo.findActive();
  cached = active ? rowToSettings(active) : settingsFromEnv();
  logger.info(
    { provider: cached.provider, source: active ? 'postgres' : 'env', name: cached.name },
    'Configuración de integración cargada',
  );
  return cached;
}

/** Settings en memoria (llamar loadIntegrationSettings al inicio). */
export function getIntegrationSettings(): IntegrationSettings {
  return cached ?? settingsFromEnv();
}

export function invalidateIntegrationCache(): void {
  cached = null;
}

/** Resuelve webhook verify token por phone_number_id del payload Meta. */
export async function resolveWebhookVerifyToken(
  phoneNumberId?: string,
): Promise<string> {
  const settings = getIntegrationSettings();
  if (!phoneNumberId || !isPostgresConnected()) {
    return settings.webhookVerifyToken;
  }
  // Si hay múltiples configs en el futuro, buscar por phone_number_id.
  const active = await repo.findActive();
  if (active?.whatsappPhoneNumberId === phoneNumberId) {
    return active.webhookVerifyToken;
  }
  return settings.webhookVerifyToken;
}
