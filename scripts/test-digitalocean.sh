#!/usr/bin/env bash
# =============================================================================
# Test spec Digital Ocean — ejecutar desde tu Mac contra el Droplet desplegado
#
# Uso:
#   export API_URL=http://DROPLET_IP:3000
#   export ADMIN_EMAIL=admin@local.test
#   export ADMIN_PASSWORD=Cambiar.Esto.123
#   export WEBHOOK_VERIFY_TOKEN=dev-verify-token
#   ./scripts/test-digitalocean.sh
#
# O en una línea:
#   API_URL=http://165.22.x.x:3000 ./scripts/test-digitalocean.sh
# =============================================================================
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@local.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Cambiar.Esto.123}"
WEBHOOK_VERIFY_TOKEN="${WEBHOOK_VERIFY_TOKEN:-dev-verify-token}"

PASS=0
FAIL=0
TOKEN=""

green() { printf '\033[32m✓\033[0m %s\n' "$1"; }
red()   { printf '\033[31m✗\033[0m %s\n' "$1"; }

assert_status() {
  local id="$1" name="$2" expected="$3" actual="$4"
  if [ "$actual" = "$expected" ]; then
    green "[$id] $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    red "[$id] $name — esperado HTTP $expected, recibido $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_field() {
  local id="$1" name="$2" key="$3" expected="$4" body="$5"
  local actual
  actual=$(echo "$body" | node -e "
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const v=process.argv[1].split('.').reduce((o,k)=>o?.[k], d);
    process.stdout.write(String(v ?? ''));
  " "$key" 2>/dev/null || echo "")
  if [ "$actual" = "$expected" ]; then
    green "[$id] $name ($key=$expected)"
    PASS=$((PASS + 1))
  else
    red "[$id] $name — $key esperado '$expected', recibido '$actual'"
    FAIL=$((FAIL + 1))
  fi
}

echo "=============================================="
echo " Digital Ocean — test spec"
echo " API_URL=$API_URL"
echo "=============================================="
echo ""

# T01 — Health
BODY=$(curl -sf "$API_URL/health" 2>/dev/null || echo '{}')
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/health" 2>/dev/null || echo "000")
assert_status "T01" "Health endpoint" "200" "$STATUS"
if [ "$STATUS" = "200" ]; then
  assert_json_field "T01a" "MongoDB up" "db" "up" "$BODY" || true
  assert_json_field "T01b" "Postgres up" "postgres" "up" "$BODY" || true
  assert_json_field "T01c" "Redis up" "redis" "up" "$BODY" || true
  echo "$BODY" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('    provider:', d.provider, '| integration:', d.integration);"
fi
echo ""

# T11 — Sin auth
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/api/v1/clients")
assert_status "T11" "JWT requerido (401 sin token)" "401" "$STATUS"
echo ""

# T10 — Login
LOGIN=$(curl -s -w '\n%{http_code}' -X POST "$API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
STATUS=$(echo "$LOGIN" | tail -1)
BODY=$(echo "$LOGIN" | sed '$d')
assert_status "T10" "Login admin" "200" "$STATUS"
if [ "$STATUS" = "200" ]; then
  TOKEN=$(echo "$BODY" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).token||'')")
  if [ -n "$TOKEN" ]; then
    green "[T10a] JWT recibido"
    PASS=$((PASS + 1))
  else
    red "[T10a] JWT no presente en respuesta"
    FAIL=$((FAIL + 1))
  fi
fi
echo ""

if [ -z "$TOKEN" ]; then
  red "Sin token — abortando pruebas autenticadas"
  echo ""
  echo "Resultado: $PASS ok, $FAIL fallos"
  exit 1
fi

# T20 — Integración activa
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/api/v1/integrations/active" \
  -H "Authorization: Bearer $TOKEN")
assert_status "T20" "Integración activa (Postgres)" "200" "$STATUS"
echo ""

# T40 — Clientes
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/api/v1/clients" \
  -H "Authorization: Bearer $TOKEN")
assert_status "T40" "Listar clientes" "200" "$STATUS"
echo ""

# T30 — Webhook verify
CHALLENGE="do-test-$(date +%s)"
RESP=$(curl -s -w '\n%{http_code}' \
  "$API_URL/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WEBHOOK_VERIFY_TOKEN&hub.challenge=$CHALLENGE")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
assert_status "T30" "Webhook Meta GET challenge" "200" "$STATUS"
if [ "$BODY" = "$CHALLENGE" ]; then
  green "[T30a] Challenge devuelto correctamente"
  PASS=$((PASS + 1))
else
  red "[T30a] Challenge incorrecto: '$BODY'"
  FAIL=$((FAIL + 1))
fi
echo ""

# T41 — Simulate inbound (opcional, requiere cliente seed)
SIM=$(curl -s -w '\n%{http_code}' -X POST "$API_URL/api/v1/webhooks/simulate" \
  -H "Content-Type: application/json" \
  -d '{"telefono":"5491100000001","texto":"test do"}')
STATUS=$(echo "$SIM" | tail -1)
if [ "$STATUS" = "200" ]; then
  green "[T41] Webhook simulate (200)"
  PASS=$((PASS + 1))
else
  red "[T41] Webhook simulate — HTTP $STATUS (¿corriste seed con mockups?)"
  FAIL=$((FAIL + 1))
fi
echo ""

echo "=============================================="
if [ "$FAIL" -eq 0 ]; then
  green "TODAS LAS PRUEBAS PASARON ($PASS/$((PASS+FAIL)))"
  echo "=============================================="
  exit 0
else
  red "FALLARON $FAIL prueba(s) ($PASS ok)"
  echo "=============================================="
  exit 1
fi
