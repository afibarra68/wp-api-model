# WhatsApp Control — Backend API

API Express para envío masivo WhatsApp, webhooks Meta, bot y colas.

## Stack

- **PostgreSQL** — configuración de integraciones (`integration_configs`)
- **MongoDB** — clientes, campañas, logs, usuarios
- **Redis** — cola BullMQ
- **Docker Compose** — despliegue en Digital Ocean

## Desarrollo local

```bash
cd backend
cp .env.example .env
npm install
docker compose up -d postgres mongodb redis
npm run dev
```

Health: http://localhost:3000/health

## Despliegue Digital Ocean

1. Crear Droplet **Ubuntu 24.04** (mín. 2 GB RAM).
2. Abrir puertos **22, 80, 443** (y 3000 solo para pruebas).
3. Clonar el repo y entrar a `backend/`:

```bash
git clone <repo> && cd proyecto-api-watsapp/backend
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

4. Editar `.env` con `CORS_ORIGINS`, credenciales Meta, `POSTGRES_PASSWORD`.
5. Volver a ejecutar `./scripts/deploy.sh`.

### HTTPS con Caddy (recomendado)

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile <<'EOF'
api.tudominio.com {
  reverse_proxy localhost:3000
}
EOF
sudo systemctl reload caddy
```

Webhook Meta: `https://api.tudominio.com/api/v1/webhooks/whatsapp`

## Comandos útiles

| Comando | Descripción |
|---------|-------------|
| `npm run docker:up` | Levantar stack completo |
| `npm run docker:logs` | Logs de la API |
| `npm run db:setup` | Ejecutar `sql/setup.sql` manualmente |
| `npm run seed` | Usuario admin + mockups |
| `docker compose exec api npm run seed` | Seed dentro del contenedor |

## Estructura

```
backend/
├── src/           # Código fuente TypeScript
├── sql/setup.sql  # Schema PostgreSQL
├── docker-compose.yml
├── Dockerfile
└── scripts/deploy.sh
```
