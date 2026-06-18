#!/usr/bin/env bash
# Sincroniza backend/ (monorepo) → https://github.com/afibarra68/wp-api-model
#
# Uso (desde backend/):
#   ./scripts/push-to-wp-api-model.sh
#   ./scripts/push-to-wp-api-model.sh "mensaje de commit"
#
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO="https://github.com/afibarra68/wp-api-model.git"
MSG="${1:-sync: backend desde proyecto-api-watsapp}"
WORK="$(mktemp -d)"

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

echo "==> Clonando wp-api-model..."
git clone --depth 1 "$REPO" "$WORK/repo"

echo "==> Copiando archivos..."
rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .env \
  --exclude .git \
  "$BACKEND_DIR/" "$WORK/repo/"

cd "$WORK/repo"
git add -A
if git diff --cached --quiet; then
  echo "Sin cambios que publicar."
  exit 0
fi

git commit -m "$MSG"
git push origin main

echo "Publicado en $REPO (main)"
