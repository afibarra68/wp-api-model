-- Configuración de dosificación diaria para campañas y estado pendiente en logs.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS config_envio JSONB NOT NULL DEFAULT '{}';

ALTER TABLE message_logs DROP CONSTRAINT IF EXISTS message_logs_estado_actual_check;
ALTER TABLE message_logs ADD CONSTRAINT message_logs_estado_actual_check
  CHECK (estado_actual IN ('pendiente', 'encolado', 'enviado', 'entregado', 'leido', 'fallido'));
