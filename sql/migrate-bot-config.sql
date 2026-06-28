-- Configuración del bot (mensaje al finalizar conversación con agente)
CREATE TABLE IF NOT EXISTS bot_config (
  id                      TEXT PRIMARY KEY DEFAULT 'default',
  mensaje_cierre          TEXT NOT NULL DEFAULT 'Gracias por contactarnos. Esta conversación ha sido finalizada. Si necesitas algo más, escríbenos de nuevo.',
  enviar_mensaje_cierre   BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO bot_config (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_bot_config_updated ON bot_config;
CREATE TRIGGER trg_bot_config_updated
  BEFORE UPDATE ON bot_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
