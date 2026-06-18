# 08 · Guía de Uso (Manual de Operación)

Material de lectura para **operar la aplicación** desde el panel web. No requiere saber programar.
Si es tu primera vez, lee primero el **Glosario** y luego el **Flujo de trabajo paso a paso**.

---

## 1. ¿Qué hace esta aplicación?

Permite **enviar mensajes de WhatsApp de forma masiva** a tus clientes registrados, controlar el
estado de cada mensaje y **responder automáticamente** con un bot. Todo desde un panel web.

Hoy funciona en **modo simulación** (`PROVIDER=simulation`): hace todo el proceso real (campañas,
colas, estados, bot) pero **sin enviar a WhatsApp de verdad** ni cobrar. Cuando conectes la cuenta
oficial de Meta, el mismo panel enviará mensajes reales sin cambiar nada de tu forma de trabajar.

---

## 2. Cómo entrar

1. Abre el panel: en local es `http://localhost:5173`.
2. Inicia sesión con el usuario base:
   - Correo: `admin@local.test`
   - Contraseña: `Cambiar.Esto.123`
   (estos valores se configuran en el archivo `.env` del backend).

> En producción, cambia esa contraseña tras el primer ingreso.

---

## 3. Glosario (conceptos clave)

| Término | Qué significa |
|---------|---------------|
| **Cliente** | Una persona en tu base, con nombre y teléfono. Solo se le envía si está **activo** y con **opt-in**. |
| **Opt-in** | El cliente dio consentimiento para recibir mensajes. Sin opt-in, **no** se le envía. |
| **Opt-out** | El cliente pidió no recibir más (o escribió "STOP"). Queda inactivo automáticamente. |
| **Etiquetas** | Marcas para agrupar clientes (ej. `cali`, `premium`) y poder segmentar campañas. |
| **Plantilla** | El texto del mensaje con huecos llamados variables: `{{1}}`, `{{2}}`… |
| **Variable** | Un dato que rellena un hueco de la plantilla (ej. el nombre del cliente en `{{1}}`). |
| **Mapeo de variables** | Le dices al sistema de dónde sacar cada variable: del campo del cliente, de su metadata, o un valor fijo. |
| **Campaña** | Un envío masivo: una plantilla + un segmento de clientes + el mapeo de variables. |
| **wamid** | El identificador único de un mensaje **ya enviado** (ej. `wamid.SIM.573001000001.A1B2…`). |
| **Estados del mensaje** | El ciclo: `encolado` → `enviado` → `entregado` → `leido` (o `fallido`). |
| **Ventana de 24h** | Cuando un cliente te responde, se abre 24h para chatear con texto libre (sin plantilla). |
| **Bot** | Responde automáticamente según palabras clave. Puede pasar el chat a un humano (handoff). |

---

## 4. Flujo de trabajo paso a paso

### Paso 1 · Tener clientes
Ve a **Clientes**. Puedes:
- Crear uno con **+ Nuevo cliente** (nombre, teléfono en formato `573001234567`, etiquetas, opt-in).
- En modo de prueba ya vienen ~20 clientes sembrados (teléfonos `5730010000XX`).

> El teléfono va **sin "+"**, solo dígitos, con código de país. Ej.: `57` (Colombia) + número.

### Paso 2 · Tener una plantilla
Ve a **Plantillas → + Nueva plantilla**:
- Escribe el cuerpo usando variables: `Hola {{1}}, tu pedido {{2}} va en camino.`
- El sistema detecta solo cuántas variables tiene.

> En producción, el nombre de la plantilla debe ser **idéntico** al aprobado por Meta.

### Paso 3 · Crear la campaña
Ve a **Campañas → + Nueva campaña**:
1. Ponle un nombre.
2. Elige la **plantilla**.
3. (Opcional) Filtra por **etiquetas** para enviar solo a un grupo.
4. **Mapea las variables**: para cada `{{n}}` indica de dónde sale el dato:
   - **Campo cliente** → un campo del cliente (ej. `nombre`, `telefono`).
   - **Metadata** → un dato dentro de la metadata del cliente (ej. `ciudad`).
   - **Valor fijo** → el mismo texto para todos (ej. un código de campaña).

### Paso 4 · Revisar antes de enviar (Preview)
Entra al detalle de la campaña (estado **borrador**). Verás:
- Cuántos **destinatarios** coinciden con el segmento.
- Un **ejemplo** del mensaje ya armado con datos reales.

### Paso 5 · Lanzar
Pulsa **➤ Lanzar campaña**. El sistema:
- Crea un registro por cada cliente (estado `encolado`).
- Va enviando **dosificado** (controlado para no saturar; por defecto ~2 por segundo).
- El detalle se **auto-actualiza** y verás subir Enviados / Entregados / etc.
- Puedes **Pausar** y **Reanudar** en cualquier momento.

### Paso 6 · Monitorear
En el detalle de la campaña tienes:
- **Tarjetas con métricas** (total, enviados, entregados, leídos, fallidos) con barras de progreso.
- **Registro de mensajes**: cada teléfono, su estado y su **Message ID (wamid)**.

---

## 5. El Simulador (probar sin WhatsApp real)

La sección **Simulador** tiene **dos cajas distintas**. No las confundas:

### Caja A · "Simular estado de entrega"
Sirve para marcar un mensaje que **tú enviaste** como entregado/leído/fallido.
- **Campo wamid:** NO es un teléfono. Es el Message ID que aparece en el **Registro de mensajes**
  del detalle de una campaña (cópialo de ahí). Ej.: `wamid.SIM.573001000001.A1B2C3`.
- **Nuevo estado:** elige `entregado` (lo normal), `leido` o `fallido`.
- Solo existe **después de lanzar una campaña**.

> El estado solo avanza, nunca retrocede (es idempotente). De `enviado` puedes pasar a
> `entregado`/`leido`, pero no al revés.

### Caja B · "Simular mensaje entrante (bot)"
Sirve para simular que un **cliente te escribe**.
- **Teléfono:** el de un cliente que **exista** en tu base (ej. `573001000001`).
- **Mensaje:** el texto del cliente. Prueba con:
  - `precio` → el bot responde con la regla de precios.
  - `asesor` → pasa el chat a un humano (handoff).
  - `STOP` → da de baja al cliente (opt-out).

---

## 6. Acciones del bot (qué responde y por qué)

| Resultado | Significado |
|-----------|-------------|
| `regla:<nombre>` | Coincidió una palabra clave y el bot respondió esa regla. |
| `opt_out` | El cliente escribió STOP/SALIR → se le da de baja. |
| `handoff` | Escribió ASESOR/HUMANO → la conversación pasa a un agente humano. |
| `modo_humano_sin_respuesta` | La conversación ya está con un humano → el bot no interviene. |
| `sin_coincidencia` | No coincidió ninguna regla → el bot no responde. |
| `ignorado_no_registrado` | El teléfono **no está** en la base de clientes → se ignora a propósito. |

> Para que el bot responda, el teléfono **debe** existir como cliente.

---

## 7. Conversaciones

En **Conversaciones** ves los clientes que han interactuado:
- **Modo bot / humano**, y si la **ventana de 24h** está abierta.
- **A humano**: fuerza el handoff (que lo atienda una persona).
- **Responder**: envía un mensaje manual (solo si la ventana de 24h está abierta).

---

## 8. Preguntas frecuentes

**¿Por qué no se envió a todos mis clientes?**
Solo se envía a clientes **activos** y con **opt-in**. Los inactivos o sin consentimiento se omiten.

**¿Por qué el simulador de estado dice "sin cambios"?**
Porque ese estado ya estaba aplicado o sería un retroceso. Es normal (idempotencia).

**¿Por qué el bot "ignoró" mi mensaje?**
El teléfono no está registrado como cliente. Créalo en **Clientes** o usa uno existente.

**¿Esto ya envía WhatsApp reales?**
No todavía. Está en modo simulación. Para enviar de verdad hay que conectar la cuenta de Meta
(`PROVIDER=meta-cloud`) con la SIM y las credenciales — ver `docs/06-guia-desarrollo-agentes.md`.

**¿Quién puede hacer qué?**
- `admin`: todo (incluye usuarios y reglas del bot).
- `operador`: clientes, plantillas, campañas, reportes.
- `agente`: solo conversaciones (responder, handoff).

---

## 9. Arrancar el sistema en local

```bash
# Backend (carpeta raíz)
npm run dev          # API en http://localhost:3000

# Frontend (otra terminal)
cd frontend
npm run dev          # panel en http://localhost:5173
```

Para más detalle técnico y despliegue, ver:
[`01-vision-y-arquitectura.md`](01-vision-y-arquitectura.md),
[`07-infraestructura-despliegue.md`](07-infraestructura-despliegue.md).
