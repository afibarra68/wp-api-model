# 03 · Especificación de la API REST

- **Base URL:** `/api/v1`
- **Formato:** JSON (`Content-Type: application/json`).
- **Auth:** todos los endpoints requieren `Authorization: Bearer <token>` **excepto**
  `/auth/login`, `/health` y `/webhooks/*`.
- **Validación:** toda entrada se valida con Zod; si falla → `422`.
- **Errores:** formato uniforme.

```jsonc
// Respuesta de error estándar
{ "error": { "code": "VALIDATION_ERROR", "message": "telefono es requerido", "details": [] } }
```

| Código | Significado |
|--------|-------------|
| 200/201 | OK / Creado |
| 400 | Petición malformada |
| 401 | Sin token o token inválido |
| 403 | Sin permiso (rol insuficiente) |
| 404 | No encontrado |
| 409 | Conflicto (ej. email/telefono duplicado) |
| 422 | Validación fallida |
| 429 | Rate limit excedido |
| 500 | Error interno |

---

## Health

```
GET /health         → 200 { "status": "ok", "db": "up", "redis": "up" }
```

---

## Auth (`/auth`)

```
POST /auth/login
  body: { "email": "admin@local.test", "password": "..." }
  200:  { "token": "<jwt>", "refreshToken": "<jwt>", "user": { "id", "nombre", "email", "rol" } }

POST /auth/refresh
  body: { "refreshToken": "<jwt>" }
  200:  { "token": "<jwt>" }

GET  /auth/me                        (auth)
  200:  { "id", "nombre", "email", "rol" }
```

---

## Usuarios (`/users`) — rol `admin`

```
GET    /users                        lista usuarios
POST   /users                        crea usuario { nombre, email, password, rol }
GET    /users/:id
PATCH  /users/:id                    { nombre?, rol?, activo? }
PATCH  /users/:id/password           { password }
DELETE /users/:id
```

---

## Clientes (`/clients`) — `admin`, `operador`

```
GET    /clients?activo=&etiqueta=&page=&limit=&search=
POST   /clients                      { nombre, telefono, opt_in, etiquetas?, metadata? }
POST   /clients/bulk                 carga masiva [{ nombre, telefono, ... }]  (idempotente por telefono)
GET    /clients/:id
PATCH  /clients/:id                  { nombre?, etiquetas?, metadata?, activo? }
DELETE /clients/:id
POST   /clients/:id/opt-out          marca activo:false + opt_out_fecha
```

---

## Plantillas (`/templates`) — `admin`, `operador`

```
GET    /templates
POST   /templates                    { nombre_meta, idioma, categoria, cuerpo, variables[] }
GET    /templates/:id
PATCH  /templates/:id                { estado?, cuerpo?, variables? }
DELETE /templates/:id
```

> Nota: la aprobación real la otorga Meta. Aquí solo se registran metadatos. En `meta-cloud`
> opcionalmente se puede sincronizar el estado real.

---

## Campañas (`/campaigns`) — `admin`, `operador`

```
GET    /campaigns?estado=&page=&limit=
POST   /campaigns                    crea campaña en estado "borrador"
  body: {
    "nombre_campana": "Ofertas Junio",
    "plantilla_id": "<id>",
    "segmento": { "etiquetas": ["cali"], "solo_activos": true },
    "mapeo_variables": [
      { "indice": 1, "origen": "campo", "valor": "nombre" },
      { "indice": 2, "origen": "fijo",  "valor": "10254" }
    ]
  }
GET    /campaigns/:id                 incluye métricas
GET    /campaigns/:id/preview         muestra cuántos clientes y ejemplo de mensaje renderizado
POST   /campaigns/:id/launch          segmenta, crea logs, encola y pasa a "en_progreso"
POST   /campaigns/:id/pause           pausa el procesamiento de la cola
POST   /campaigns/:id/resume          reanuda
GET    /campaigns/:id/logs?estado=    logs de mensajes de la campaña (paginado)
GET    /campaigns/:id/report          { total, enviados, entregados, leidos, fallidos, porcentajes }
```

---

## Webhooks (`/webhooks`) — **sin JWT** (validados por firma/verify token)

```
GET  /webhooks/whatsapp               verificación de Meta (hub.challenge)
POST /webhooks/whatsapp               eventos de estado y mensajes entrantes
```

Payload entrante (real Meta o simulado). El handler debe:
1. Validar `verify token` / firma (`X-Hub-Signature-256` en meta-cloud).
2. Distinguir **status update** vs **mensaje entrante**.
3. Status → actualizar `logs_mensajes` (idempotente) + métricas de campaña.
4. Entrante → abrir/renovar ventana de 24 h + entregar al **Bot**.
5. Responder `200` siempre (los reintentos de Meta exigen 200 rápido).

```jsonc
// Endpoint de simulación para pruebas locales (solo si PROVIDER=simulation)
POST /webhooks/simulate
  body: { "whatsapp_message_id": "wamid...", "nuevo_estado": "entregado" }
  // o un mensaje entrante:
  body: { "telefono": "573001234567", "texto": "Me interesa" }
```

---

## Bot (`/bot`) — `admin`

Gestión del flujo del bot (reglas simples basadas en palabras clave para el MVP).

```
GET    /bot/rules
POST   /bot/rules        { palabras_clave: ["precio","tarifa"], respuesta_tipo:"texto", respuesta:"..." }
PATCH  /bot/rules/:id
DELETE /bot/rules/:id
GET    /conversations?modo=          lista conversaciones (bot/humano)
POST   /conversations/:id/handoff    fuerza paso a "humano"
POST   /conversations/:id/reply      { texto }  envía respuesta manual (dentro de ventana 24h)
```

---

## Interfaz interna del proveedor (no es HTTP, es contrato de código)

Todas las implementaciones (`simulation`, `meta-cloud`, `evolution`) cumplen:

```ts
interface MessageProvider {
  sendTemplate(input: {
    to: string;                 // E.164 sin "+"
    templateName: string;
    languageCode: string;
    variables: string[];        // ordenadas por índice
  }): Promise<{ messageId: string }>;

  sendText(input: {            // solo válido dentro de ventana 24h
    to: string;
    text: string;
  }): Promise<{ messageId: string }>;
}
```

> Esto permite construir y probar campañas, colas, webhooks y bot **sin tocar WhatsApp**:
> basta `PROVIDER=simulation`.
