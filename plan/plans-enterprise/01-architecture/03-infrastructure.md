# Infrastructure Architecture

> Cloud architecture, deployment topology, and environment configuration

---

## Table of Contents

- [Deployment Topology](#deployment-topology)
- [Environment Configuration](#environment-configuration)
- [Cloud Services](#cloud-services)
- [Networking](#networking)
- [Secrets Management](#secrets-management)
- [SSL/TLS Configuration](#ssltls-configuration)

---

## Deployment Topology

### Production Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  INTERNET                                       │
└───────────────────────────────────────┬─────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CDN (Cloudflare/Vercel)                            │
│  • Static asset caching  • DDoS protection  • Edge caching  • SSL termination   │
└───────────────────────────────────────┬─────────────────────────────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │                                       │
                    ▼                                       ▼
┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐
│         Frontend (Vercel)           │   │     Load Balancer (nginx/ALB)       │
│                                     │   │                                     │
│  • Next.js SSR/SSG                  │   │  • API routing                      │
│  • Edge functions                   │   │  • WebSocket upgrade                │
│  • Automatic scaling                │   │  • Health checks                    │
│  • Global CDN                       │   │  • Rate limiting                    │
└─────────────────────────────────────┘   └──────────────────┬──────────────────┘
                                                             │
                              ┌──────────────────────────────┼──────────────────────────────┐
                              │                              │                              │
                              ▼                              ▼                              ▼
┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐
│      API Server (Container)         │   │    WebSocket Server (Container)     │   │      Worker (Container)             │
│                                     │   │                                     │   │                                     │
│  • Express.js + Bun                 │   │  • Socket.IO + Bun                  │   │  • BullMQ Workers                   │
│  • Horizontal scaling               │   │  • Sticky sessions                  │   │  • Auto-scaling                     │
│  • Health endpoint                  │   │  • Valkey adapter                   │   │  • Queue-based scaling              │
│  • 2-4 replicas                     │   │  • 2-4 replicas                     │   │  • 1-3 replicas                     │
└──────────────────┬──────────────────┘   └──────────────────┬──────────────────┘   └──────────────────┬──────────────────┘
                   │                                         │                                         │
                   └─────────────────────────────────────────┴─────────────────────────────────────────┘
                                                             │
                                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                              DATA LAYER (Private Subnet)                                                │
│                                                                                                                         │
│ ┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐   ┌─────────────────────────────────┐ │
│ │     PostgreSQL (Managed)            │   │        Valkey (Managed)             │   │     Object Storage              │ │
│ │                                     │   │                                     │   │                                 │ │
│ │  • Primary + Read Replicas          │   │  • Cache cluster                    │   │  • S3/Cloudinary                │ │
│ │  • Automatic backups                │   │  • Queue cluster                    │   │  • CDN distribution             │ │
│ │  • Point-in-time recovery           │   │  • High availability                │   │  • Signed URLs                  │ │
│ │  • Connection pooling               │   │  • Persistence enabled              │   │                                 │ │
│ └─────────────────────────────────────┘   └─────────────────────────────────────┘   └─────────────────────────────────┘ │
│                                                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Environment Configuration

### Environment Types

| Environment     | Purpose                | Database                         | Valkey         | Scaling         |
| --------------- | ---------------------- | -------------------------------- | -------------- | --------------- |
| **Development** | Local development      | Local PostgreSQL                 | Local Valkey   | Single instance |
| **Test**        | Automated testing      | Test database                    | Test Valkey    | Single instance |
| **Staging**     | Pre-production testing | Staging DB (copy of prod schema) | Staging Valkey | Minimal         |
| **Production**  | Live system            | Production DB with replicas      | Valkey cluster | Auto-scaled     |

### Environment Variables

```bash
# .env.example

# ============================================
# APPLICATION
# ============================================
NODE_ENV=development
APP_NAME=insightdesk
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
API_VERSION=v1
PORT=3001

# ============================================
# DATABASE
# ============================================
DATABASE_URL=postgresql://user:pass@localhost:5432/insightdesk
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
DATABASE_TIMEOUT=30000

# ============================================
# VALKEY (Redis-compatible)
# ============================================
VALKEY_URL=valkey://localhost:6379
VALKEY_CACHE_URL=valkey://localhost:6379/0
VALKEY_QUEUE_URL=valkey://localhost:6379/1
VALKEY_SESSION_URL=valkey://localhost:6379/2

# ============================================
# AUTHENTICATION
# ============================================
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_REFRESH_EXPIRES_IN=7d

# ============================================
# FILE STORAGE
# ============================================
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# OR for S3
# STORAGE_PROVIDER=s3
# AWS_ACCESS_KEY_ID=your-access-key
# AWS_SECRET_ACCESS_KEY=your-secret-key
# AWS_REGION=us-east-1
# AWS_S3_BUCKET=insightdesk-uploads

# ============================================
# EMAIL
# ============================================
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-pass
EMAIL_FROM=noreply@insightdesk.com

# ============================================
# RATE LIMITING
# ============================================
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# ============================================
# LOGGING
# ============================================
LOG_LEVEL=info
LOG_FORMAT=json

# ============================================
# CORS
# ============================================
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# ============================================
# SENTRY (Error Tracking)
# ============================================
SENTRY_DSN=https://your-sentry-dsn

# ============================================
# FEATURE FLAGS
# ============================================
FEATURE_2FA_ENABLED=true
FEATURE_OAUTH_ENABLED=false
FEATURE_ANALYTICS_ENABLED=true
```

### Configuration Validation

```typescript
// src/core/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
  PORT: z.coerce.number().default(3001),
  
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),
  
  VALKEY_URL: z.string(),
  
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  // ... other validations
});

export const env = envSchema.parse(process.env);
```

---

## Cloud Services

### Recommended Providers

| Service              | Development        | Production                 |
| -------------------- | ------------------ | -------------------------- |
| **Frontend Hosting** | Local              | Vercel                     |
| **Backend Hosting**  | Local Docker       | Railway / Fly.io / AWS ECS |
| **Database**         | Local PostgreSQL   | Neon / Supabase / AWS RDS  |
| **Valkey/Cache**     | Local Valkey       | Upstash / AWS ElastiCache  |
| **File Storage**     | Local / Cloudinary | Cloudinary / AWS S3        |
| **Email**            | Mailtrap           | SendGrid / AWS SES         |
| **Monitoring**       | Local logs         | Grafana Cloud / Datadog    |
| **Error Tracking**   | Console            | Sentry                     |

### Provider-Specific Configuration

#### Vercel (Frontend)

```json
// vercel.json
{
  "framework": "nextjs",
  "regions": ["iad1", "sfo1"],
  "env": {
    "NEXT_PUBLIC_API_URL": "@api_url"
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    }
  ]
}
```

#### Railway (Backend)

```toml
# railway.toml
[build]
builder = "dockerfile"
dockerfilePath = "./Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 3

[[services]]
name = "api"
port = 3001

[[services]]
name = "worker"
command = "bun run worker"
```

#### Fly.io (Alternative)

```toml
# fly.toml
app = "insightdesk-api"
primary_region = "iad"

[build]
dockerfile = "Dockerfile"

[env]
NODE_ENV = "production"

[http_service]
internal_port = 3001
force_https = true
auto_stop_machines = true
auto_start_machines = true
min_machines_running = 1

[[services]]
protocol = "tcp"
internal_port = 3001

[[services.ports]]
port = 443
handlers = ["tls", "http"]

[checks]
[checks.health]
port = 3001
type = "http"
interval = "15s"
timeout = "2s"
path = "/health"
```

---

## Networking

### Network Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VPC / Virtual Network                    │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    Public Subnet                        │   │
│   │                                                         │   │
│   │        ┌──────────────┐     ┌──────────────┐            │   │
│   │        │ Load Balancer│     │  NAT Gateway │            │   │
│   │        └──────────────┘     └──────────────┘            │   │
│   │                                                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   Private Subnet                        │   │
│   │                                                         │   │
│   │      ┌───────────┐  ┌───────────┐  ┌───────────┐        │   │
│   │      │ API Server│  │ WS Server │  │  Worker   │        │   │
│   │      └───────────┘  └───────────┘  └───────────┘        │   │
│   │                                                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   Database Subnet                       │   │
│   │                                                         │   │
│   │            ┌───────────┐  ┌───────────┐                 │   │
│   │            │ PostgreSQL│  │   Valkey  │                 │   │
│   │            └───────────┘  └───────────┘                 │   │
│   │                                                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Security Groups / Firewall Rules

| Source        | Destination   | Port | Protocol | Purpose            |
| ------------- | ------------- | ---- | -------- | ------------------ |
| Internet      | Load Balancer | 443  | HTTPS    | API traffic        |
| Load Balancer | API Servers   | 3001 | HTTP     | Internal routing   |
| Load Balancer | WS Servers    | 3002 | HTTP/WS  | WebSocket traffic  |
| API Servers   | PostgreSQL    | 5432 | TCP      | Database access    |
| API Servers   | Valkey        | 6379 | TCP      | Cache/Queue access |
| Workers       | PostgreSQL    | 5432 | TCP      | Database access    |
| Workers       | Valkey        | 6379 | TCP      | Queue access       |

---

## Secrets Management

### Secret Categories

| Category                 | Examples             | Storage                       |
| ------------------------ | -------------------- | ----------------------------- |
| **Application Secrets**  | JWT_SECRET, API keys | Environment variables / Vault |
| **Database Credentials** | DATABASE_URL         | Managed secret service        |
| **Third-party API Keys** | Cloudinary, SendGrid | Environment variables         |
| **Encryption Keys**      | Data encryption keys | Key Management Service        |

### Best Practices

1. **Never commit secrets to git**
   ```gitignore
   # .gitignore
   .env
   .env.local
   .env.*.local
   *.pem
   *.key
   ```

2. **Use secret rotation**
   - JWT secrets: Rotate every 90 days
   - API keys: Rotate on employee departure
   - Database passwords: Rotate quarterly

3. **Audit secret access**
   - Log all secret access
   - Monitor for unusual patterns
   - Alert on unauthorized access attempts

---

## SSL/TLS Configuration

### Certificate Management

```nginx
# nginx.conf
server {
    listen 443 ssl http2;
    server_name api.insightdesk.com;

    ssl_certificate /etc/letsencrypt/live/api.insightdesk.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.insightdesk.com/privkey.pem;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # WebSocket upgrade
    location /socket.io/ {
        proxy_pass http://websocket_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://api_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Docker Configuration

### API Dockerfile

```dockerfile
# backend/Dockerfile
FROM oven/bun:1.1-alpine AS base

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Build
FROM base AS build
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Production
FROM base AS production
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["bun", "run", "dist/server.js"]
```

### Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "3001:3001"
    volumes:
      - ./backend:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/insightdesk
      - VALKEY_URL=valkey://valkey:6379
    depends_on:
      postgres:
        condition: service_healthy
      valkey:
        condition: service_healthy
    command: bun run dev

  worker:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    volumes:
      - ./backend:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/insightdesk
      - VALKEY_URL=valkey://valkey:6379
    depends_on:
      - valkey
    command: bun run worker:dev

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:3001
    command: bun run dev

  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: insightdesk
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  valkey:
    image: valkey/valkey:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - valkey_data:/data
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  valkey_data:
```

---

## Related Documents

- [Architecture Overview](./overview.md)
- [Tech Stack](./tech-stack.md)
- [Scalability](./scalability.md)
- [CI/CD Pipeline](../07-devops/ci-cd.md)

---

*Next: [Scalability →](./scalability.md)*
