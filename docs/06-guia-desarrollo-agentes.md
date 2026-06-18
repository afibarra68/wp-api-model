# 06 · Guía Paso a Paso para Agentes Desarrolladores

Esta guía es **accionable**: cada paso tiene una tarea concreta y un criterio de verificación.
Un agente debe completar y verificar un paso antes de avanzar al siguiente. No saltarse fases.

> **Convenciones:** TypeScript estricto, arquitectura por módulos
> (`controller` → `service` → `model`), validación con Zod, errores con un `AppError` central.
> Regla de oro durante todo el desarrollo: **`PROVIDER=simulation`** para no depender de WhatsApp.

---

## PASO 0 — Bootstrap del proyecto

1. Inicializar:
   - `npm init -y`, instalar dependencias (ver lista en `05-plan-de-trabajo.md`).
   - Configurar `tsconfig.json` (strict), ESLint + Prettier.
   - Scripts: `dev` (ts-node-dev), `build`, `start`, `seed`, `test`, `lint`.
2. Crear estructura de carpetas de `05-plan-de-trabajo.md`.
3. Crear `.env.example` con TODAS las variables (ver lista al final de este doc).
4. Crear `docker-compose.yml` con Mongo y Redis (ver `07-infraestructura-despliegue.md`).
5. Implementar `src/core/`: conexión Mongoose, cliente Redis (ioredis), logger Pino,
   `AppError` + error handler, app Express base.
6. Endpoint `GET /health` que comprueba Mongo y Redis.

**Verificar:** `docker-compose up -d mongodb redis` + `npm run dev` → `GET /health` = `{status:"ok"}`.

---

## PASO 1 — Auth, JWT y usuario base

1. Modelo `usuarios` (Mongoose) con `password_hash` (`select:false`).
2. Servicio de auth: `login` (bcrypt compare), emisión de access + refresh, `refresh`.
3. Middlewares: `authJwt` (inyecta `req.user`) y `requireRole(...roles)`.
4. Rutas `/auth/login`, `/auth/refresh`, `/auth/me`.
5. Script `src/seed/seedAdmin.ts`: si no hay usuarios, crea el usuario base desde
   `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Llamarlo en el arranque y en `npm run seed`.
6. CRUD `/users` protegido con `requireRole('admin')`.

**Verificar:**
- `npm run seed` crea el admin (idempotente: ejecutarlo 2 veces no duplica).
- `POST /auth/login` con credenciales del seed → devuelve JWT.
- `GET /auth/me` sin token → `401`; con token → datos del usuario.

---

## PASO 2 — Clientes y Plantillas

1. Modelos `clientes` y `plantillas` (ver `02-modelo-de-datos.md`) con índices.
2. CRUD `/clients` con paginación, filtros (`activo`, `etiqueta`, `search`).
3. `POST /clients/bulk` idempotente por `telefono` (upsert).
4. `POST /clients/:id/opt-out` → `activo:false` + `opt_out_fecha`.
5. CRUD `/templates` con validación de `variables`.
6. Seed de mockups (`src/seed/seedMockups.ts`): ~20 clientes (algunos inactivos), ~3 plantillas.

**Verificar:** crear/listar clientes y plantillas; `bulk` con teléfonos repetidos no duplica;
opt-out cambia `activo` a `false`.

---

## PASO 3 — Proveedor (simulación) + Cola + Campañas

1. **Providers:** definir `MessageProvider` (interfaz de `03-especificacion-api.md`).
   Implementar `SimulationProvider`:
   - `sendTemplate` / `sendText` → generan `wamid` falso, hacen `log` y `delay` opcional.
   - Selección por factory según `process.env.PROVIDER`.
2. **Messaging:** crear cola BullMQ `whatsapp-emision` (conexión Redis).
   - Worker con `limiter: { max, duration }` derivado de `SEND_RATE_PER_SECOND`.
   - Reintentos (`attempts`, backoff) y manejo de fallos.
3. **Campaigns:**
   - Modelo `campanas` + `logs_mensajes`.
   - `POST /campaigns` (borrador), `GET /campaigns/:id/preview` (cuenta clientes + render ejemplo).
   - `POST /campaigns/:id/launch`:
     a. seleccionar clientes (`activo && opt_in` + segmento),
     b. crear `logs_mensajes` en `encolado`,
     c. encolar un job por cliente con variables resueltas (`mapeo_variables`),
     d. campaña → `en_progreso`.
   - Worker: por cada job → `provider.sendTemplate` → guardar `whatsapp_message_id` + estado
     `enviado` → incrementar métricas.
   - `pause`/`resume`, `GET /campaigns/:id/logs`, `GET /campaigns/:id/report`.
   - Al vaciarse la cola de la campaña → `finalizada`.

**Verificar:** lanzar una campaña con 20 clientes encola 20 jobs; el worker los procesa a la tasa
configurada; todos los logs quedan `enviado`; el reporte muestra los conteos correctos.

---

## PASO 4 — Webhooks, ventana 24h y Bot

1. **Webhooks:**
   - `GET /webhooks/whatsapp` (verificación con `WEBHOOK_VERIFY_TOKEN`).
   - `POST /webhooks/whatsapp` → normaliza payload (real o simulado) → distingue estado vs entrante.
   - `POST /webhooks/simulate` (solo si `PROVIDER=simulation`) para pruebas.
   - Actualización de estado **idempotente** (no duplica historial, estado monotónico) + métricas.
   - `failed` → marca cliente `activo:false`.
2. **Conversaciones:** al recibir un entrante, abrir/renovar `ventana_abierta_hasta` (+24h).
3. **Bot:**
   - Modelo de reglas (`bot/rules`): palabras clave → respuesta.
   - Procesar entrante: `STOP`/`SALIR` → opt-out; match de regla → responder vía
     `provider.sendText` (dentro de ventana); `ASESOR`/sin match → `handoff` (modo `humano`).
   - `POST /conversations/:id/reply` para respuesta manual de un agente.

**Verificar:**
- `simulate` con `nuevo_estado:"entregado"` actualiza el log y la métrica.
- `simulate` con un texto entrante dispara la regla del bot (respuesta registrada).
- enviar `STOP` deja al cliente `activo:false`.

---

## PASO 5 — Proveedores reales (cuando exista SIM/cuenta)

1. `MetaCloudProvider`: POST a `https://graph.facebook.com/<API_VERSION>/<PHONE_NUMBER_ID>/messages`
   con `Authorization: Bearer <WHATSAPP_TOKEN>`; construir payload de plantilla.
2. Verificar firma real `X-Hub-Signature-256` en webhooks.
3. (Opcional) `EvolutionProvider` apuntando a la instancia de Evolution API.
4. Conmutar con `PROVIDER=meta-cloud` sin cambiar la lógica de negocio.

**Verificar:** envío real a un número de prueba llega; el webhook real actualiza estados.

---

## PASO 6 — Hardening, tests y despliegue

1. `helmet`, CORS por lista blanca, `express-rate-limit` (sobre todo en `/auth/login`).
2. Tests con Vitest/Jest + Supertest: auth, clients, campaign launch (simulación), webhook idempotente.
3. `Dockerfile` de la app + `docker-compose` completo con límites de RAM.
4. Seguir `07-infraestructura-despliegue.md` para el Droplet.

**Verificar:** tests en verde; `docker-compose up` levanta el stack completo; smoke test del flujo.

---

## Orden recomendado y paralelización

- **Secuencial obligatorio:** PASO 0 → 1 → (2 y 3 pueden solaparse parcialmente) → 4 → 6.
- PASO 5 es independiente y se hace cuando haya credenciales reales.
- Un solo agente puede ir fase por fase; varios agentes pueden dividirse M3/M4 (datos maestros) y
  luego converger en M7 (campañas).

## `.env.example` completo (referencia)

```env
# App
NODE_ENV=development
PORT=3000
CORS_ORIGINS=http://localhost:5173

# Mongo / Redis
MONGO_URI=mongodb://mongodb:27017/whatsapp_control
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_ROUNDS=10

# Usuario base
SEED_ADMIN_EMAIL=admin@local.test
SEED_ADMIN_PASSWORD=Cambiar.Esto.123

# Envío
PROVIDER=simulation            # simulation | meta-cloud | evolution
SEND_RATE_PER_SECOND=2

# Webhooks
WEBHOOK_VERIFY_TOKEN=

# Meta Cloud (solo si PROVIDER=meta-cloud)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_API_VERSION=v20.0

# Evolution (solo si PROVIDER=evolution)
EVOLUTION_BASE_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=
```
