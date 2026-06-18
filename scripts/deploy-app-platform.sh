#!/usr/bin/env bash
# Despliegue en DigitalOcean App Platform
#
# Prerrequisitos:
#   1. doctl auth init
#   2. Repo en GitHub: afibarra68/wp-api-model (branch main)
#   3. PostgreSQL + Redis gestionados en App Platform (DATABASE_URL, REDIS_URL)
#
# Uso:
#   ./scripts/deploy-app-platform.sh create   # primera vez
#   ./scripts/deploy-app-platform.sh update   # actualizar spec
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SPEC="$APP_DIR/.do/app.yaml"
APP_NAME="wp-api-model"

if ! command -v doctl >/dev/null 2>&1; then
  echo "Instala doctl: https://docs.digitalocean.com/reference/doctl/how-to/install/"
  echo "  brew install doctl"
  echo "  doctl auth init"
  exit 1
fi

ACTION="${1:-create}"

case "$ACTION" in
  create)
    echo "==> Creando app en App Platform..."
    doctl apps create --spec "$SPEC" --wait
    echo ""
    echo "IMPORTANTE — configura estos SECRETOS en el panel de DigitalOcean:"
    echo "  JWT_SECRET"
    echo "  JWT_REFRESH_SECRET"
    echo "  POSTGRES_CA_CERT       (opcional, CA de DigitalOcean)"
    echo "  SEED_ADMIN_PASSWORD"
    echo "  WHATSAPP_TOKEN"
    echo "  WHATSAPP_PHONE_NUMBER_ID"
    echo "  WEBHOOK_VERIFY_TOKEN"
    echo ""
    echo "Luego ejecuta sql/setup.sql si el auto-schema falla, y:"
    echo "  npm run test:do  (con API_URL de App Platform)"
    ;;
  update)
    APP_ID=$(doctl apps list --format ID,Spec.Name --no-header | awk -v n="$APP_NAME" '$2==n{print $1; exit}')
    if [ -z "$APP_ID" ]; then
      echo "App '$APP_NAME' no encontrada. Usa: $0 create"
      exit 1
    fi
    echo "==> Actualizando app $APP_ID..."
    doctl apps update "$APP_ID" --spec "$SPEC" --wait
    ;;
  logs)
    APP_ID=$(doctl apps list --format ID,Spec.Name --no-header | awk -v n="$APP_NAME" '$2==n{print $1; exit}')
    doctl apps logs "$APP_ID" --type run --follow
    ;;
  *)
    echo "Uso: $0 {create|update|logs}"
    exit 1
    ;;
esac
