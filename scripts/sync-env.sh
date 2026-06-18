#!/usr/bin/env bash
# Sincroniza backend/config.env → backend/.env (+ frontend/.env para VITE_*)
#
# Uso:
#   cp config.env.example config.env
#   nano config.env
#   ./scripts/sync-env.sh
#
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
CONFIG="${BACKEND_DIR}/config.env"
BACKEND_ENV="${BACKEND_DIR}/.env"
FRONTEND_ENV="${ROOT}/frontend/.env"

if [ ! -f "$CONFIG" ]; then
  if [ -f "${BACKEND_DIR}/config.env.example" ]; then
    cp "${BACKEND_DIR}/config.env.example" "$CONFIG"
    echo "Creado config.env desde config.env.example"
    echo "Edita ${CONFIG} y vuelve a ejecutar: ./scripts/sync-env.sh"
    exit 0
  fi
  echo "Error: no existe config.env ni config.env.example en ${BACKEND_DIR}"
  exit 1
fi

HEADER="# Generado desde config.env — edita config.env y ejecuta: ./scripts/sync-env.sh"

{
  echo "$HEADER"
  awk '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    /^VITE_/ { next }
    /^[A-Za-z_][A-Za-z0-9_]*=/ { print }
  ' "$CONFIG"
} > "$BACKEND_ENV"

{
  echo "$HEADER"
  awk '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    /^VITE_/ { print }
  ' "$CONFIG"
} > "$FRONTEND_ENV"

echo "Sincronizado:"
echo "  ${CONFIG}"
echo "    → ${BACKEND_ENV}"
echo "    → ${FRONTEND_ENV}"
