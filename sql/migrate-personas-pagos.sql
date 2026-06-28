-- Personas, categorías, pagos y configuración del módulo
-- Idempotente: CREATE IF NOT EXISTS + INSERT categorías ON CONFLICT

CREATE TABLE IF NOT EXISTS persona_categorias (
  slug          TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  color         TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  orden         INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO persona_categorias (slug, nombre, descripcion, color, orden) VALUES
  ('amigos_guabinas',      'Amigos Guabinas',       'Contactos del listado Amigos Guabinas',           '#25d366', 1),
  ('contactos_celular',    'Contactos celular',     'Exportación Google Contacts / celular',         '#3b82f6', 2),
  ('nuevos',               'Nuevos',                'Personas nuevas registradas',                   '#d29922', 3),
  ('pendientes_por_pagar', 'Pendientes por pagar',  'Personas con pago pendiente',                   '#f85149', 4)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS personas_config (
  id                        TEXT PRIMARY KEY DEFAULT 'default',
  default_country_code      TEXT NOT NULL DEFAULT '57',
  auto_pago_pendiente       BOOLEAN NOT NULL DEFAULT FALSE,
  categoria_pendientes_slug TEXT NOT NULL DEFAULT 'pendientes_por_pagar',
  sync_to_clients           BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO personas_config (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS personas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT NOT NULL,
  telefono        TEXT NOT NULL UNIQUE,
  categoria_slug  TEXT NOT NULL REFERENCES persona_categorias (slug),
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  notas           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  origen          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personas_categoria ON personas (categoria_slug);
CREATE INDEX IF NOT EXISTS idx_personas_activo ON personas (activo);
CREATE INDEX IF NOT EXISTS idx_personas_nombre ON personas (nombre);

CREATE TABLE IF NOT EXISTS pagos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id          UUID NOT NULL REFERENCES personas (id) ON DELETE CASCADE,
  estado              TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'pagado', 'cancelado')),
  monto               NUMERIC(12, 2),
  moneda              TEXT NOT NULL DEFAULT 'COP',
  concepto            TEXT,
  fecha_vencimiento   DATE,
  fecha_pago          TIMESTAMPTZ,
  referencia          TEXT,
  notas               TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_persona ON pagos (persona_id);
CREATE INDEX IF NOT EXISTS idx_pagos_estado ON pagos (estado);

DROP TRIGGER IF EXISTS trg_persona_categorias_updated ON persona_categorias;
CREATE TRIGGER trg_persona_categorias_updated
  BEFORE UPDATE ON persona_categorias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_personas_updated ON personas;
CREATE TRIGGER trg_personas_updated
  BEFORE UPDATE ON personas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pagos_updated ON pagos;
CREATE TRIGGER trg_pagos_updated
  BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_personas_config_updated ON personas_config;
CREATE TRIGGER trg_personas_config_updated
  BEFORE UPDATE ON personas_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
