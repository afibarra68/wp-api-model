# 05 · Plan de Trabajo (Módulos, Fases y Milestones)

## Estructura de carpetas

```
proyecto-api-watsapp/
├── backend/                    # API Express + PostgreSQL
│   ├── docs/                   # documentación técnica
│   ├── src/
│   ├── sql/
│   └── scripts/
└── frontend/                   # Panel Vite/React
    └── src/
```

## Módulos y responsabilidades

| # | Módulo | Entregable | Depende de |
|---|--------|-----------|------------|
| M0 | **Core/Infra** | Express app, conexión Mongo/Redis, logger, manejo de errores, `/health` | — |
| M1 | **Auth** | Login, JWT, refresh, middleware, RBAC | M0 |
| M2 | **Users** | CRUD usuarios + usuario base (seed) | M1 |
| M3 | **Clients** | CRUD + carga masiva + opt-out + segmentación | M1 |
| M4 | **Templates** | CRUD plantillas + variables | M1 |
| M5 | **Providers** | Interfaz `MessageProvider` + `simulation` | M0 |
| M6 | **Messaging** | Cola BullMQ + worker con rate limiting | M0, M5 |
| M7 | **Campaigns** | Crear/lanzar/pausar/reportar + logs_mensajes | M3, M4, M6 |
| M8 | **Webhooks** | Estados + entrantes (idempotente) + endpoint simulate | M6, M7 |
| M9 | **Bot** | Reglas por palabra clave + conversaciones + handoff | M8 |
| M10 | **Reportes** | Métricas por campaña, agregaciones | M7, M8 |
| M11 | **Providers reales** | `meta-cloud` y `evolution` | M5, M8 |
| M12 | **Hardening/Deploy** | Tests, helmet, rate limit, docker-compose, deploy DO | todos |

## Fases (incrementales y demostrables)

### Fase 0 — Bootstrap (M0)
- Inicializar proyecto Node + TypeScript, ESLint/Prettier, scripts npm.
- `docker-compose` con Mongo + Redis (límites de RAM).
- App Express con `/health` que verifica DB y Redis.
- **Criterio de aceptación:** `docker-compose up` levanta todo y `GET /health` responde `ok`.

### Fase 1 — Seguridad y usuarios (M1, M2)
- Modelo `usuarios`, hash bcrypt, seed del usuario base.
- `/auth/login`, `/auth/refresh`, `/auth/me`, middleware JWT + RBAC.
- CRUD `/users` (solo admin).
- **Aceptación:** login con usuario base devuelve JWT; endpoint protegido rechaza sin token.

### Fase 2 — Datos maestros (M3, M4)
- CRUD `/clients` (incl. `bulk` y `opt-out`) y `/templates`.
- Seed de mockups (clientes + plantillas).
- **Aceptación:** se listan/crean clientes y plantillas; carga masiva idempotente por teléfono.

### Fase 3 — Motor de envío en simulación (M5, M6, M7)
- `MessageProvider` + proveedor `simulation`.
- Cola BullMQ + worker con rate limiting (`SEND_RATE_PER_SECOND`).
- Campañas: crear, `preview`, `launch`, `pause/resume`, logs y métricas.
- **Aceptación:** lanzar una campaña encola N jobs, el worker los procesa dosificados y
  `logs_mensajes` queda en `enviado`; las métricas de la campaña se actualizan.

### Fase 4 — Respuestas y bot (M8, M9, M10)
- Webhooks de estado (idempotente) + endpoint `/webhooks/simulate`.
- Ventana de 24 h en `conversaciones`.
- Bot por palabras clave + `STOP`/opt-out + handoff a humano.
- Reportes por campaña.
- **Aceptación:** simular un `delivered` actualiza el log; simular un entrante dispara la regla
  del bot; `STOP` marca al cliente inactivo.

### Fase 5 — Proveedores reales (M11)  *(opcional / cuando haya SIM)*
- Implementar `meta-cloud` (Graph API) y/o `evolution`.
- Verificación de firma de webhook real.
- **Aceptación:** con `PROVIDER=meta-cloud` un envío real llega a un número de prueba.

### Fase 6 — Hardening y despliegue (M12)
- Tests (unit + integración), helmet, rate limit, CORS.
- `Dockerfile` de la app, `docker-compose` completo, guía de despliegue en DigitalOcean.
- **Aceptación:** suite de tests en verde; despliegue reproducible en un Droplet.

## Dependencias npm previstas

```
express, mongoose, ioredis, bullmq, jsonwebtoken, bcrypt, zod,
helmet, cors, express-rate-limit, pino, pino-http, dotenv, axios
dev: typescript, ts-node-dev, @types/*, eslint, prettier, vitest|jest, supertest
```

## Definición de "Hecho" (Definition of Done) por módulo

- Validación Zod en todas las entradas.
- Manejo de errores consistente (formato estándar).
- Sin secretos hardcodeados.
- Al menos un test del happy path + un caso de error.
- Documentado en el README del módulo o en estos docs si cambia el contrato.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Rate limiting / bloqueo de Meta | Dosificación con BullMQ + delays configurables. |
| Consumo de RAM > 3 GB | Límites por contenedor (Mongo 1 GB, Redis 256 MB). |
| Webhooks duplicados | Idempotencia por `whatsapp_message_id` + estado monotónico. |
| Envío a clientes sin consentimiento | Filtro `activo && opt_in` obligatorio en `launch`. |
| Acoplamiento al proveedor | Interfaz `MessageProvider` + modo simulación. |
