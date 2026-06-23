-- Estado de aprobacion para registro publico (pendiente -> admin aprueba)

ALTER TABLE users ADD COLUMN IF NOT EXISTS estado_aprobacion TEXT NOT NULL DEFAULT 'aprobado'
  CHECK (estado_aprobacion IN ('pendiente', 'aprobado', 'rechazado'));

UPDATE users SET estado_aprobacion = 'aprobado' WHERE estado_aprobacion IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_estado_aprobacion ON users (estado_aprobacion);
