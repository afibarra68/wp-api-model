-- Migración idempotente: título (header texto), footer y botones en plantillas.
-- Seguro ejecutar varias veces — solo agrega lo que falta.
-- Manual: psql "$DATABASE_URL" -f sql/migrate-templates-components.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'templates'
  ) THEN
    RAISE NOTICE 'Tabla templates no existe; omitiendo migración.';
    RETURN;
  END IF;

  -- Columnas nuevas (IF NOT EXISTS)
  ALTER TABLE templates ADD COLUMN IF NOT EXISTS header_text TEXT;
  ALTER TABLE templates ADD COLUMN IF NOT EXISTS footer TEXT;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'botones'
  ) THEN
    ALTER TABLE templates ADD COLUMN botones JSONB NOT NULL DEFAULT '[]';
    RAISE NOTICE 'Columna botones agregada.';
  END IF;

  -- CHECK header_tipo: ampliar a ''text'' solo si aún no lo incluye
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'templates'
      AND c.conname = 'templates_header_tipo_check'
      AND pg_get_constraintdef(c.oid) LIKE '%''text''%'
  ) THEN
    ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_header_tipo_check;
    ALTER TABLE templates ADD CONSTRAINT templates_header_tipo_check
      CHECK (header_tipo IN ('none', 'image', 'text'));
    RAISE NOTICE 'Constraint templates_header_tipo_check actualizado.';
  END IF;

  RAISE NOTICE 'Migración templates-components: OK (sin cambios o ya aplicada).';
END $$;
