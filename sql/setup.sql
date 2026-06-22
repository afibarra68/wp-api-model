-- =============================================================================
-- WhatsApp Control API — PostgreSQL setup
-- Ejecutar: psql "$DATABASE_URL" -f sql/setup.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Configuración de integraciones (WhatsApp / Meta / Evolution)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integration_configs (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                            TEXT NOT NULL,
  provider                        TEXT NOT NULL DEFAULT 'simulation'
    CHECK (provider IN ('simulation', 'meta-cloud', 'evolution')),
  is_active                       BOOLEAN NOT NULL DEFAULT FALSE,

  whatsapp_token                  TEXT,
  whatsapp_phone_number_id        TEXT,
  whatsapp_api_version            TEXT NOT NULL DEFAULT 'v20.0',
  whatsapp_product_policy         TEXT CHECK (
    whatsapp_product_policy IS NULL
    OR whatsapp_product_policy IN ('CLOUD_API_FALLBACK', 'STRICT')
  ),
  whatsapp_message_activity_sharing BOOLEAN,

  webhook_verify_token            TEXT NOT NULL DEFAULT 'dev-verify-token',
  webhook_public_url              TEXT,

  evolution_base_url              TEXT,
  evolution_api_key               TEXT,
  evolution_instance              TEXT,

  notes                           TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_one_active
  ON integration_configs (is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_integration_provider ON integration_configs (provider);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_integration_configs_updated ON integration_configs;
CREATE TRIGGER trg_integration_configs_updated
  BEFORE UPDATE ON integration_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Tablas de negocio
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'agente'
    CHECK (rol IN ('admin', 'operador', 'agente')),
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_login  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT NOT NULL,
  telefono        TEXT NOT NULL UNIQUE,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  opt_in          BOOLEAN NOT NULL DEFAULT TRUE,
  opt_out_fecha   TIMESTAMPTZ,
  etiquetas       TEXT[] NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  fecha_registro  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_activo ON clients (activo);
CREATE INDEX IF NOT EXISTS idx_clients_opt_in ON clients (opt_in);
CREATE INDEX IF NOT EXISTS idx_clients_etiquetas ON clients USING GIN (etiquetas);

CREATE TABLE IF NOT EXISTS templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_meta  TEXT NOT NULL,
  idioma       TEXT NOT NULL DEFAULT 'es',
  categoria    TEXT NOT NULL DEFAULT 'utility'
    CHECK (categoria IN ('marketing', 'utility', 'authentication')),
  estado       TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'pendiente', 'aprobada', 'rechazada')),
  header_tipo  TEXT NOT NULL DEFAULT 'none' CHECK (header_tipo IN ('none', 'image', 'text')),
  header_url   TEXT,
  header_text  TEXT,
  footer       TEXT,
  botones      JSONB NOT NULL DEFAULT '[]',
  cuerpo       TEXT NOT NULL,
  variables    JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nombre_meta, idioma)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_campana      TEXT NOT NULL,
  plantilla_id        UUID NOT NULL REFERENCES templates (id),
  integration_id      UUID REFERENCES integration_configs (id),
  segmento            JSONB NOT NULL DEFAULT '{"solo_activos": true}',
  mapeo_variables     JSONB NOT NULL DEFAULT '[]',
  estado              TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'en_progreso', 'pausada', 'finalizada', 'error')),
  metricas            JSONB NOT NULL DEFAULT '{"total":0,"encolados":0,"enviados":0,"entregados":0,"leidos":0,"fallidos":0}',
  fecha_lanzamiento   TIMESTAMPTZ,
  fecha_finalizacion  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_estado ON campaigns (estado);

CREATE TABLE IF NOT EXISTS message_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id            UUID NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  cliente_id            UUID NOT NULL REFERENCES clients (id),
  telefono              TEXT NOT NULL,
  whatsapp_message_id   TEXT,
  meta_message_status   TEXT CHECK (
    meta_message_status IS NULL
    OR meta_message_status IN ('accepted', 'held_for_quality_assessment', 'paused')
  ),
  estado_actual         TEXT NOT NULL DEFAULT 'encolado'
    CHECK (estado_actual IN ('encolado', 'enviado', 'entregado', 'leido', 'fallido')),
  error                 TEXT,
  historial_estados     JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_logs_campana ON message_logs (campana_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_estado ON message_logs (estado_actual);
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_logs_wamid
  ON message_logs (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS conversations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id              UUID NOT NULL UNIQUE REFERENCES clients (id),
  telefono                TEXT NOT NULL,
  ventana_abierta_hasta   TIMESTAMPTZ,
  modo                    TEXT NOT NULL DEFAULT 'bot' CHECK (modo IN ('bot', 'humano')),
  ultimo_mensaje_entrante TEXT,
  ultima_actividad        TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_telefono ON conversations (telefono);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  direction            TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  origen               TEXT NOT NULL CHECK (origen IN ('cliente', 'bot', 'agente', 'sistema')),
  texto                TEXT NOT NULL,
  whatsapp_message_id  TEXT,
  estado               TEXT CHECK (estado IN ('enviado', 'entregado', 'leido', 'fallido')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conversation ON conversation_messages (conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_messages_wamid
  ON conversation_messages (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bot_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT NOT NULL,
  palabras_clave  TEXT[] NOT NULL DEFAULT '{}',
  respuesta_tipo  TEXT NOT NULL DEFAULT 'texto',
  respuesta       TEXT NOT NULL,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  prioridad       INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Triggers updated_at (todas las tablas de negocio)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_clients_updated ON clients;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_templates_updated ON templates;
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_campaigns_updated ON campaigns;
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_message_logs_updated ON message_logs;
CREATE TRIGGER trg_message_logs_updated BEFORE UPDATE ON message_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_conversations_updated ON conversations;
CREATE TRIGGER trg_conversations_updated BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_bot_rules_updated ON bot_rules;
CREATE TRIGGER trg_bot_rules_updated BEFORE UPDATE ON bot_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- Seed
-- -----------------------------------------------------------------------------
INSERT INTO integration_configs (name, provider, is_active, webhook_verify_token, notes)
SELECT
  'Simulación local',
  'simulation',
  TRUE,
  'dev-verify-token',
  'Configuración inicial. Editar vía API /integrations o SQL.'
WHERE NOT EXISTS (SELECT 1 FROM integration_configs WHERE is_active = TRUE);

CREATE OR REPLACE VIEW v_active_integration AS
SELECT
  id,
  name,
  provider,
  whatsapp_phone_number_id,
  whatsapp_api_version,
  webhook_public_url,
  CASE WHEN whatsapp_token IS NOT NULL THEN '***' || RIGHT(whatsapp_token, 4) ELSE NULL END AS token_hint,
  created_at,
  updated_at
FROM integration_configs
WHERE is_active = TRUE;

COMMENT ON TABLE integration_configs IS 'Credenciales WhatsApp/Meta/Evolution y webhooks. Una sola fila activa (is_active=true).';
