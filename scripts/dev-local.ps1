# Levanta PostgreSQL + schema + seed + API + frontend en local (modo simulacion)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Api = Join-Path $Root "wp-api-model"
$Fe = Join-Path $Root "whatsapp-gesture-frontend-app"

Write-Host "==> WhatsApp Control · desarrollo local (sin API Meta)" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Instala Node.js 20+ desde https://nodejs.org" -ForegroundColor Red
  exit 1
}

Push-Location $Api
if (-not (Test-Path .env)) {
  Copy-Item env.local.example .env
  Write-Host "Creado wp-api-model/.env desde env.local.example"
}
Pop-Location

$useDockerDb = $true
if (Test-Path (Join-Path $Api ".env")) {
  $flag = Select-String -Path (Join-Path $Api ".env") -Pattern '^USE_DOCKER_POSTGRES=(.+)$' | Select-Object -First 1
  if ($flag -and $flag.Matches.Groups[1].Value.Trim().ToLower() -eq 'false') {
    $useDockerDb = $false
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker no encontrado — usando PostgreSQL del host (ver DATABASE_URL en .env)." -ForegroundColor Yellow
} elseif ($useDockerDb) {
  Write-Host "==> PostgreSQL + Redis (Docker, datos en volumen wc-whatsapp-postgres-data)..."
  Push-Location $Api
  docker compose up -d postgres redis
  Pop-Location
  Start-Sleep -Seconds 4
}

Push-Location $Api
if (-not (Test-Path node_modules)) {
  Write-Host "==> npm install (API)..."
  npm install
}

Write-Host "==> Base de datos whatsapp_control (setup + migraciones)..." -ForegroundColor Cyan
npm run db:setup-local
if ($LASTEXITCODE -ne 0) {
  Write-Host "Error en db:setup-local. Revisa PostgreSQL y DATABASE_URL en .env." -ForegroundColor Red
  Pop-Location
  exit 1
}

Write-Host "==> Seed (usuario admin)..." -ForegroundColor Cyan
npm run seed
if ($LASTEXITCODE -ne 0) {
  Write-Host "Error en seed." -ForegroundColor Red
  Pop-Location
  exit 1
}

$port = 3001
if (Test-Path .env) {
  $match = Select-String -Path .env -Pattern '^PORT=(\d+)' | Select-Object -First 1
  if ($match -and $match.Matches.Groups[1].Value) {
    $port = $match.Matches.Groups[1].Value
  }
}

Write-Host "==> API en http://localhost:$port (PROVIDER=simulation)"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Api'; npm run dev"
Pop-Location

Push-Location $Fe
if (-not (Test-Path node_modules)) {
  Write-Host "==> npm install (frontend)..."
  npm install
}
Write-Host "==> Frontend en http://localhost:5173"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Fe'; npm run dev"
Pop-Location

Write-Host ""
Write-Host "Listo. Login: admin@local.test / (SEED_ADMIN_PASSWORD en .env)" -ForegroundColor Green
