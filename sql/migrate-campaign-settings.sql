-- Migración: configuración global de campañas
CREATE TABLE IF NOT EXISTS campaign_settings (
  id                              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  send_rate_per_second            INT NOT NULL DEFAULT 2 CHECK (send_rate_per_second BETWEEN 1 AND 50),
  release_batch_size              INT NOT NULL DEFAULT 20 CHECK (release_batch_size BETWEEN 1 AND 500),
  product_policy                  TEXT CHECK (
    product_policy IS NULL OR product_policy IN ('CLOUD_API_FALLBACK', 'STRICT')
  ),
  message_activity_sharing        BOOLEAN,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO campaign_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
