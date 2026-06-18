#!/usr/bin/env bash
# Despliegue del backend en Digital Ocean (Droplet Ubuntu + Docker Compose).
#
# Uso en el Droplet:
#   git clone <repo-url> && cd proyecto-api-watsapp/backend
#   cp .env.example .env && nano .env
#   ./scripts/deploy.sh
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> WhatsApp Control API — deploy Digital Ocean"
echo "    Directorio: $APP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
  echo "Cierra sesión y vuelve a entrar para usar docker sin sudo, o usa sudo docker compose."
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Error: docker compose plugin no encontrado."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  JWT_SECRET=$(openssl rand -hex 32)
  JWT_REFRESH_SECRET=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' \
      -e "s/^NODE_ENV=.*/NODE_ENV=production/" \
      -e "s/^QUEUE_DRIVER=.*/QUEUE_DRIVER=bullmq/" \
      -e "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" \
      -e "s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" \
      -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" \
      -e "s/^SEED_MOCKUPS=.*/SEED_MOCKUPS=false/" \
      .env
  else
    sed -i \
      -e "s/^NODE_ENV=.*/NODE_ENV=production/" \
      -e "s/^QUEUE_DRIVER=.*/QUEUE_DRIVER=bullmq/" \
      -e "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" \
      -e "s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" \
      -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" \
      -e "s/^SEED_MOCKUPS=.*/SEED_MOCKUPS=false/" \
      .env
  fi
  echo ""
  echo "Creado .env con secretos generados."
  echo "Edita $APP_DIR/.env (CORS_ORIGINS, PROVIDER, WHATSAPP_*, POSTGRES_PASSWORD)."
  echo "Luego ejecuta de nuevo: ./scripts/deploy.sh"
  exit 0
fi

# Cargar POSTGRES_PASSWORD para docker-compose
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "==> Construyendo y levantando contenedores..."
docker compose up -d --build

echo "==> Esperando healthcheck de la API..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:${API_PORT:-3000}/health >/dev/null 2>&1; then
    echo "API healthy."
    break
  fi
  sleep 2
done

echo "==> Seed (admin + integración)..."
docker compose exec -T api npm run seed || true

PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "TU_IP")
echo ""
echo "=========================================="
echo " Backend desplegado"
echo " Health:  http://${PUBLIC_IP}:${API_PORT:-3000}/health"
echo " API:     http://${PUBLIC_IP}:${API_PORT:-3000}/api/v1"
echo " Webhook: https://TU_DOMINIO/api/v1/webhooks/whatsapp"
echo ""
echo " Siguiente paso: Nginx/Caddy con HTTPS en puerto 443"
echo "   proxy_pass -> localhost:${API_PORT:-3000}"
echo "=========================================="
