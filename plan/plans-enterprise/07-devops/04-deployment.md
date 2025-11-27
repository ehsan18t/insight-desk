# Deployment Guide

> Step-by-step production deployment instructions for InsightDesk.

## Table of Contents

1. [Deployment Options](#deployment-options)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [VPS/VM Deployment](#vpsvm-deployment)
4. [Docker Swarm Deployment](#docker-swarm-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Database Migration Strategy](#database-migration-strategy)
7. [Rollback Procedures](#rollback-procedures)
8. [Post-Deployment Verification](#post-deployment-verification)

---

## Deployment Options

### Option Comparison

| Option | Complexity | Scalability | Cost | Best For |
|--------|------------|-------------|------|----------|
| Single VPS | Low | Limited | Low | MVP, Small teams |
| Docker Compose | Low | Medium | Low | Small-Medium |
| Docker Swarm | Medium | High | Medium | Medium-Large |
| Kubernetes | High | Very High | High | Enterprise |
| Managed PaaS | Low | High | Medium-High | Quick launch |

### Recommended Path

```
MVP Phase → Single VPS with Docker Compose
Growth Phase → Docker Swarm or managed K8s
Scale Phase → Full Kubernetes cluster
```

---

## Pre-Deployment Checklist

### Infrastructure Requirements

```markdown
## Minimum Production Requirements

### Compute
- [ ] API Server: 2 vCPU, 4GB RAM (x2 for HA)
- [ ] Web Server: 1 vCPU, 2GB RAM (x2 for HA)
- [ ] Worker: 2 vCPU, 4GB RAM (x2 for HA)
- [ ] Load Balancer: 1 vCPU, 1GB RAM

### Database
- [ ] PostgreSQL: 4 vCPU, 8GB RAM, 100GB SSD
- [ ] Valkey: 2 vCPU, 4GB RAM

### Storage
- [ ] S3-compatible: 100GB initial
- [ ] Backup storage: 500GB

### Network
- [ ] SSL certificates
- [ ] Domain configured
- [ ] Firewall rules
- [ ] DDoS protection
```

### Security Checklist

```markdown
## Security Verification

### Secrets
- [ ] All secrets rotated from development
- [ ] JWT_SECRET is 256-bit random string
- [ ] Database passwords are strong (32+ chars)
- [ ] API keys are environment-specific

### Configuration
- [ ] NODE_ENV=production
- [ ] Debug modes disabled
- [ ] Error details hidden from clients
- [ ] CORS configured for production domains only

### Network
- [ ] Database not publicly accessible
- [ ] Internal services on private network
- [ ] SSH key authentication only
- [ ] Fail2ban installed
- [ ] UFW/firewall configured
```

### Application Checklist

```markdown
## Application Readiness

### Code
- [ ] All tests passing
- [ ] No critical/high security vulnerabilities
- [ ] Performance benchmarks acceptable
- [ ] Error tracking configured (Sentry)

### Database
- [ ] Migrations tested on staging
- [ ] Backup/restore tested
- [ ] Indexes verified

### Monitoring
- [ ] Health endpoints implemented
- [ ] Metrics collection configured
- [ ] Alerting rules defined
- [ ] Log aggregation setup
```

---

## VPS/VM Deployment

### Initial Server Setup

```bash
#!/bin/bash
# scripts/server-setup.sh

set -e

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Create app user
useradd -m -s /bin/bash -G docker insightdesk
mkdir -p /opt/insightdesk
chown insightdesk:insightdesk /opt/insightdesk

# Configure firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Install fail2ban
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Configure SSH
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

echo "Server setup complete!"
```

### Deploy Application

```bash
#!/bin/bash
# scripts/deploy.sh

set -e

APP_DIR="/opt/insightdesk"
BACKUP_DIR="/opt/backups"
TAG="${1:-latest}"

cd $APP_DIR

echo "📦 Pulling new images..."
docker-compose pull

echo "💾 Backing up database..."
docker-compose exec -T postgres pg_dump -U insightdesk insightdesk | \
  gzip > "$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S).sql.gz"

echo "🗄️ Running migrations..."
docker-compose run --rm api bunx prisma migrate deploy

echo "🚀 Deploying new version..."
docker-compose up -d --remove-orphans

echo "⏳ Waiting for services to be healthy..."
sleep 10

echo "🔍 Health check..."
if curl -f http://localhost:4000/health > /dev/null 2>&1; then
  echo "✅ API is healthy"
else
  echo "❌ API health check failed"
  exit 1
fi

if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "✅ Web is healthy"
else
  echo "❌ Web health check failed"
  exit 1
fi

echo "🧹 Cleaning up old images..."
docker image prune -f

echo "✅ Deployment complete!"
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/insightdesk
upstream api_backend {
    least_conn;
    server 127.0.0.1:4000 weight=1 max_fails=3 fail_timeout=30s;
}

upstream web_backend {
    least_conn;
    server 127.0.0.1:3000 weight=1 max_fails=3 fail_timeout=30s;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/m;

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name app.insightdesk.io api.insightdesk.io;
    return 301 https://$server_name$request_uri;
}

# Main application
server {
    listen 443 ssl http2;
    server_name app.insightdesk.io;

    ssl_certificate /etc/letsencrypt/live/insightdesk.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/insightdesk.io/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://web_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# API server
server {
    listen 443 ssl http2;
    server_name api.insightdesk.io;

    ssl_certificate /etc/letsencrypt/live/insightdesk.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/insightdesk.io/privkey.pem;

    # API rate limiting
    location /api/v1/auth/ {
        limit_req zone=auth_limit burst=5 nodelay;
        proxy_pass http://api_backend;
        include proxy_params;
    }

    location / {
        limit_req zone=api_limit burst=50 nodelay;
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

---

## Docker Swarm Deployment

### Initialize Swarm

```bash
# On manager node
docker swarm init --advertise-addr <MANAGER_IP>

# Join workers (run output command on worker nodes)
docker swarm join --token <TOKEN> <MANAGER_IP>:2377
```

### Deploy Stack

```yaml
# stack.yml
version: '3.8'

services:
  api:
    image: ghcr.io/your-org/insightdesk-api:${TAG:-latest}
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
        failure_action: rollback
      rollback_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    environment:
      NODE_ENV: production
    secrets:
      - database_url
      - jwt_secret
    networks:
      - backend
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  web:
    image: ghcr.io/your-org/insightdesk-web:${TAG:-latest}
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
    networks:
      - frontend
      - backend

  worker:
    image: ghcr.io/your-org/insightdesk-worker:${TAG:-latest}
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure
    secrets:
      - database_url
    networks:
      - backend

  traefik:
    image: traefik:v3.0
    command:
      - "--api.dashboard=true"
      - "--providers.docker.swarmMode=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@insightdesk.io"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik-certificates:/letsencrypt
    deploy:
      placement:
        constraints:
          - node.role == manager

secrets:
  database_url:
    external: true
  jwt_secret:
    external: true

networks:
  frontend:
    driver: overlay
  backend:
    driver: overlay
    internal: true

volumes:
  traefik-certificates:
```

### Deploy Command

```bash
# Create secrets
echo "postgresql://..." | docker secret create database_url -
echo "your-jwt-secret" | docker secret create jwt_secret -

# Deploy stack
docker stack deploy -c stack.yml insightdesk

# Check status
docker stack services insightdesk
docker stack ps insightdesk

# Update service
docker service update --image ghcr.io/your-org/insightdesk-api:v2.0.0 insightdesk_api
```

---

## Kubernetes Deployment

### Deployment Manifests

```yaml
# k8s/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: insightdesk-api
  labels:
    app: insightdesk
    component: api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: insightdesk
      component: api
  template:
    metadata:
      labels:
        app: insightdesk
        component: api
    spec:
      containers:
        - name: api
          image: ghcr.io/your-org/insightdesk-api:latest
          ports:
            - containerPort: 4000
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: insightdesk-secrets
                  key: database-url
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: insightdesk-secrets
                  key: jwt-secret
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"
          livenessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: insightdesk-api
spec:
  selector:
    app: insightdesk
    component: api
  ports:
    - port: 80
      targetPort: 4000
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: insightdesk-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: insightdesk-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

---

## Database Migration Strategy

### Zero-Downtime Migration Pattern

```typescript
// Migration safety rules
const migrationRules = {
  // SAFE operations (no locks)
  safe: [
    'CREATE TABLE',
    'CREATE INDEX CONCURRENTLY',
    'ADD COLUMN (nullable, no default)',
    'DROP COLUMN (after removing code references)',
  ],
  
  // UNSAFE operations (require planning)
  unsafe: [
    'ALTER COLUMN TYPE',
    'ADD COLUMN NOT NULL with DEFAULT',
    'DROP TABLE',
    'CREATE INDEX (non-concurrent)',
  ],
};
```

### Migration Script

```bash
#!/bin/bash
# scripts/migrate.sh

set -e

echo "🔍 Checking pending migrations..."
PENDING=$(bunx prisma migrate status 2>&1 | grep -c "not yet applied" || true)

if [ "$PENDING" -eq 0 ]; then
  echo "✅ No pending migrations"
  exit 0
fi

echo "📋 Pending migrations: $PENDING"

# Create backup before migration
echo "💾 Creating pre-migration backup..."
pg_dump $DATABASE_URL | gzip > "/backups/pre-migration-$(date +%Y%m%d-%H%M%S).sql.gz"

# Run migrations
echo "🗄️ Applying migrations..."
bunx prisma migrate deploy

echo "✅ Migrations complete!"
```

---

## Rollback Procedures

### Quick Rollback Script

```bash
#!/bin/bash
# scripts/rollback.sh

set -e

PREVIOUS_TAG="${1:-}"

if [ -z "$PREVIOUS_TAG" ]; then
  echo "Usage: ./rollback.sh <previous-tag>"
  exit 1
fi

echo "⏪ Rolling back to $PREVIOUS_TAG..."

# Update images
docker-compose pull
docker-compose up -d

# If using Swarm
# docker service update --image ghcr.io/your-org/insightdesk-api:$PREVIOUS_TAG insightdesk_api

echo "✅ Rollback complete"
```

### Database Rollback

```bash
#!/bin/bash
# scripts/db-rollback.sh

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Available backups:"
  ls -la /backups/*.sql.gz
  exit 1
fi

echo "⚠️ WARNING: This will restore the database from backup"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Cancelled"
  exit 0
fi

echo "🔄 Restoring database..."
gunzip -c "$BACKUP_FILE" | psql $DATABASE_URL

echo "✅ Database restored"
```

---

## Post-Deployment Verification

### Health Check Script

```bash
#!/bin/bash
# scripts/verify-deployment.sh

echo "🔍 Verifying deployment..."

# API Health
echo -n "API Health: "
if curl -sf http://localhost:4000/health > /dev/null; then
  echo "✅ OK"
else
  echo "❌ FAILED"
  exit 1
fi

# Web Health
echo -n "Web Health: "
if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo "✅ OK"
else
  echo "❌ FAILED"
  exit 1
fi

# Database Connection
echo -n "Database: "
if docker-compose exec -T api bunx prisma db execute --stdin <<< "SELECT 1" > /dev/null 2>&1; then
  echo "✅ OK"
else
  echo "❌ FAILED"
  exit 1
fi

# Valkey Connection
echo -n "Valkey: "
if docker-compose exec -T valkey valkey-cli ping > /dev/null 2>&1; then
  echo "✅ OK"
else
  echo "❌ FAILED"
  exit 1
fi

echo ""
echo "✅ All checks passed!"
```

### Smoke Tests

```typescript
// scripts/smoke-test.ts
const API_URL = process.env.API_URL || 'http://localhost:4000';

const tests = [
  { name: 'Health endpoint', url: '/health', expected: 200 },
  { name: 'API version', url: '/api/v1', expected: 200 },
  { name: 'Login page', url: '/login', expected: 200 },
];

async function runSmokeTests() {
  console.log('🧪 Running smoke tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const res = await fetch(`${API_URL}${test.url}`);
      if (res.status === test.expected) {
        console.log(`✅ ${test.name}`);
        passed++;
      } else {
        console.log(`❌ ${test.name} (expected ${test.expected}, got ${res.status})`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} (${error.message})`);
      failed++;
    }
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runSmokeTests();
```
