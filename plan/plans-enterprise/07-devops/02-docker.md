# Docker Configuration

> Complete containerization setup for InsightDesk using Docker and Docker Compose.

## Table of Contents

1. [Dockerfile Configurations](#dockerfile-configurations)
2. [Docker Compose Setup](#docker-compose-setup)
3. [Multi-Stage Builds](#multi-stage-builds)
4. [Volume Management](#volume-management)
5. [Networking](#networking)
6. [Best Practices](#best-practices)

---

## Dockerfile Configurations

### API Server Dockerfile

```dockerfile
# docker/Dockerfile.api
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .

# Generate Prisma client
RUN bunx prisma generate --schema=./apps/api/prisma/schema.prisma

# Build API
RUN bun run build:api

# Production stage
FROM base AS runner
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 api
USER api

COPY --from=builder --chown=api:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=api:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=api:nodejs /app/node_modules ./node_modules

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["bun", "run", "dist/index.js"]
```

### Next.js Frontend Dockerfile

```dockerfile
# docker/Dockerfile.web
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
RUN bun install --frozen-lockfile

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN bun run build:web

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./public

# Set correct permissions for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["bun", "run", "server.js"]
```

### Background Worker Dockerfile

```dockerfile
# docker/Dockerfile.worker
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bunx prisma generate --schema=./apps/api/prisma/schema.prisma
RUN bun run build:worker

# Production stage
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker
USER worker

COPY --from=builder --chown=worker:nodejs /app/apps/worker/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD bun run dist/health.js || exit 1

CMD ["bun", "run", "dist/index.js"]
```

---

## Docker Compose Setup

### Development Environment

```yaml
# docker-compose.yml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    container_name: insightdesk-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: insightdesk
      POSTGRES_PASSWORD: ${DB_PASSWORD:-insightdesk_dev}
      POSTGRES_DB: insightdesk
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql:ro
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U insightdesk -d insightdesk"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Valkey (Redis-compatible)
  valkey:
    image: valkey/valkey:7-alpine
    container_name: insightdesk-valkey
    restart: unless-stopped
    command: valkey-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - valkey_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # MinIO (S3-compatible storage)
  minio:
    image: minio/minio:latest
    container_name: insightdesk-minio
    restart: unless-stopped
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY:-minioadmin}
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 30s
      timeout: 20s
      retries: 3

  # Email testing (development only)
  mailhog:
    image: mailhog/mailhog:latest
    container_name: insightdesk-mailhog
    restart: unless-stopped
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI
    profiles:
      - development

  # API Server (development with hot reload)
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
      target: deps
    container_name: insightdesk-api
    restart: unless-stopped
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://insightdesk:${DB_PASSWORD:-insightdesk_dev}@postgres:5432/insightdesk
      VALKEY_URL: redis://valkey:6379
      JWT_SECRET: ${JWT_SECRET:-dev-secret-change-in-production}
      SMTP_HOST: mailhog
      SMTP_PORT: 1025
    volumes:
      - ./apps/api:/app/apps/api
      - ./packages:/app/packages
      - /app/node_modules
      - /app/apps/api/node_modules
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_healthy
      valkey:
        condition: service_healthy
    command: bun run dev:api
    profiles:
      - development

  # Next.js Frontend (development with hot reload)
  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
      target: deps
    container_name: insightdesk-web
    restart: unless-stopped
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_API_URL: http://localhost:4000
    volumes:
      - ./apps/web:/app/apps/web
      - ./packages:/app/packages
      - /app/node_modules
      - /app/apps/web/node_modules
      - /app/apps/web/.next
    ports:
      - "3000:3000"
    depends_on:
      - api
    command: bun run dev:web
    profiles:
      - development

  # Background Worker
  worker:
    build:
      context: .
      dockerfile: docker/Dockerfile.worker
      target: deps
    container_name: insightdesk-worker
    restart: unless-stopped
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://insightdesk:${DB_PASSWORD:-insightdesk_dev}@postgres:5432/insightdesk
      VALKEY_URL: redis://valkey:6379
    volumes:
      - ./apps/worker:/app/apps/worker
      - ./packages:/app/packages
      - /app/node_modules
    depends_on:
      postgres:
        condition: service_healthy
      valkey:
        condition: service_healthy
    command: bun run dev:worker
    profiles:
      - development

volumes:
  postgres_data:
  valkey_data:
  minio_data:

networks:
  default:
    name: insightdesk-network
```

### Production Docker Compose

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  api:
    image: ghcr.io/your-org/insightdesk-api:${TAG:-latest}
    restart: always
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
      rollback_config:
        parallelism: 1
        delay: 10s
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      VALKEY_URL: ${VALKEY_URL}
      JWT_SECRET: ${JWT_SECRET}
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  web:
    image: ghcr.io/your-org/insightdesk-web:${TAG:-latest}
    restart: always
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: ${API_URL}
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  worker:
    image: ghcr.io/your-org/insightdesk-worker:${TAG:-latest}
    restart: always
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 1G
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      VALKEY_URL: ${VALKEY_URL}

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./nginx/logs:/var/log/nginx
    depends_on:
      - api
      - web

networks:
  default:
    name: insightdesk-prod
    driver: overlay
```

---

## Multi-Stage Builds

### Build Optimization Strategy

```dockerfile
# Optimal layer ordering for caching
# 1. Base image (rarely changes)
# 2. System dependencies (rarely changes)
# 3. Package files (changes on dependency update)
# 4. Install dependencies (rebuilds when packages change)
# 5. Source code (changes frequently)
# 6. Build step (rebuilds when source changes)
```

### Build Arguments

```dockerfile
# Support build-time configuration
ARG NODE_ENV=production
ARG API_URL
ARG SENTRY_DSN

ENV NODE_ENV=$NODE_ENV
ENV NEXT_PUBLIC_API_URL=$API_URL
ENV NEXT_PUBLIC_SENTRY_DSN=$SENTRY_DSN
```

### Image Size Optimization

```dockerfile
# Use alpine images
FROM oven/bun:1-alpine

# Remove unnecessary files
RUN rm -rf /tmp/* /var/cache/apk/*

# Use .dockerignore
# .dockerignore contents:
# node_modules
# .git
# .next
# dist
# *.log
# .env*
# coverage
# .turbo
```

---

## Volume Management

### Named Volumes

```yaml
volumes:
  postgres_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /data/postgres

  valkey_data:
    driver: local

  minio_data:
    driver: local
```

### Backup Scripts

```bash
#!/bin/bash
# scripts/backup-volumes.sh

BACKUP_DIR="/backups/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker exec insightdesk-postgres pg_dump -U insightdesk insightdesk | \
  gzip > "$BACKUP_DIR/postgres.sql.gz"

# Backup Valkey
docker exec insightdesk-valkey valkey-cli BGSAVE
docker cp insightdesk-valkey:/data/dump.rdb "$BACKUP_DIR/valkey.rdb"

# Backup MinIO
docker run --rm \
  -v minio_data:/data:ro \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/minio.tar.gz /data

echo "Backup completed: $BACKUP_DIR"
```

---

## Networking

### Network Configuration

```yaml
networks:
  frontend:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/24
  
  backend:
    driver: bridge
    internal: true
    ipam:
      config:
        - subnet: 172.21.0.0/24
  
  database:
    driver: bridge
    internal: true
    ipam:
      config:
        - subnet: 172.22.0.0/24
```

### Service Network Assignment

```yaml
services:
  nginx:
    networks:
      - frontend

  web:
    networks:
      - frontend
      - backend

  api:
    networks:
      - backend
      - database

  postgres:
    networks:
      - database

  valkey:
    networks:
      - backend
```

---

## Best Practices

### Security

```dockerfile
# 1. Run as non-root user
RUN addgroup --system --gid 1001 app
RUN adduser --system --uid 1001 app
USER app

# 2. Use specific image tags
FROM oven/bun:1.0.25-alpine

# 3. Scan images for vulnerabilities
# In CI: docker scan or trivy

# 4. Don't store secrets in images
# Use environment variables or secrets management

# 5. Use read-only filesystem where possible
docker run --read-only --tmpfs /tmp app
```

### Performance

```yaml
# 1. Use BuildKit for faster builds
export DOCKER_BUILDKIT=1

# 2. Leverage build cache
services:
  api:
    build:
      cache_from:
        - ghcr.io/your-org/insightdesk-api:latest

# 3. Use appropriate resource limits
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 1G
```

### Development Workflow

```bash
# Start infrastructure only
docker compose up postgres valkey minio -d

# Run app locally with Bun
bun run dev

# Full containerized development
docker compose --profile development up

# Rebuild specific service
docker compose build api --no-cache

# View logs
docker compose logs -f api

# Shell access
docker compose exec api sh
```

### .dockerignore

```
# .dockerignore
node_modules
.git
.gitignore
.next
dist
build
*.log
.env*
.env.local
coverage
.turbo
.husky
*.md
!README.md
Dockerfile*
docker-compose*
.dockerignore
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `docker compose up -d` | Start all services |
| `docker compose down` | Stop all services |
| `docker compose down -v` | Stop and remove volumes |
| `docker compose logs -f [service]` | Follow logs |
| `docker compose exec [service] sh` | Shell into container |
| `docker compose build --no-cache` | Rebuild without cache |
| `docker system prune -a` | Clean up unused resources |
