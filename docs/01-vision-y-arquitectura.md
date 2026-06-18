# 01 · Visión y Arquitectura

## 1. Objetivo del sistema

Construir una **API de control** que actúe como el "cerebro" del envío masivo de WhatsApp:

- Emite mensajes salientes masivos (business-initiated) usando **plantillas aprobadas**.
- Dosifica el envío para respetar los límites de la API y evitar bloqueos.
- Recibe en tiempo real el estado de cada mensaje y las respuestas de los clientes.
- Automatiza respuestas con un bot y permite el traspaso a agentes humanos.
- Expone todo a través de una **API REST segura con JWT**.

El sistema está **desacoplado del proveedor de WhatsApp**: se puede desarrollar y probar al 100%
en modo **simulación** (sin SIM, sin costo, sin riesgo) y luego conmutar al proveedor real
cambiando una variable de entorno.

## 2. Conceptos clave de la API de WhatsApp (contexto de negocio)

- **Mensaje iniciado por el negocio (business-initiated):** primer contacto proactivo. **Obliga**
  a usar una **plantilla preaprobada** por Meta. Tiene costo por mensaje.
- **Ventana de servicio de 24 h:** cuando el cliente responde, se abre una ventana de 24 h durante
  la cual se pueden enviar mensajes de **texto libre** (gratis).
- **Estados de mensaje:** `sent` → `delivered` → `read`, o `failed`.
- **Plantillas (templates):** texto con variables `{{1}}`, `{{2}}`, etc., aprobadas en Meta
  Business Suite.

> En modo simulación, el sistema **emula** estos estados y la ventana de 24 h para poder probar
> toda la lógica sin Meta.

## 3. Componentes (vista de alto nivel)

```
                 ┌──────────────────────────────────────────────────────────┐
                 │                  WhatsApp Control API                      │
                 │                  (Node.js + TypeScript)                    │
                 │                                                            │
  Cliente API    │   ┌──────────┐   ┌──────────┐   ┌────────────────────┐    │
 (panel / curl) ─┼──▶│  HTTP /  │──▶│  Módulos │──▶│   Proveedor (abst.)│────┼──▶ WhatsApp
                 │   │  Auth JWT│   │ negocio  │   │ sim│meta-cloud│evo  │    │   (Meta / Evolution)
                 │   └──────────┘   └────┬─────┘   └────────────────────┘    │
                 │                       │                                    │
                 │                       ▼                                    │
                 │                 ┌──────────┐      ┌──────────┐            │
                 │                 │  BullMQ  │◀────▶│  Redis   │            │
                 │                 │ (colas)  │      └──────────┘            │
                 │                 └────┬─────┘                              │
                 │                      │                                    │
                 │                      ▼                                    │
                 │                 ┌──────────┐                              │
                 │                 │ MongoDB  │  clientes / campañas /       │
                 │                 │          │  logs / usuarios / plantillas│
                 │                 └──────────┘                              │
                 │                                                            │
  WhatsApp ──────┼──▶ ┌──────────────┐ ──▶ Webhooks (estados + entrantes) ──▶ Bot │
 (webhook)       │    │ /webhooks/*  │                                        │
                 └──────────────────────────────────────────────────────────┘
```

### Componentes lógicos

| Componente | Responsabilidad |
|------------|-----------------|
| **HTTP/API** | Exponer endpoints REST, validar entrada (Zod), aplicar auth JWT. |
| **Auth** | Login, emisión/validación de JWT, gestión de usuarios y roles. |
| **Clientes** | Administrar la base de clientes registrados y su consentimiento. |
| **Plantillas** | Registrar metadatos de plantillas aprobadas y sus variables. |
| **Campañas** | Orquestar el envío masivo: segmentar, crear logs, encolar. |
| **Dispatcher (BullMQ)** | Consumir la cola y despachar al proveedor con rate limiting. |
| **Proveedor** | Abstracción del envío real (simulation / meta-cloud / evolution). |
| **Webhooks** | Recibir estados de entrega y mensajes entrantes de WhatsApp. |
| **Bot** | Procesar entrantes según un flujo y responder o derivar a humano. |
| **Reportes** | Agregar métricas por campaña (entregados, leídos, fallidos). |

## 4. Flujo principal: envío masivo (Batch)

```
1. POST /campaigns                → se crea la campaña (estado: borrador)
2. POST /campaigns/:id/launch     → el sistema:
     a. SELECT clientes activos (activo:true, opt_in:true) según segmento
     b. crea un log_mensaje "encolado" por cada cliente
     c. encola N jobs en BullMQ con {campañaId, clienteId, variables}
     d. marca la campaña como "en_progreso"
3. Worker (Dispatcher)            → procesa la cola con rate limiting (ej. 2 msg/s):
     a. toma un job
     b. construye el payload de plantilla
     c. llama al Proveedor.enviar()
     d. guarda whatsapp_message_id y estado "enviado" en el log
4. Cuando se vacía la cola        → campaña pasa a "finalizada"
```

> El **rate limiting** se configura en el worker de BullMQ (`limiter: { max, duration }`) y/o por
> variable de entorno (`SEND_RATE_PER_SECOND`).

## 5. Flujo secundario: respuestas y bot (Tiempo real / Eventos)

```
1. Cliente recibe el WhatsApp y responde / cambia estado
2. WhatsApp/Meta → POST /webhooks/whatsapp (al Droplet)
3. El módulo Webhooks distingue:
   - Actualización de estado (delivered/read/failed):
        → busca log por whatsapp_message_id → actualiza estado_actual + historial
        → si "failed": marca cliente activo:false (limpieza de base)
   - Mensaje entrante (el cliente escribió):
        → abre/renueva ventana de 24h en la conversación
        → entrega el texto al Bot
4. Bot evalúa el flujo:
   - palabra clave "STOP"/"SALIR" → opt_out (activo:false), responde confirmación
   - coincide con una regla     → responde (texto/plantilla/archivo)
   - "ASESOR" o sin match        → handoff: marca conversación para atención humana
```

## 6. Modos de proveedor (`PROVIDER`)

| Valor | Uso | Comportamiento |
|-------|-----|----------------|
| `simulation` | **Por defecto en desarrollo** | No llama a Meta. Genera `wamid` falso, registra "enviado" y puede emular webhooks de estado. |
| `meta-cloud` | Producción oficial | Llama a `graph.facebook.com` con token y `PHONE_NUMBER_ID`. |
| `evolution` | Gateway autoalojado | Llama a una instancia de Evolution API. |

Todos implementan la **misma interfaz** `MessageProvider` (ver
[`03-especificacion-api.md`](03-especificacion-api.md) y
[`06-guia-desarrollo-agentes.md`](06-guia-desarrollo-agentes.md)).

## 7. Principios de diseño

- **Desacoplamiento:** la lógica de negocio no conoce el proveedor concreto.
- **Idempotencia en webhooks:** un mismo evento de estado no debe corromper el historial.
- **Bajo consumo de RAM:** límites estrictos de memoria por contenedor (≤ 3 GB total).
- **Observabilidad:** logs estructurados y métricas por campaña.
- **Seguridad por defecto:** todos los endpoints de negocio requieren JWT; secretos en `.env`.
- **Consentimiento:** nunca enviar a clientes con `opt_in:false` u `opt_out`.
