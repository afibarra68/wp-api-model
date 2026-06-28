-- Encabezado tipo texto en plantillas (Meta: header TEXT)
ALTER TABLE templates ADD COLUMN IF NOT EXISTS header_text TEXT;

ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_header_tipo_check;
ALTER TABLE templates ADD CONSTRAINT templates_header_tipo_check
  CHECK (header_tipo IN ('none', 'text', 'image'));
