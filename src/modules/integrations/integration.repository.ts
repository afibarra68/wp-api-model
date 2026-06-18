import { getPool, isPostgresConnected } from '../../core/postgres';
import {
  IntegrationConfigRow,
  IntegrationConfigTiming,
  ProviderType,
  UpsertIntegrationInput,
} from './integration.types';

type DbRow = {
  id: string;
  name: string;
  provider: ProviderType;
  is_active: boolean;
  whatsapp_token: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_api_version: string;
  whatsapp_product_policy: string | null;
  whatsapp_message_activity_sharing: boolean | null;
  webhook_verify_token: string;
  webhook_public_url: string | null;
  evolution_base_url: string | null;
  evolution_api_key: string | null;
  evolution_instance: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapRow(row: DbRow, includeSecrets = false): IntegrationConfigRow | IntegrationConfigTiming {
  const base: IntegrationConfigTiming = {
    id: row.id,
    name: row.name,
    provider: row.provider,
    isActive: row.is_active,
    whatsappPhoneNumberId: row.whatsapp_phone_number_id,
    whatsappApiVersion: row.whatsapp_api_version,
    whatsappProductPolicy: row.whatsapp_product_policy,
    whatsappMessageActivitySharing: row.whatsapp_message_activity_sharing,
    webhookVerifyToken: row.webhook_verify_token,
    webhookPublicUrl: row.webhook_public_url,
    evolutionBaseUrl: row.evolution_base_url,
    evolutionInstance: row.evolution_instance,
    notes: row.notes,
    hasWhatsappToken: !!row.whatsapp_token,
    hasEvolutionApiKey: !!row.evolution_api_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (!includeSecrets) return base;
  return {
    ...base,
    whatsappToken: row.whatsapp_token,
    evolutionApiKey: row.evolution_api_key,
  };
}

const SELECT_FIELDS = `
  id, name, provider, is_active,
  whatsapp_token, whatsapp_phone_number_id, whatsapp_api_version,
  whatsapp_product_policy, whatsapp_message_activity_sharing,
  webhook_verify_token, webhook_public_url,
  evolution_base_url, evolution_api_key, evolution_instance,
  notes, created_at, updated_at
`;

export async function findAll(): Promise<IntegrationConfigTiming[]> {
  if (!isPostgresConnected()) return [];
  const { rows } = await getPool().query<DbRow>(
    `SELECT ${SELECT_FIELDS} FROM integration_configs ORDER BY is_active DESC, created_at DESC`,
  );
  return rows.map((r) => mapRow(r) as IntegrationConfigTiming);
}

export async function findById(id: string): Promise<IntegrationConfigRow | null> {
  if (!isPostgresConnected()) return null;
  const { rows } = await getPool().query<DbRow>(
    `SELECT ${SELECT_FIELDS} FROM integration_configs WHERE id = $1`,
    [id],
  );
  return rows[0] ? (mapRow(rows[0], true) as IntegrationConfigRow) : null;
}

export async function findActive(): Promise<IntegrationConfigRow | null> {
  if (!isPostgresConnected()) return null;
  const { rows } = await getPool().query<DbRow>(
    `SELECT ${SELECT_FIELDS} FROM integration_configs WHERE is_active = TRUE LIMIT 1`,
  );
  return rows[0] ? (mapRow(rows[0], true) as IntegrationConfigRow) : null;
}

export async function create(input: UpsertIntegrationInput): Promise<IntegrationConfigTiming> {
  const { rows } = await getPool().query<DbRow>(
    `INSERT INTO integration_configs (
      name, provider,
      whatsapp_token, whatsapp_phone_number_id, whatsapp_api_version,
      whatsapp_product_policy, whatsapp_message_activity_sharing,
      webhook_verify_token, webhook_public_url,
      evolution_base_url, evolution_api_key, evolution_instance,
      notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING ${SELECT_FIELDS}`,
    [
      input.name,
      input.provider,
      input.whatsappToken ?? null,
      input.whatsappPhoneNumberId ?? null,
      input.whatsappApiVersion ?? 'v20.0',
      input.whatsappProductPolicy ?? null,
      input.whatsappMessageActivitySharing ?? null,
      input.webhookVerifyToken ?? 'dev-verify-token',
      input.webhookPublicUrl ?? null,
      input.evolutionBaseUrl ?? null,
      input.evolutionApiKey ?? null,
      input.evolutionInstance ?? null,
      input.notes ?? null,
    ],
  );
  return mapRow(rows[0]) as IntegrationConfigTiming;
}

export async function update(
  id: string,
  input: Partial<UpsertIntegrationInput>,
): Promise<IntegrationConfigTiming | null> {
  const current = await findById(id);
  if (!current) return null;

  const merged: UpsertIntegrationInput = {
    name: input.name ?? current.name,
    provider: input.provider ?? current.provider,
    whatsappToken: input.whatsappToken !== undefined ? input.whatsappToken : current.whatsappToken,
    whatsappPhoneNumberId:
      input.whatsappPhoneNumberId !== undefined
        ? input.whatsappPhoneNumberId
        : current.whatsappPhoneNumberId,
    whatsappApiVersion: input.whatsappApiVersion ?? current.whatsappApiVersion,
    whatsappProductPolicy:
      input.whatsappProductPolicy !== undefined
        ? input.whatsappProductPolicy
        : (current.whatsappProductPolicy as UpsertIntegrationInput['whatsappProductPolicy']),
    whatsappMessageActivitySharing:
      input.whatsappMessageActivitySharing !== undefined
        ? input.whatsappMessageActivitySharing
        : current.whatsappMessageActivitySharing,
    webhookVerifyToken: input.webhookVerifyToken ?? current.webhookVerifyToken,
    webhookPublicUrl:
      input.webhookPublicUrl !== undefined ? input.webhookPublicUrl : current.webhookPublicUrl,
    evolutionBaseUrl:
      input.evolutionBaseUrl !== undefined ? input.evolutionBaseUrl : current.evolutionBaseUrl,
    evolutionApiKey:
      input.evolutionApiKey !== undefined ? input.evolutionApiKey : current.evolutionApiKey,
    evolutionInstance:
      input.evolutionInstance !== undefined ? input.evolutionInstance : current.evolutionInstance,
    notes: input.notes !== undefined ? input.notes : current.notes,
  };

  const { rows } = await getPool().query<DbRow>(
    `UPDATE integration_configs SET
      name = $2, provider = $3,
      whatsapp_token = $4, whatsapp_phone_number_id = $5, whatsapp_api_version = $6,
      whatsapp_product_policy = $7, whatsapp_message_activity_sharing = $8,
      webhook_verify_token = $9, webhook_public_url = $10,
      evolution_base_url = $11, evolution_api_key = $12, evolution_instance = $13,
      notes = $14
    WHERE id = $1
    RETURNING ${SELECT_FIELDS}`,
    [
      id,
      merged.name,
      merged.provider,
      merged.whatsappToken ?? null,
      merged.whatsappPhoneNumberId ?? null,
      merged.whatsappApiVersion ?? 'v20.0',
      merged.whatsappProductPolicy ?? null,
      merged.whatsappMessageActivitySharing ?? null,
      merged.webhookVerifyToken ?? 'dev-verify-token',
      merged.webhookPublicUrl ?? null,
      merged.evolutionBaseUrl ?? null,
      merged.evolutionApiKey ?? null,
      merged.evolutionInstance ?? null,
      merged.notes ?? null,
    ],
  );
  return rows[0] ? (mapRow(rows[0]) as IntegrationConfigTiming) : null;
}

export async function activate(id: string): Promise<IntegrationConfigTiming | null> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE integration_configs SET is_active = FALSE WHERE is_active = TRUE');
    const { rows } = await client.query<DbRow>(
      `UPDATE integration_configs SET is_active = TRUE WHERE id = $1 RETURNING ${SELECT_FIELDS}`,
      [id],
    );
    await client.query('COMMIT');
    return rows[0] ? (mapRow(rows[0]) as IntegrationConfigTiming) : null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function remove(id: string): Promise<boolean> {
  const active = await findActive();
  if (active?.id === id) {
    throw new Error('No se puede eliminar la integración activa');
  }
  const { rowCount } = await getPool().query('DELETE FROM integration_configs WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

export async function count(): Promise<number> {
  if (!isPostgresConnected()) return 0;
  const { rows } = await getPool().query<{ c: string }>(
    'SELECT COUNT(*)::text AS c FROM integration_configs',
  );
  return Number(rows[0]?.c ?? 0);
}
