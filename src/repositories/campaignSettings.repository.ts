import { env } from '../config/env';
import { getPool } from '../core/postgres';
import type { CampaignSettings } from '../types/entities';

type Row = {
  send_rate_per_second: number;
  release_batch_size: number;
  product_policy: CampaignSettings['productPolicy'];
  message_activity_sharing: boolean | null;
  updated_at: Date;
};

function mapRow(r: Row): CampaignSettings {
  return {
    sendRatePerSecond: r.send_rate_per_second,
    releaseBatchSize: r.release_batch_size,
    productPolicy: r.product_policy,
    messageActivitySharing: r.message_activity_sharing,
    updatedAt: r.updated_at,
  };
}

const FIELDS = `send_rate_per_second, release_batch_size, product_policy, message_activity_sharing, updated_at`;

export async function getCampaignSettings(): Promise<CampaignSettings> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${FIELDS} FROM campaign_settings WHERE id = 1`,
  );
  if (rows[0]) return mapRow(rows[0]);
  return {
    sendRatePerSecond: env.sendRatePerSecond,
    releaseBatchSize: 20,
    productPolicy: env.whatsappProductPolicy || null,
    messageActivitySharing: env.whatsappMessageActivitySharing ?? null,
    updatedAt: new Date(),
  };
}

export async function updateCampaignSettings(patch: {
  send_rate_per_second?: number;
  release_batch_size?: number;
  product_policy?: CampaignSettings['productPolicy'];
  message_activity_sharing?: boolean | null;
}): Promise<CampaignSettings> {
  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [];
  let i = 1;

  if (patch.send_rate_per_second !== undefined) {
    sets.push(`send_rate_per_second = $${i++}`);
    vals.push(patch.send_rate_per_second);
  }
  if (patch.release_batch_size !== undefined) {
    sets.push(`release_batch_size = $${i++}`);
    vals.push(patch.release_batch_size);
  }
  if (patch.product_policy !== undefined) {
    sets.push(`product_policy = $${i++}`);
    vals.push(patch.product_policy);
  }
  if (patch.message_activity_sharing !== undefined) {
    sets.push(`message_activity_sharing = $${i++}`);
    vals.push(patch.message_activity_sharing);
  }

  await getPool().query(
    `INSERT INTO campaign_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  );

  const { rows } = await getPool().query<Row>(
    `UPDATE campaign_settings SET ${sets.join(', ')} WHERE id = 1 RETURNING ${FIELDS}`,
    vals,
  );
  return mapRow(rows[0]);
}
