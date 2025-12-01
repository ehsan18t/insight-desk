# Deployment Guide

> Guide for deploying InsightDesk to production environments

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Deployment Options](#deployment-options)
- [Post-Deployment](#post-deployment)
- [Troubleshooting](#troubleshooting)

---

## Overview

InsightDesk is designed for production deployment with:

- **PostgreSQL** with Row-Level Security (RLS) for multi-tenant isolation
- **Valkey/Redis** for caching, sessions, and job queues
- **S3-compatible storage** for file uploads (MinIO, AWS S3, Cloudflare R2)
- **SMTP** for email notifications

### Deployment Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Load Balancer │────▶│   Application   │────▶│   PostgreSQL    │
│   (Nginx/ALB)   │     │   (Node/Bun)    │     │   (with RLS)    │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
            ┌───────────┐ ┌───────────┐ ┌───────────┐
            │   Valkey  │ │  S3/MinIO │ │   SMTP    │
            │  (Cache)  │ │ (Storage) │ │  (Email)  │
            └───────────┘ └───────────┘ └───────────┘
```

---

## Prerequisites

### Required Services

| Service    | Purpose                 | Options                        |
| ---------- | ----------------------- | ------------------------------ |
| PostgreSQL | Primary database        | AWS RDS, Supabase, self-hosted |
| Valkey     | Cache, sessions, queues | Redis, Upstash, self-hosted    |
| S3 Storage | File uploads            | AWS S3, Cloudflare R2, MinIO   |
| SMTP       | Email notifications     | SendGrid, Postmark, SES        |

### System Requirements

- **Node.js** 22+ or **Bun** 1.0+
- **PostgreSQL** 15+ (with RLS support)
- **Valkey/Redis** 7+

---

## Environment Configuration

### Production Environment Variables

Create a `.env` file with the following variables:

```bash
# ─────────────────────────────────────────────────────────────
# Application
# ─────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=3001
API_URL=https://api.yourdomain.com
FRONTEND_URL=https://yourdomain.com

# ─────────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@host:5432/insightdesk

# ─────────────────────────────────────────────────────────────
# Cache & Queue (Valkey/Redis)
# ─────────────────────────────────────────────────────────────
VALKEY_URL=redis://user:password@host:6379

# ─────────────────────────────────────────────────────────────
# Storage (S3-compatible)
# ─────────────────────────────────────────────────────────────
STORAGE_PROVIDER=s3
STORAGE_S3_ENDPOINT=https://s3.amazonaws.com
STORAGE_S3_BUCKET=your-bucket-name
STORAGE_S3_ACCESS_KEY=your-access-key
STORAGE_S3_SECRET_KEY=your-secret-key
STORAGE_S3_REGION=us-east-1

# ─────────────────────────────────────────────────────────────
# Email (SMTP)
# ─────────────────────────────────────────────────────────────
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=support@yourdomain.com

# ─────────────────────────────────────────────────────────────
# Authentication
# ─────────────────────────────────────────────────────────────
BETTER_AUTH_SECRET=your-secure-random-secret-min-32-chars
BETTER_AUTH_URL=https://api.yourdomain.com

# ─────────────────────────────────────────────────────────────
# API Documentation (Optional)
# ─────────────────────────────────────────────────────────────
ENABLE_API_DOCS=false
```

### Security Checklist

- [ ] Use strong, unique passwords for all services
- [ ] Set `BETTER_AUTH_SECRET` to a random 32+ character string
- [ ] Enable SSL/TLS for all connections
- [ ] Configure firewall rules to restrict database access
- [ ] Use environment variables, never commit secrets

---

## Database Setup

### Production Database Setup Script

InsightDesk provides a production-ready database setup script:

```bash
# Run database migrations and set up RLS roles
bun run db:setup:prod

# Preview what would be done (recommended first)
bun run db:setup:prod --dry-run

# With verbose output
bun run db:setup:prod --verbose

# Include seed data (not recommended for production)
bun run db:setup:prod --seed
```

### What the Setup Script Does

1. **Runs Migrations** - Applies versioned schema changes from `drizzle/migrations/`
2. **Creates RLS Roles** - Sets up `app_user` and `service_role` PostgreSQL roles
3. **Grants Permissions** - Configures role permissions and BYPASSRLS
4. **Verifies Setup** - Confirms roles, RLS policies, and tables are correct

### Manual Database Setup

If you prefer manual setup:

```bash
# 1. Generate migrations (if schema changed)
bun run db:generate

# 2. Apply migrations
bun run db:migrate

# 3. Verify RLS is configured
bun run db:setup:prod --dry-run
```

### Database Migration Workflow

```
Development                    Production
    │                              │
    ▼                              │
 Edit Schema                       │
 (tables.ts)                       │
    │                              │
    ▼                              │
 bun run db:push                   │
 (fast iteration)                  │
    │                              │
    ▼                              │
 Test Changes                      │
    │                              │
    ▼                              │
 bun run db:generate ─────────────▶│
 (create migration files)          │
    │                              ▼
    │                    bun run db:setup:prod
    │                    (apply migrations + RLS)
    │                              │
    │                              ▼
    │                         Verify
```

---

## Deployment Options

### Option 1: Render.com (Recommended)

InsightDesk includes a `render.yaml` Blueprint for one-click deployment to Render.

#### Quick Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ehsan18t/insight-desk)

#### What Gets Created

| Service             | Type       | Description                    |
| ------------------- | ---------- | ------------------------------ |
| `insightdesk-api`   | Web        | Main API server (Docker)       |
| `insightdesk-db`    | PostgreSQL | Database with RLS support      |
| `insightdesk-cache` | Key Value  | Valkey for caching & Socket.IO |

#### Required Configuration

After clicking Deploy, configure these environment variables in the Render Dashboard:

| Variable          | Required | Description                                                            |
| ----------------- | -------- | ---------------------------------------------------------------------- |
| `API_URL`         | Yes      | Your Render service URL (e.g., `https://insightdesk-api.onrender.com`) |
| `FRONTEND_URL`    | Yes      | Your frontend URL                                                      |
| `BETTER_AUTH_URL` | Yes      | Same as API_URL                                                        |

#### Optional Configuration (for full features)

**File Storage (S3-compatible):**
| Variable                | Description                |
| ----------------------- | -------------------------- |
| `STORAGE_S3_ENDPOINT`   | S3/R2/MinIO endpoint URL   |
| `STORAGE_S3_REGION`     | Region (e.g., `us-east-1`) |
| `STORAGE_S3_BUCKET`     | Bucket name                |
| `STORAGE_S3_ACCESS_KEY` | Access key                 |
| `STORAGE_S3_SECRET_KEY` | Secret key                 |

**Email (SMTP):**
| Variable     | Description                                |
| ------------ | ------------------------------------------ |
| `SMTP_HOST`  | SMTP server (e.g., `smtp.sendgrid.net`)    |
| `SMTP_USER`  | SMTP username                              |
| `SMTP_PASS`  | SMTP password or API key                   |
| `EMAIL_FROM` | From address (e.g., `noreply@example.com`) |

**OAuth Providers:**
| Variable               | Description         |
| ---------------------- | ------------------- |
| `GOOGLE_CLIENT_ID`     | Google OAuth ID     |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret |
| `GITHUB_CLIENT_ID`     | GitHub OAuth ID     |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Secret |

#### How It Works

1. **Build**: Render builds the Docker image using `Dockerfile`
2. **Pre-deploy**: Runs `npx drizzle-kit migrate` to apply database migrations
3. **Start**: Runs the compiled application with `node dist/index.js`
4. **Health Check**: Monitors `/health` endpoint for zero-downtime deploys

#### WebSocket Support

Render natively supports WebSockets. Socket.IO connections work automatically with the Valkey adapter for horizontal scaling.

---

### Option 2: Docker (Self-hosted)

```dockerfile
# Build the production image
docker build -t insightdesk .

# Run with environment file
docker run -p 3001:3001 --env-file .env insightdesk
```

For production, use the included `docker-compose.yml` with external PostgreSQL and Valkey:

```bash
# Build and run
docker compose up -d
```

### Option 3: Platform as a Service (Manual)

**Railway / Render / Fly.io:**

1. Connect your GitHub repository
2. Set environment variables in the dashboard
3. Configure build command: `bun install && bun run build`
4. Configure start command: `bun run start`
5. Run database setup: `bun run db:setup:prod`

### Option 4: VPS / Bare Metal

```bash
# 1. Clone repository
git clone https://github.com/ehsan18t/insight-desk.git
cd insight-desk

# 2. Install dependencies
bun install

# 3. Set up environment
cp .env.example .env
# Edit .env with production values

# 4. Set up database
bun run db:setup:prod

# 5. Build and start
bun run build
bun run start

# Or use PM2 for process management
pm2 start dist/index.js --name insightdesk
```

---

## Post-Deployment

### Health Check

```bash
curl https://api.yourdomain.com/health
# Expected: { "status": "ok", "timestamp": "..." }
```

### Verify Database Setup

```bash
bun run db:setup:prod --dry-run --verbose
```

This will show the current state of:
- RLS roles (app_user, service_role)
- RLS-enabled tables
- RLS policies
- Table counts

### Create Initial Admin

Use the API or seed script to create the first organization and admin user:

```bash
# Seed with demo data (development only)
bun run db:seed

# Or create via API
curl -X POST https://api.yourdomain.com/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "secure-password", "name": "Admin"}'
```

---

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check if migrations are applied
bun run db:setup:prod --dry-run
```

### RLS Permission Denied

If you see "permission denied for table X":

```bash
# Re-run permission grants
bun run db:setup:prod --verbose
```

### Migration Conflicts

```bash
# Check migration status
bun run db:migrate

# If stuck, check drizzle migration table
psql $DATABASE_URL -c "SELECT * FROM drizzle.__drizzle_migrations"
```

### Common Errors

| Error                     | Solution                                 |
| ------------------------- | ---------------------------------------- |
| `ECONNREFUSED`            | Check DATABASE_URL and firewall rules    |
| `permission denied`       | Re-run `db:setup:prod` to fix RLS grants |
| `relation does not exist` | Run `db:setup:prod` to apply migrations  |
| `role does not exist`     | Migrations create roles; ensure they ran |

---

## Commands Reference

| Command                           | Description                        |
| --------------------------------- | ---------------------------------- |
| `bun run db:setup:prod`           | Full production database setup     |
| `bun run db:setup:prod --dry-run` | Preview setup without changes      |
| `bun run db:migrate:prod`         | Apply migrations only (for Render) |
| `bun run db:generate`             | Generate migration files           |
| `bun run db:migrate`              | Apply migrations (dev)             |
| `bun run start`                   | Start production server            |
| `bun run start:prod`              | Start compiled production server   |
| `bun run build`                   | Build for production               |
