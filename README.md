# WhatsApp Control — Backend API

**Repositorio de despliegue:** https://github.com/afibarra68/wp-api-model  
App Platform y Docker despliegan desde ese repo (código en la raíz).

Para publicar cambios: `./scripts/push-to-wp-api-model.sh` desde esta carpeta.

API Express para envío masivo WhatsApp, webhooks Meta, bot y colas.

## Configuración

```bash
cp config.env.example config.env   # editar credenciales
./scripts/sync-env.sh              # genera .env (y frontend/.env)
```

## Stack

- **PostgreSQL** — única base de datos (usuarios, clientes, campañas, logs, integraciones)
- **Redis** — cola BullMQ (producción / Docker)
- **Docker Compose** — Droplet (VPS): Postgres + Redis + API
- **App Platform** — PaaS gestionado (Postgres + Redis incluidos)

## Desarrollo local

```bash
cp config.env.example config.env
./scripts/sync-env.sh
npm install
docker compose up -d postgres redis
npm run dev
```

Health: http://localhost:3000/health

## Variables clave

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL (obligatorio) |
| `POSTGRES_SSL` | `true` en DigitalOcean |
| `POSTGRES_CA_CERT` | CA opcional (PEM en una línea con `\n`) |
| `QUEUE_DRIVER` | `memory` (local) \| `bullmq` (Docker) \| `db` (Vercel cron) |
| `REDIS_URL` | Redis si `QUEUE_DRIVER=bullmq` |
| `PROVIDER` | `simulation` \| `meta-cloud` \| `evolution` |

Schema inicial: `npm run db:setup` (o automático al arrancar si falta).

## Despliegue — App Platform

Repo GitHub: **`afibarra68/wp-api-model`** · rama `main`

DigitalOcean gestiona Postgres, Redis, HTTPS y el contenedor.

### Secretos (panel DO → Settings → Environment Variables)

| Variable | Tipo |
|----------|------|
| `JWT_SECRET` | Secret |
| `JWT_REFRESH_SECRET` | Secret |
| `POSTGRES_CA_CERT` | Secret (opcional) |
| `SEED_ADMIN_PASSWORD` | Secret |
| `WHATSAPP_TOKEN` | Secret |
| `WHATSAPP_PHONE_NUMBER_ID` | Secret |
| `WEBHOOK_VERIFY_TOKEN` | Secret |
| `CORS_ORIGINS` | Plain |

`DATABASE_URL` y `REDIS_URL` se inyectan desde App Platform.

## Despliegue — Droplet (Docker Compose)

```bash
git clone https://github.com/afibarra68/wp-api-model.git
cd wp-api-model
cp .env.example .env   # editar secretos
./scripts/deploy.sh
```

Solo levanta **postgres**, **redis** y **api**.
