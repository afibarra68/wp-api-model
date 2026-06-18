import { AppError } from '../../core/errors';
import { isPostgresConnected } from '../../core/postgres';
import {
  invalidateIntegrationCache,
  loadIntegrationSettings,
} from './integration.config';
import * as repo from './integration.repository';
import {
  IntegrationConfigTiming,
  IntegrationSettings,
  UpsertIntegrationInput,
} from './integration.types';
import { resetProvider } from '../../providers';

export async function listIntegrations(): Promise<IntegrationConfigTiming[]> {
  if (!isPostgresConnected()) {
    throw AppError.badRequest('PostgreSQL no configurado. Defina DATABASE_URL y ejecute sql/setup.sql');
  }
  return repo.findAll();
}

export async function getActiveIntegration(): Promise<IntegrationSettings> {
  return loadIntegrationSettings();
}

export async function getIntegration(id: string): Promise<IntegrationConfigTiming> {
  const row = await repo.findById(id);
  if (!row) throw AppError.notFound('Integración no encontrada');
  const { whatsappToken: _w, evolutionApiKey: _e, ...safe } = row;
  return safe;
}

export async function createIntegration(
  input: UpsertIntegrationInput,
): Promise<IntegrationConfigTiming> {
  if (!isPostgresConnected()) {
    throw AppError.badRequest('PostgreSQL no configurado');
  }
  return repo.create(input);
}

export async function updateIntegration(
  id: string,
  input: Partial<UpsertIntegrationInput>,
): Promise<IntegrationConfigTiming> {
  const updated = await repo.update(id, input);
  if (!updated) throw AppError.notFound('Integración no encontrada');
  const active = await repo.findActive();
  if (active?.id === id) {
    invalidateIntegrationCache();
    resetProvider();
    await loadIntegrationSettings();
  }
  return updated;
}

export async function activateIntegration(id: string): Promise<IntegrationSettings> {
  const activated = await repo.activate(id);
  if (!activated) throw AppError.notFound('Integración no encontrada');
  invalidateIntegrationCache();
  resetProvider();
  return loadIntegrationSettings();
}

export async function deleteIntegration(id: string): Promise<void> {
  try {
    const ok = await repo.remove(id);
    if (!ok) throw AppError.notFound('Integración no encontrada');
  } catch (err) {
    if (err instanceof Error && err.message.includes('activa')) {
      throw AppError.conflict(err.message);
    }
    throw err;
  }
}

export async function refreshIntegration(): Promise<IntegrationSettings> {
  invalidateIntegrationCache();
  resetProvider();
  return loadIntegrationSettings();
}

/** Sincroniza secretos de .env → integración activa en Postgres. */
export async function syncIntegrationSecretsFromEnv(): Promise<void> {
  if (!isPostgresConnected()) return;
  const active = await repo.findActive();
  if (!active) return;

  const { settingsFromEnv } = await import('./integration.config');
  const s = settingsFromEnv();
  const patch: Partial<UpsertIntegrationInput> = {};

  if (s.webhookVerifyToken && s.webhookVerifyToken !== active.webhookVerifyToken) {
    patch.webhookVerifyToken = s.webhookVerifyToken;
  }
  if (s.provider !== active.provider) patch.provider = s.provider;
  if (s.whatsappToken && s.whatsappToken !== (active.whatsappToken ?? '')) {
    patch.whatsappToken = s.whatsappToken;
  }
  if (s.whatsappPhoneNumberId && s.whatsappPhoneNumberId !== (active.whatsappPhoneNumberId ?? '')) {
    patch.whatsappPhoneNumberId = s.whatsappPhoneNumberId;
  }

  if (!Object.keys(patch).length) return;

  await repo.update(active.id, patch);
  invalidateIntegrationCache();
  await loadIntegrationSettings();
}

/** Sincroniza .env → Postgres si la tabla está vacía (bootstrap). */
export async function seedIntegrationFromEnv(): Promise<void> {
  if (!isPostgresConnected()) return;
  const total = await repo.count();
  if (total > 0) return;

  const { settingsFromEnv } = await import('./integration.config');
  const s = settingsFromEnv();
  const created = await repo.create({
    name: 'Importado desde .env',
    provider: s.provider,
    whatsappToken: s.whatsappToken || null,
    whatsappPhoneNumberId: s.whatsappPhoneNumberId || null,
    whatsappApiVersion: s.whatsappApiVersion,
    whatsappProductPolicy: s.whatsappProductPolicy,
    whatsappMessageActivitySharing: s.whatsappMessageActivitySharing,
    webhookVerifyToken: s.webhookVerifyToken,
    evolutionBaseUrl: s.evolutionBaseUrl || null,
    evolutionApiKey: s.evolutionApiKey || null,
    evolutionInstance: s.evolutionInstance || null,
    notes: 'Creado automáticamente al arrancar desde variables de entorno.',
  });
  await repo.activate(created.id);
}
