# 07 · Infraestructura y Despliegue

Objetivo: ejecutar **todo el stack en un único Droplet de DigitalOcean** mediante Docker Compose,
con límites estrictos de memoria por servicio.

## Servidor objetivo (oficial)

| Parámetro | Valor |
|-----------|-------|
| Imagen | **Ubuntu 24.04 LTS x64** |
| Plan | Basic – Premium Intel |
| vCPU / RAM | **1 vCPU / 2 GB** |
| Disco | 70 GB |
| Slug | `s-1vcpu-2gb-70gb-intel` |
| Costo | **$16/mo** |
| Autenticación | SSH Key (recomendado) |
| Swap | **2 GB (obligatorio)** — red de seguridad ante picos |

> **Mínimo absoluto:** 2 GB de RAM. El de 1 vCPU / 1 GB / $8 **no sirve** para el all-in-one
> (MongoDB + Redis + Node no caben juntos y el OOM killer tumba procesos en plena campaña).
>
> **Ruta de escalado:** si crece el volumen o se agrega Typebot/Chatwoot, redimensionar a
> **2 vCPU / 4 GB / $32** (`s-2vcpu-4gb-120gb-intel`) con un clic en DigitalOcean, sin reinstalar nada.

## Presupuesto de memoria (Droplet de 2 GB)

| Servicio | Límite RAM | Notas |
|----------|-----------|-------|
| MongoDB | 768 MB | `--wiredTigerCacheSizeGB 0.25` para no acaparar RAM |
| Redis | 256 MB | `--maxmemory 200mb --maxmemory-policy allkeys-lru` |
| App (Node) | 512 MB | API + worker BullMQ |
| (Reserva SO) | ~400 MB | sistema operativo y picos |

> En reposo el stack usa ~700 MB; durante una campaña de 1.000–3.000 mensajes sube a ~1.7–1.9 GB.
> El **swap de 2 GB** absorbe los picos puntuales sin que el sistema se caiga.

## `docker-compose.yml` (referencia)

```yaml
services:
  mongodb:
    image: mongo:6.0
    container_name: control-mongodb
    restart: always
    command: mongod --wiredTigerCacheSizeGB 0.25
    environment:
      MONGO_INITDB_DATABASE: whatsapp_control
    volumes:
      - mongo_data:/data/db
    deploy:
      resources:
        limits:
          memory: 768M
    # Sin "ports" públicos: solo accesible en la red interna de Docker.

  redis:
    image: redis:7.0-alpine
    container_name: control-redis
    restart: always
    command: redis-server --maxmemory 200mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    deploy:
      resources:
        limits:
          memory: 256M

  app:
    build: .
    container_name: control-backend
    restart: always
    env_file: .env
    ports:
      - "3000:3000"          # único puerto expuesto (idealmente detrás de Nginx/Caddy)
    depends_on:
      - mongodb
      - redis
    deploy:
      resources:
        limits:
          memory: 512M

volumes:
  mongo_data:
  redis_data:
```

> **Importante:** Mongo y Redis **no** exponen puertos al exterior. Solo `app` publica el `3000`.

## `Dockerfile` (referencia, multi-stage)

```dockerfile
# build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# runtime
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

## Worker / proceso

Para el MVP, la **API y el worker de BullMQ corren en el mismo proceso** (`app`), lo que reduce
RAM. Si el volumen crece, separar el worker en otro servicio del compose reutilizando la misma
imagen con `CMD ["node","dist/worker.js"]`.

## Despliegue en DigitalOcean (paso a paso)

1. Crear un **Droplet** **Ubuntu 24.04 LTS**, **1 vCPU / 2 GB / 70 GB** (`s-1vcpu-2gb-70gb-intel`),
   autenticación por **SSH Key**.
2. **Activar swap de 2 GB (obligatorio en 2 GB de RAM):**
   ```bash
   fallocate -l 2G /swapfile && chmod 600 /swapfile
   mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   sysctl vm.swappiness=10   # usar swap solo bajo presión real
   ```
3. Instalar Docker + Docker Compose plugin.
4. Configurar firewall (UFW): permitir 22 (SSH), 80/443 (web), bloquear 27017/6379.
5. Clonar el repositorio y crear `.env` a partir de `.env.example`
   (generar secretos con `openssl rand -hex 32`).
6. `docker compose up -d --build`.
7. Ejecutar el seed: `docker compose exec app npm run seed`.
8. (Recomendado) Poner **Caddy** o **Nginx** como reverse proxy con HTTPS (Let's Encrypt) delante
   del puerto 3000; necesario además para que Meta entregue webhooks por HTTPS.
9. Configurar la URL pública del webhook en Meta: `https://tu-dominio/api/v1/webhooks/whatsapp`.

## Operación y mantenimiento

| Tarea | Comando / acción |
|-------|------------------|
| Ver logs | `docker compose logs -f app` |
| Estado/memoria | `docker stats` |
| Backups Mongo | `mongodump` programado (cron) al volumen / almacenamiento externo |
| Actualizar | `git pull && docker compose up -d --build` |
| Monitoreo visual (opcional) | Portainer (límite ~256 MB) para ver contenedores y logs |

## Checklist de producción

- [ ] Secretos fuertes en `.env` (no commiteado).
- [ ] HTTPS activo (webhooks de Meta lo exigen).
- [ ] Mongo y Redis sin puertos públicos.
- [ ] Backups automáticos de MongoDB.
- [ ] `PROVIDER` y credenciales reales configuradas (cuando aplique).
- [ ] Rate limit de envío (`SEND_RATE_PER_SECOND`) ajustado al tier de Meta.
- [ ] Healthcheck monitoreado.
```
