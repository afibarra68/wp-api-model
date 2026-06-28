-- Migración idempotente: historial de mensajes en conversaciones.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'conversations'
  ) THEN
    RAISE NOTICE 'Tabla conversations no existe; omitiendo migración.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'conversation_messages'
  ) THEN
    CREATE TABLE conversation_messages (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id      UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
      direction            TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
      origen               TEXT NOT NULL CHECK (origen IN ('cliente', 'bot', 'agente', 'sistema')),
      texto                TEXT NOT NULL,
      whatsapp_message_id  TEXT,
      estado               TEXT CHECK (estado IN ('enviado', 'entregado', 'leido', 'fallido')),
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_conv_messages_conversation ON conversation_messages (conversation_id, created_at);
    CREATE UNIQUE INDEX idx_conv_messages_wamid
      ON conversation_messages (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
    RAISE NOTICE 'Tabla conversation_messages creada.';
  END IF;
END $$;
