# DevOps Lite

> Docker Compose, deployment, and monitoring for solo developers

## Table of Contents

1. [Development Environment](#development-environment)
2. [Docker Compose Setup](#docker-compose-setup)
3. [Environment Configuration](#environment-configuration)
4. [Deployment Options](#deployment-options)
5. [Database Backups](#database-backups)
6. [Monitoring & Logging](#monitoring--logging)
7. [SSL & Security](#ssl--security)
8. [Maintenance Tasks](#maintenance-tasks)

---

## Development Environment

### Prerequisites

```bash
# Required
- Bun 1.3+ (bun.sh)
- Docker Desktop
- Git

# Optional but recommended
- VS Code with extensions:
  - Docker
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
```

### Quick Start

```bash
# Clone repository
git clone https://github.com/your-username/insight-desk.git
cd insight-desk

# Install dependencies
bun install

# Start infrastructure
docker-compose up -d

# Run migrations
bun run db:migrate

# Seed development data
bun run db:seed

# Start development servers
bun run dev
```

---

## Docker Compose Setup

### Development Compose

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:18
    container_name: insightdesk-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-insightdesk}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-development}
      POSTGRES_DB: ${POSTGRES_DB:-insightdesk}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-insightdesk}"]
      interval: 10s
      timeout: 5s
      retries: 5

  valkey:
    image: valkey/valkey:9.0
    container_name: insightdesk-valkey
    restart: unless-stopped
    command: valkey-server --appendonly yes
    volumes:
      - valkey_data:/data
    ports:
      - "${VALKEY_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  mailpit:
    image: axllent/mailpit
    container_name: insightdesk-mailpit
    restart: unless-stopped
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # Web UI
    environment:
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1

volumes:
  postgres_data:
  valkey_data:
```

### Production Compose

```yaml
# docker-compose.prod.yml
services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: insightdesk-api
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      VALKEY_URL: redis://valkey:6379
      AUTH_SECRET: ${AUTH_SECRET}
      FRONTEND_URL: ${FRONTEND_URL}
    depends_on:
      postgres:
        condition: service_healthy
      valkey:
        condition: service_healthy
    networks:
      - internal
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.${DOMAIN}`)"
      - "traefik.http.routers.api.tls=true"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.services.api.loadbalancer.server.port=4000"

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    container_name: insightdesk-web
    restart: unless-stopped
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: https://api.${DOMAIN}
    depends_on:
      - api
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.web.rule=Host(`${DOMAIN}`)"
      - "traefik.http.routers.web.tls=true"
      - "traefik.http.routers.web.tls.certresolver=letsencrypt"
      - "traefik.http.services.web.loadbalancer.server.port=3000"

  postgres:
    image: postgres:18
    container_name: insightdesk-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  valkey:
    image: valkey/valkey:9.0
    container_name: insightdesk-valkey
    restart: unless-stopped
    command: valkey-server --appendonly yes --requirepass ${VALKEY_PASSWORD}
    volumes:
      - valkey_data:/data
    networks:
      - internal
    healthcheck:
      test: ["CMD", "valkey-cli", "-a", "${VALKEY_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  traefik:
    image: traefik:v3.0
    container_name: insightdesk-traefik
    restart: unless-stopped
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
      - "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_certs:/letsencrypt
    networks:
      - web
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`traefik.${DOMAIN}`)"
      - "traefik.http.routers.dashboard.service=api@internal"
      - "traefik.http.routers.dashboard.middlewares=auth"
      - "traefik.http.middlewares.auth.basicauth.users=${TRAEFIK_AUTH}"

networks:
  internal:
  web:

volumes:
  postgres_data:
  valkey_data:
  traefik_certs:
```

### Dockerfiles

```dockerfile
# apps/api/Dockerfile
FROM oven/bun:1.3 AS base

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
RUN bun install --frozen-lockfile

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build:api

# Production
FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

EXPOSE 4000

CMD ["bun", "run", "dist/index.js"]
```

```dockerfile
# apps/web/Dockerfile
FROM oven/bun:1.3 AS base

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN bun run build:web

# Production
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "run", "server.js"]
```

---

## Environment Configuration

### Environment Files Structure

```
insight-desk/
├── .env                    # Default (development)
├── .env.local              # Local overrides (git-ignored)
├── .env.production         # Production template
├── .env.example            # Documentation
└── apps/
    ├── api/
    │   └── .env.local      # API-specific overrides
    └── web/
        └── .env.local      # Web-specific overrides
```

### Example Environment File

```env
# .env.example

# ===================
# Application
# ===================
NODE_ENV=development
PORT=4000

# ===================
# Database
# ===================
POSTGRES_USER=insightdesk
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=insightdesk
POSTGRES_PORT=5432
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}

# ===================
# Valkey (Redis)
# ===================
VALKEY_URL=redis://localhost:6379
VALKEY_PASSWORD=  # Empty for development

# ===================
# Authentication
# ===================
AUTH_SECRET=your-32-character-secret-key-here
AUTH_URL=http://localhost:4000

# OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ===================
# Frontend
# ===================
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000

# ===================
# Email
# ===================
# Development: Use Mailpit (localhost:1025)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@insightdesk.local

# Production: Use Resend
# RESEND_API_KEY=re_xxx

# ===================
# Domain (Production)
# ===================
DOMAIN=insightdesk.app
ACME_EMAIL=admin@insightdesk.app
```

### Loading Environment Variables

```ts
// apps/api/src/config/env.ts
import { z } from "zod";
import { config } from "dotenv";

// Load .env files
config({ path: ".env" });
config({ path: ".env.local", override: true });

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),

  // Database
  DATABASE_URL: z.string().url(),

  // Valkey
  VALKEY_URL: z.string().url().default("redis://localhost:6379"),

  // Auth
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url(),

  // Frontend
  FRONTEND_URL: z.string().url(),

  // Email (optional in dev)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default("noreply@insightdesk.local"),
});

export const env = envSchema.parse(process.env);

// Validate at startup
console.log(`Environment: ${env.NODE_ENV}`);
```

---

## Deployment Options

### Option 1: Railway (Recommended for Solo)

Railway provides managed PostgreSQL, Redis, and easy deployments.

```bash
# Install Railway CLI
bun add -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add services
railway add --database postgres
railway add --plugin redis

# Deploy
railway up
```

**Railway Configuration:**

```toml
# railway.toml
[build]
builder = "dockerfile"
dockerfilePath = "apps/api/Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

**Estimated Cost:** ~$10-20/month for small apps

### Option 2: VPS (Hetzner/DigitalOcean)

For more control and lower costs at scale.

```bash
# Server setup script
#!/bin/bash

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER

# Install Docker Compose
apt install docker-compose-plugin -y

# Clone repository
git clone https://github.com/your-username/insight-desk.git
cd insight-desk

# Create environment file
cp .env.example .env.production
nano .env.production  # Edit with production values

# Start services
docker compose -f docker-compose.prod.yml up -d

# Setup SSL (handled by Traefik automatically)
```

**Estimated Cost:** ~$5-10/month for small VPS

### Option 3: Fly.io

Good for global distribution.

```toml
# fly.toml (API)
app = "insightdesk-api"
primary_region = "iad"

[build]
  dockerfile = "apps/api/Dockerfile"

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[[services.ports]]
  handlers = ["http"]
  port = 80

[[services.ports]]
  handlers = ["tls", "http"]
  port = 443
```

```bash
# Deploy
fly launch
fly secrets set DATABASE_URL=xxx AUTH_SECRET=xxx
fly deploy
```

### Deployment Checklist

```markdown
## Pre-Deployment Checklist

### Security
- [ ] AUTH_SECRET is unique and secure (32+ characters)
- [ ] DATABASE passwords are strong
- [ ] VALKEY_PASSWORD is set in production
- [ ] All secrets in environment variables, not in code
- [ ] CORS configured for production domain only

### Database
- [ ] Migrations run successfully
- [ ] Backup system configured
- [ ] Connection pooling enabled

### Performance
- [ ] Node.js memory limits set appropriately
- [ ] PostgreSQL connection pool sized correctly
- [ ] Static assets cached via CDN

### Monitoring
- [ ] Health check endpoints working
- [ ] Error tracking configured (Sentry)
- [ ] Log aggregation setup

### DNS
- [ ] Domain DNS configured
- [ ] SSL certificates provisioning
- [ ] Email SPF/DKIM records set
```

---

## Database Backups

### Automated Backup Script

```bash
#!/bin/bash
# scripts/backup.sh

set -e

# Configuration
BACKUP_DIR="/backups"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="$BACKUP_DIR/insightdesk_$DATE.sql.gz"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create backup
echo "Creating backup: $BACKUP_FILE"
docker exec insightdesk-postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip > $BACKUP_FILE

# Upload to S3 (optional)
if [ -n "$S3_BUCKET" ]; then
  echo "Uploading to S3..."
  aws s3 cp $BACKUP_FILE s3://$S3_BUCKET/backups/
fi

# Cleanup old backups
echo "Cleaning up old backups..."
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup complete!"
```

### Backup Cron Job

```bash
# Add to crontab
# crontab -e

# Daily backup at 3 AM
0 3 * * * /opt/insight-desk/scripts/backup.sh >> /var/log/backup.log 2>&1
```

### Restore Procedure

```bash
#!/bin/bash
# scripts/restore.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./restore.sh <backup_file>"
  exit 1
fi

echo "⚠️  This will replace the current database!"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo "Restoring from: $BACKUP_FILE"

# Stop API to prevent writes
docker stop insightdesk-api

# Restore database
gunzip -c $BACKUP_FILE | docker exec -i insightdesk-postgres psql -U $POSTGRES_USER $POSTGRES_DB

# Restart API
docker start insightdesk-api

echo "Restore complete!"
```

### pg-boss Job for Backups

```ts
// apps/api/src/lib/jobs/workers/backup.ts
import PgBoss from "pg-boss";
import { exec } from "child_process";
import { promisify } from "util";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "fs";

const execAsync = promisify(exec);

export const backupWorker = {
  async register(boss: PgBoss) {
    // Schedule daily backup at 3 AM UTC
    await boss.schedule("database-backup", "0 3 * * *", {});

    await boss.work("database-backup", async () => {
      await createBackup();
    });
  },
};

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup_${timestamp}.sql.gz`;
  const filepath = `/tmp/${filename}`;

  console.log("Creating database backup...");

  // Create backup
  await execAsync(
    `pg_dump ${process.env.DATABASE_URL} | gzip > ${filepath}`
  );

  // Upload to S3
  if (process.env.S3_BUCKET) {
    const s3 = new S3Client({ region: process.env.AWS_REGION });

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: `backups/${filename}`,
        Body: createReadStream(filepath),
      })
    );

    console.log(`Backup uploaded to S3: ${filename}`);
  }

  // Cleanup local file
  await execAsync(`rm ${filepath}`);

  console.log("Backup complete!");
}
```

---

## Monitoring & Logging

### Health Check Endpoints

```ts
// apps/api/src/routes/health.ts
import { Router } from "express";
import { db } from "@/db";
import { getBoss } from "@/lib/jobs/boss";
import { getValkey } from "@/lib/valkey";

const router = Router();

// Simple health check (for load balancers)
router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Detailed health check (for monitoring)
router.get("/health/ready", async (req, res) => {
  const checks = {
    database: false,
    valkey: false,
    jobs: false,
  };

  try {
    // Check database
    await db.execute("SELECT 1");
    checks.database = true;

    // Check Valkey
    const valkey = getValkey();
    await valkey.ping();
    checks.valkey = true;

    // Check job queue
    const boss = getBoss();
    checks.jobs = boss.isConnected;

    const allHealthy = Object.values(checks).every(Boolean);

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? "healthy" : "unhealthy",
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      checks,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
});

// Metrics endpoint (Prometheus format)
router.get("/metrics", async (req, res) => {
  const boss = getBoss();

  // Get job queue metrics
  const [emailQueue, slaQueue] = await Promise.all([
    boss.getQueueSize("email"),
    boss.getQueueSize("sla-check"),
  ]);

  const metrics = `
# HELP insightdesk_job_queue_size Number of jobs in queue
# TYPE insightdesk_job_queue_size gauge
insightdesk_job_queue_size{queue="email"} ${emailQueue}
insightdesk_job_queue_size{queue="sla-check"} ${slaQueue}

# HELP insightdesk_uptime_seconds Application uptime in seconds
# TYPE insightdesk_uptime_seconds counter
insightdesk_uptime_seconds ${process.uptime()}
  `.trim();

  res.set("Content-Type", "text/plain");
  res.send(metrics);
});

export default router;
```

### Structured Logging

```ts
// apps/api/src/lib/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  base: {
    env: process.env.NODE_ENV,
  },
  redact: ["req.headers.authorization", "req.headers.cookie"],
});

// Request logging middleware
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;

      logger.info({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
    });

    next();
  };
}
```

### Error Tracking (Sentry)

```ts
// apps/api/src/lib/sentry.ts
import * as Sentry from "@sentry/node";

export function initSentry() {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    integrations: [
      // Enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // Enable Express.js tracing
      new Sentry.Integrations.Express(),
    ],
  });
}

// Error handler middleware
export function sentryErrorHandler() {
  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Only report 500 errors
      return error.status >= 500;
    },
  });
}
```

### Uptime Monitoring (Free Options)

1. **UptimeRobot** (free tier: 50 monitors)
   - Monitor `/health` endpoint
   - Email/SMS alerts

2. **Better Uptime** (free tier available)
   - Status page
   - Incident management

3. **Cronitor** (free tier: 5 monitors)
   - Cron job monitoring
   - Heartbeat checks

---

## SSL & Security

### SSL with Traefik (Automatic)

Traefik automatically provisions Let's Encrypt certificates. Configuration is in `docker-compose.prod.yml`.

### Security Headers Checklist

```ts
// apps/api/src/middleware/security.ts
import helmet from "helmet";

export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL!],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for WebSocket
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});
```

### Firewall Configuration (UFW)

```bash
# Allow SSH
ufw allow 22/tcp

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw enable

# Check status
ufw status verbose
```

---

## Maintenance Tasks

### Update Dependencies

```bash
# Check for updates
bun outdated

# Update all dependencies
bun update

# Update specific package
bun update @package/name
```

### Database Maintenance

```sql
-- Run weekly: Vacuum and analyze
VACUUM ANALYZE;

-- Check table sizes
SELECT
  schemaname,
  relname,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;

-- Check index usage
SELECT
  schemaname,
  relname,
  indexrelname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC
LIMIT 10;
```

### Rolling Deployment

```bash
#!/bin/bash
# scripts/deploy.sh

set -e

echo "Pulling latest code..."
git pull origin main

echo "Building new images..."
docker compose -f docker-compose.prod.yml build

echo "Running migrations..."
docker compose -f docker-compose.prod.yml run --rm api bun run db:migrate

echo "Restarting services..."
docker compose -f docker-compose.prod.yml up -d --no-deps api web

echo "Waiting for health check..."
sleep 10

# Check health
if curl -f http://localhost:4000/health > /dev/null 2>&1; then
  echo "✅ Deployment successful!"
else
  echo "❌ Health check failed, rolling back..."
  docker compose -f docker-compose.prod.yml rollback
  exit 1
fi
```

### Scheduled Maintenance Job

```ts
// apps/api/src/lib/jobs/workers/maintenance.ts
import PgBoss from "pg-boss";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const maintenanceWorker = {
  async register(boss: PgBoss) {
    // Run weekly on Sunday at 4 AM
    await boss.schedule("database-maintenance", "0 4 * * 0", {});

    await boss.work("database-maintenance", async () => {
      console.log("Running database maintenance...");

      // Vacuum and analyze
      await db.execute(sql`VACUUM ANALYZE`);

      // Archive old tickets (> 1 year)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      await db.execute(sql`
        INSERT INTO archived_tickets
        SELECT * FROM tickets
        WHERE status = 'closed'
        AND closed_at < ${oneYearAgo}
      `);

      await db.execute(sql`
        DELETE FROM tickets
        WHERE status = 'closed'
        AND closed_at < ${oneYearAgo}
      `);

      console.log("Maintenance complete!");
    });
  },
};
```

---

## Quick Reference

### Common Commands

```bash
# Development
docker compose up -d              # Start infrastructure
docker compose logs -f postgres   # View logs
docker compose down               # Stop all

# Production
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml restart api

# Database
bun run db:migrate                # Run migrations
bun run db:seed                   # Seed data
bun run db:studio                 # Open Drizzle Studio

# Monitoring
curl http://localhost:4000/health         # Health check
curl http://localhost:4000/health/ready   # Detailed health
```

### Emergency Procedures

```markdown
## Database Down
1. Check container: `docker ps`
2. Check logs: `docker logs insightdesk-postgres`
3. Restart: `docker restart insightdesk-postgres`
4. Restore from backup if needed

## API Unresponsive
1. Check health: `curl localhost:4000/health`
2. Check memory: `docker stats insightdesk-api`
3. Check logs: `docker logs --tail 100 insightdesk-api`
4. Restart: `docker restart insightdesk-api`

## Disk Full
1. Check disk: `df -h`
2. Clean Docker: `docker system prune -a`
3. Clean logs: `truncate -s 0 /var/log/*.log`
4. Remove old backups
```

---

## Next Steps

- **13-timeline.md** - Development schedule and milestones

---

*Solo Developer Note: Start with Railway or Fly.io to minimize ops work. Move to VPS only when you need cost optimization or more control.*
