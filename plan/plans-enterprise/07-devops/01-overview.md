# DevOps Overview

> Containerization, CI/CD, deployment, and monitoring strategies for InsightDesk.

## Table of Contents

1. [Philosophy](#philosophy)
2. [Infrastructure Components](#infrastructure-components)
3. [Environment Strategy](#environment-strategy)
4. [Tooling Stack](#tooling-stack)
5. [Related Documentation](#related-documentation)

---

## Philosophy

### Infrastructure as Code

All infrastructure is version-controlled and reproducible:

```
infrastructure/
├── docker/
│   ├── Dockerfile.api          # API server image
│   ├── Dockerfile.web          # Next.js frontend image
│   ├── Dockerfile.worker       # Background worker image
│   └── docker-compose.yml      # Local development stack
├── kubernetes/                  # Production K8s manifests (optional)
│   ├── deployments/
│   ├── services/
│   ├── configmaps/
│   └── secrets/
├── terraform/                   # Cloud infrastructure (optional)
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
└── scripts/
    ├── deploy.sh
    ├── backup.sh
    └── health-check.sh
```

### GitOps Principles

1. **Declarative Configuration**: All configs in Git
2. **Version Controlled**: Full history and rollback
3. **Automated Sync**: CI/CD deploys from Git
4. **Observable**: Clear deployment status

---

## Infrastructure Components

### Development Environment

```yaml
# Local development stack
services:
  - PostgreSQL (database)
  - Valkey (cache/queue)
  - Minio (S3-compatible storage)
  - Mailhog (email testing)
```

### Staging Environment

- Mirrors production configuration
- Uses separate database instance
- Reduced resource allocation
- Accessible via VPN or IP whitelist

### Production Environment

```
┌─────────────────────────────────────────────────────────────┐
│                      Load Balancer                          │
│                    (nginx/Traefik/ALB)                      │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │  Web 1   │    │  Web 2   │    │  Web 3   │
        │ (Next.js)│    │ (Next.js)│    │ (Next.js)│
        └──────────┘    └──────────┘    └──────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
        ┌─────────────────────────────────────────────┐
        │              API Gateway                     │
        │            (nginx/Kong)                      │
        └─────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │  API 1   │    │  API 2   │    │  API 3   │
        │ (Express)│    │ (Express)│    │ (Express)│
        └──────────┘    └──────────┘    └──────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
        ┌────────────────┬────────────────────────────┐
        │                │                            │
        ▼                ▼                            ▼
  ┌──────────┐    ┌──────────────┐           ┌──────────────┐
  │PostgreSQL│    │    Valkey    │           │    Worker    │
  │ Primary  │    │   Cluster    │           │   Instances  │
  └──────────┘    └──────────────┘           └──────────────┘
        │
        ▼
  ┌──────────┐
  │PostgreSQL│
  │ Replica  │
  └──────────┘
```

---

## Environment Strategy

### Environment Configuration

| Environment | Purpose | Database | Caching | Domain |
|-------------|---------|----------|---------|--------|
| Local | Development | Docker PostgreSQL | Docker Valkey | localhost:3000 |
| Test | CI/CD tests | In-memory/Docker | Mock | N/A |
| Staging | Pre-production | Cloud PostgreSQL | Cloud Valkey | staging.insightdesk.io |
| Production | Live system | Cloud PostgreSQL HA | Cloud Valkey HA | app.insightdesk.io |

### Environment Variables Management

```typescript
// config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  
  // Database
  DATABASE_URL: z.string(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),
  
  // Valkey
  VALKEY_URL: z.string(),
  
  // Auth
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  
  // Email
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number(),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  
  // Storage
  S3_BUCKET: z.string(),
  S3_REGION: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  
  // Monitoring
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export const env = envSchema.parse(process.env);
```

### Secrets Management

```yaml
# Development: .env files (gitignored)
# Staging/Production: Platform secrets management

# Options by platform:
# - Docker Swarm: Docker secrets
# - Kubernetes: K8s secrets + sealed-secrets
# - AWS: AWS Secrets Manager / Parameter Store
# - Azure: Azure Key Vault
# - GCP: Secret Manager
```

---

## Tooling Stack

### Container Runtime

| Tool | Purpose | Environment |
|------|---------|-------------|
| Docker | Containerization | All |
| Docker Compose | Local orchestration | Development |
| Kubernetes | Production orchestration | Production (optional) |

### CI/CD Platform

| Tool | Purpose |
|------|---------|
| GitHub Actions | Primary CI/CD |
| Docker Hub / GHCR | Container registry |
| Dependabot | Dependency updates |

### Monitoring & Observability

| Tool | Purpose |
|------|---------|
| Prometheus | Metrics collection |
| Grafana | Metrics visualization |
| Loki | Log aggregation |
| Sentry | Error tracking |
| Uptime Kuma | Uptime monitoring |

### Infrastructure

| Tool | Purpose |
|------|---------|
| nginx / Traefik | Reverse proxy / Load balancer |
| Certbot / Let's Encrypt | SSL certificates |
| Cloudflare | CDN / DDoS protection |

---

## Related Documentation

- [Docker Configuration](./docker.md) - Container setup and Compose
- [CI/CD Pipelines](./ci-cd.md) - GitHub Actions workflows
- [Deployment Guide](./deployment.md) - Production deployment steps
- [Monitoring](./monitoring.md) - Logging, metrics, and alerts

---

## Quick Commands Reference

```bash
# Local development
bun run docker:up          # Start all services
bun run docker:down        # Stop all services
bun run docker:logs        # View logs
bun run docker:shell api   # Shell into container

# Database
bun run db:migrate         # Run migrations
bun run db:seed            # Seed data
bun run db:reset           # Reset database

# Deployment
bun run deploy:staging     # Deploy to staging
bun run deploy:production  # Deploy to production

# Monitoring
bun run logs:tail          # Tail production logs
bun run health:check       # Check service health
```
