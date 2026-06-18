# 04 · Seguridad: JWT, Roles y Usuario Base

## 1. Autenticación con JWT

Esquema **stateless** basado en JSON Web Tokens.

| Token | Vida útil | Contenido (payload) | Uso |
|-------|-----------|---------------------|-----|
| **Access token** | 15 min (`JWT_EXPIRES_IN`) | `{ sub: userId, rol, email }` | Cada request en `Authorization: Bearer` |
| **Refresh token** | 7 días (`JWT_REFRESH_EXPIRES_IN`) | `{ sub: userId, type: "refresh" }` | Renovar el access token en `/auth/refresh` |

- Firma con `JWT_SECRET` (access) y `JWT_REFRESH_SECRET` (refresh) — **secretos distintos**.
- Algoritmo `HS256`.
- El access token se valida en un **middleware** que inyecta `req.user = { id, rol, email }`.

### Flujo

```
POST /auth/login  (email + password)
   → bcrypt.compare(password, password_hash)
   → si ok: emite access + refresh, actualiza ultimo_login
   → si falla: 401 (mensaje genérico, no revelar si el email existe)

Request a endpoint protegido
   → middleware verifica Bearer token
   → token válido y user.activo → continúa
   → expirado/ inválido → 401

POST /auth/refresh (refreshToken)
   → verifica refresh token → emite nuevo access token
```

## 2. Contraseñas

- Hash con **bcrypt** (cost factor 10–12). **Nunca** se almacena ni se loguea la contraseña en texto.
- Política mínima recomendada: ≥ 8 caracteres (validar con Zod).
- El campo `password_hash` se excluye siempre de las respuestas (`select: false` en Mongoose).

## 3. Roles (RBAC)

| Rol | Permisos |
|-----|----------|
| `admin` | Todo: usuarios, clientes, plantillas, campañas, bot, reportes. |
| `operador` | Clientes, plantillas, campañas y reportes. **No** gestiona usuarios. |
| `agente` | Solo conversaciones (responder, handoff) y lectura de clientes. |

Implementación: middleware `requireRole('admin', 'operador')` que compara `req.user.rol`.

## 4. Usuario base (seed inicial)

Al arrancar (o vía script `npm run seed`), si **no existe ningún usuario**, se crea uno:

```jsonc
{
  "nombre": "Administrador",
  "email":  "<SEED_ADMIN_EMAIL>",      // desde .env, ej: admin@local.test
  "rol":    "admin",
  "activo": true
  // password = SEED_ADMIN_PASSWORD (de .env) → guardado como bcrypt hash
}
```

Variables en `.env`:

```env
SEED_ADMIN_EMAIL=admin@local.test
SEED_ADMIN_PASSWORD=Cambiar.Esto.123
```

> **Regla:** el seed nunca sobrescribe un usuario existente. En producción se debe cambiar la
> contraseña tras el primer login. Considerar forzar `must_change_password` (mejora futura).

## 5. Hardening (defensa en profundidad)

| Medida | Implementación |
|--------|----------------|
| Secretos fuera del código | Todo en `.env` (no commitear). Incluir `.env.example`. |
| Headers de seguridad | `helmet`. |
| CORS | Lista blanca de orígenes vía `CORS_ORIGINS`. |
| Rate limiting HTTP | `express-rate-limit`, especialmente en `/auth/login` (anti fuerza bruta). |
| Validación de entrada | Zod en todos los endpoints. |
| Webhooks | Verificar `verify token` (GET) y firma `X-Hub-Signature-256` (POST, meta-cloud). |
| Logs | Pino; **nunca** loguear tokens, contraseñas ni payloads sensibles completos. |
| Errores | No exponer stack traces al cliente en producción. |
| Dependencias | `npm audit` periódico. |
| Mongo/Redis | No exponer puertos públicos en el Droplet; solo red interna de Docker. |

## 6. Variables de entorno de seguridad (resumen)

```env
JWT_SECRET=<aleatorio largo>
JWT_REFRESH_SECRET=<aleatorio largo distinto>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_ROUNDS=10
SEED_ADMIN_EMAIL=admin@local.test
SEED_ADMIN_PASSWORD=Cambiar.Esto.123
CORS_ORIGINS=http://localhost:5173
WEBHOOK_VERIFY_TOKEN=<aleatorio>
```

> Generar secretos con `openssl rand -hex 32`.
