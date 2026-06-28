-- Autenticación de dos factores (TOTP) para administradores
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;

COMMENT ON COLUMN users.mfa_enabled IS '2FA TOTP activo (solo rol admin)';
COMMENT ON COLUMN users.totp_secret IS 'Secreto base32 para TOTP; NULL si 2FA desactivado';
