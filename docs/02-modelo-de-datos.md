# 02 · Modelo de Datos (MongoDB)

Base de datos: `whatsapp_control`. ORM: **Mongoose**. Todos los documentos llevan
`createdAt`/`updatedAt` automáticos (`timestamps: true`).

## Diagrama de relaciones (lógico)

```
[usuarios]                         (autenticación / RBAC)

[clientes] ──(1:N)──► [logs_mensajes] ◄──(N:1)── [campanas] ──(N:1)──► [plantillas]
     │                                                  
     └──(1:1)──► [conversaciones]   (ventana 24h + estado del bot)
```

> En MongoDB las relaciones se modelan con referencias (`ObjectId`). Se desnormalizan algunos
> campos (ej. `telefono` en el log) para acelerar lecturas y webhooks.

---

## Colección: `usuarios`

Usuarios del panel/API. Incluye el **usuario base** sembrado al iniciar (ver
[`04-seguridad-jwt.md`](04-seguridad-jwt.md)).

```jsonc
{
  "_id": "ObjectId",
  "nombre": "Administrador",
  "email": "admin@local.test",          // único, en minúsculas
  "password_hash": "$2b$10$...",         // bcrypt, NUNCA texto plano
  "rol": "admin",                         // "admin" | "operador" | "agente"
  "activo": true,
  "ultimo_login": "2026-06-11T22:00:00Z",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Índices: `email` único.

---

## Colección: `clientes`

Clientes registrados que recibirán las campañas.

```jsonc
{
  "_id": "ObjectId",
  "nombre": "Carlos Mendoza",
  "telefono": "573001234567",            // E.164 sin "+", único
  "activo": true,                         // false si falló o pidió salir
  "opt_in": true,                         // consentimiento explícito de recibir
  "opt_out_fecha": null,                  // fecha si hizo opt-out
  "etiquetas": ["cali", "premium"],      // para segmentación
  "metadata": {                           // campos dinámicos libres
    "ciudad": "Cali",
    "segmento": "premium"
  },
  "fecha_registro": "2026-06-11T20:00:00Z",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Índices: `telefono` único; `activo`, `opt_in`, `etiquetas` para segmentación.

**Reglas de negocio:**
- Solo se encolan clientes con `activo:true` **y** `opt_in:true`.
- Un webhook `failed` o palabra clave `STOP` → `activo:false` (+ `opt_out_fecha`).

---

## Colección: `plantillas`

Metadatos locales de las plantillas aprobadas en Meta (la fuente de verdad de aprobación es Meta).

```jsonc
{
  "_id": "ObjectId",
  "nombre_meta": "notificacion_pedido",  // nombre exacto aprobado en Meta
  "idioma": "es",                         // code de idioma
  "categoria": "marketing",               // "marketing" | "utility" | "authentication"
  "estado": "aprobada",                   // "borrador" | "pendiente" | "aprobada" | "rechazada"
  "cuerpo": "Hola {{1}}, tu pedido {{2}} va en camino.",
  "variables": [                          // definición ordenada de las variables
    { "indice": 1, "nombre": "nombre",  "ejemplo": "Carlos" },
    { "indice": 2, "nombre": "pedido",  "ejemplo": "10254" }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

Índices: `nombre_meta` + `idioma` único compuesto.

---

## Colección: `campanas`

Cada lote de envío masivo.

```jsonc
{
  "_id": "ObjectId",
  "nombre_campana": "Lanzamiento Ofertas Junio",
  "plantilla_id": "ObjectId",            // ref a plantillas
  "segmento": {                           // criterio de selección de clientes
    "etiquetas": ["cali"],               // opcional
    "solo_activos": true                  // siempre true en envío real
  },
  "mapeo_variables": [                    // de dónde sale cada variable de la plantilla
    { "indice": 1, "origen": "campo", "valor": "nombre" },     // del cliente
    { "indice": 2, "origen": "fijo",  "valor": "10254" }       // valor constante
  ],
  "estado": "borrador",                   // "borrador"|"en_progreso"|"pausada"|"finalizada"|"error"
  "metricas": {                           // contadores desnormalizados (rápido para el panel)
    "total": 0, "encolados": 0, "enviados": 0,
    "entregados": 0, "leidos": 0, "fallidos": 0
  },
  "fecha_lanzamiento": null,
  "fecha_finalizacion": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

Índices: `estado`, `createdAt`.

---

## Colección: `logs_mensajes`

**La más importante para el control y la auditoría.** Un documento por mensaje individual.

```jsonc
{
  "_id": "ObjectId",
  "campana_id": "ObjectId",              // ref a campanas
  "cliente_id": "ObjectId",              // ref a clientes
  "telefono": "573001234567",            // desnormalizado
  "whatsapp_message_id": "wamid.HBgM...",// ID que devuelve el proveedor (indexado)
  "estado_actual": "entregado",          // "encolado"|"enviado"|"entregado"|"leido"|"fallido"
  "error": null,                          // detalle si fallido
  "historial_estados": [
    { "estado": "encolado",  "fecha": "..." },
    { "estado": "enviado",   "fecha": "..." },
    { "estado": "entregado", "fecha": "..." }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

Índices: `whatsapp_message_id` único (sparse), `campana_id`, `estado_actual`.

**Idempotencia:** al recibir un webhook de estado, solo se agrega al `historial_estados` si ese
estado no existe ya, y `estado_actual` solo avanza (no retrocede de `leido` a `enviado`).

---

## Colección: `conversaciones`

Estado de la conversación con cada cliente: controla la **ventana de 24 h** y el modo del bot.

```jsonc
{
  "_id": "ObjectId",
  "cliente_id": "ObjectId",              // único
  "telefono": "573001234567",
  "ventana_abierta_hasta": "2026-06-12T10:00:00Z", // null si cerrada
  "modo": "bot",                          // "bot" | "humano"
  "ultimo_mensaje_entrante": "Me interesa",
  "ultima_actividad": "2026-06-11T22:31:00Z",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Índices: `cliente_id` único, `telefono`.

---

## Datos simulados (seed/mockups)

Para desarrollo sin WhatsApp se debe incluir un script de seed que cree:

- 1 **usuario base** admin (credenciales desde `.env`).
- ~3 **plantillas** de ejemplo (marketing y utility).
- ~20 **clientes** con distintas etiquetas y un par con `activo:false`.
- 1–2 **campañas** en estado `borrador`.

Ver el paso correspondiente en [`06-guia-desarrollo-agentes.md`](06-guia-desarrollo-agentes.md).
