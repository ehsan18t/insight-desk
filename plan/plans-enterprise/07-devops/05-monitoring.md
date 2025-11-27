# Monitoring & Observability

> Comprehensive monitoring, logging, metrics, and alerting for InsightDesk.

## Table of Contents

1. [Observability Stack](#observability-stack)
2. [Logging](#logging)
3. [Metrics](#metrics)
4. [Alerting](#alerting)
5. [Health Checks](#health-checks)
6. [Error Tracking](#error-tracking)
7. [Dashboards](#dashboards)
8. [On-Call & Incident Response](#on-call--incident-response)

---

## Observability Stack

### Recommended Stack

```
┌────────────────────────────────────────────────────────────────┐
│                        Grafana                                  │
│                   (Visualization & Dashboards)                 │
└────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Prometheus  │     │     Loki     │     │   Tempo      │
│   (Metrics)  │     │    (Logs)    │     │  (Traces)    │
└──────────────┘     └──────────────┘     └──────────────┘
        ▲                     ▲                     ▲
        │                     │                     │
┌───────┴─────────────────────┴─────────────────────┴───────┐
│                     Application                            │
│              (API, Web, Worker services)                   │
└────────────────────────────────────────────────────────────┘
```

### Docker Compose Monitoring Stack

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: insightdesk-prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
    volumes:
      - ./monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/prometheus/rules:/etc/prometheus/rules
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: insightdesk-grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
      GF_USERS_ALLOW_SIGN_UP: false
    volumes:
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
      - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards
      - grafana_data:/var/lib/grafana
    ports:
      - "3001:3000"
    depends_on:
      - prometheus
      - loki
    restart: unless-stopped

  loki:
    image: grafana/loki:latest
    container_name: insightdesk-loki
    command: -config.file=/etc/loki/loki-config.yml
    volumes:
      - ./monitoring/loki/loki-config.yml:/etc/loki/loki-config.yml
      - loki_data:/loki
    ports:
      - "3100:3100"
    restart: unless-stopped

  promtail:
    image: grafana/promtail:latest
    container_name: insightdesk-promtail
    volumes:
      - ./monitoring/promtail/promtail-config.yml:/etc/promtail/promtail-config.yml
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    command: -config.file=/etc/promtail/promtail-config.yml
    restart: unless-stopped

  alertmanager:
    image: prom/alertmanager:latest
    container_name: insightdesk-alertmanager
    volumes:
      - ./monitoring/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml
    ports:
      - "9093:9093"
    restart: unless-stopped

  uptime-kuma:
    image: louislam/uptime-kuma:latest
    container_name: insightdesk-uptime
    volumes:
      - uptime_data:/app/data
    ports:
      - "3002:3001"
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
  loki_data:
  uptime_data:
```

---

## Logging

### Structured Logging Setup

```typescript
// lib/logger.ts
import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
      service: process.env.SERVICE_NAME || 'insightdesk',
    }),
  },
  
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Production: JSON for parsing
  // Development: Pretty print
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      },
  
  // Redact sensitive data
  redact: {
    paths: [
      'password',
      'token',
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});

// Create child loggers for different contexts
export const createLogger = (context: string) => logger.child({ context });

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: Function) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  
  // Attach request ID
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  // Log request
  logger.info({
    type: 'request',
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      type: 'response',
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    });
  });
  
  next();
};
```

### Log Levels and Usage

```typescript
// Usage examples
const log = createLogger('tickets');

// Error - Application errors, exceptions
log.error({ err, ticketId }, 'Failed to create ticket');

// Warn - Recoverable issues, deprecations
log.warn({ userId, attempts }, 'Multiple failed login attempts');

// Info - Business events, state changes
log.info({ ticketId, status }, 'Ticket status updated');

// Debug - Development info, detailed flow
log.debug({ query, params }, 'Executing database query');

// Trace - Very detailed debugging
log.trace({ payload }, 'WebSocket message received');
```

### Loki Configuration

```yaml
# monitoring/loki/loki-config.yml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 720h  # 30 days
  ingestion_rate_mb: 10
  ingestion_burst_size_mb: 20

compactor:
  working_directory: /loki/compactor
  shared_store: filesystem
  retention_enabled: true
```

### Promtail Configuration

```yaml
# monitoring/promtail/promtail-config.yml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'service'
    pipeline_stages:
      - json:
          expressions:
            level: level
            message: msg
            timestamp: time
      - labels:
          level:
      - timestamp:
          source: timestamp
          format: RFC3339
```

---

## Metrics

### Application Metrics

```typescript
// lib/metrics.ts
import client from 'prom-client';

// Enable default metrics
client.collectDefaultMetrics({
  prefix: 'insightdesk_',
  labels: { service: process.env.SERVICE_NAME || 'api' },
});

// Custom metrics
export const metrics = {
  // HTTP request metrics
  httpRequestDuration: new client.Histogram({
    name: 'insightdesk_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  }),
  
  httpRequestTotal: new client.Counter({
    name: 'insightdesk_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
  }),
  
  // Business metrics
  ticketsCreated: new client.Counter({
    name: 'insightdesk_tickets_created_total',
    help: 'Total tickets created',
    labelNames: ['priority', 'channel'],
  }),
  
  ticketResolutionTime: new client.Histogram({
    name: 'insightdesk_ticket_resolution_seconds',
    help: 'Time to resolve tickets in seconds',
    labelNames: ['priority'],
    buckets: [60, 300, 900, 3600, 14400, 86400], // 1m, 5m, 15m, 1h, 4h, 24h
  }),
  
  activeTickets: new client.Gauge({
    name: 'insightdesk_active_tickets',
    help: 'Number of active tickets',
    labelNames: ['status', 'priority'],
  }),
  
  // Queue metrics
  jobQueueSize: new client.Gauge({
    name: 'insightdesk_job_queue_size',
    help: 'Number of jobs in queue',
    labelNames: ['queue', 'status'],
  }),
  
  jobProcessingDuration: new client.Histogram({
    name: 'insightdesk_job_processing_seconds',
    help: 'Job processing duration',
    labelNames: ['queue', 'job_type'],
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
  }),
  
  // WebSocket metrics
  activeConnections: new client.Gauge({
    name: 'insightdesk_websocket_connections',
    help: 'Active WebSocket connections',
  }),
  
  // Database metrics
  dbPoolSize: new client.Gauge({
    name: 'insightdesk_db_pool_size',
    help: 'Database connection pool size',
    labelNames: ['state'],
  }),
  
  dbQueryDuration: new client.Histogram({
    name: 'insightdesk_db_query_duration_seconds',
    help: 'Database query duration',
    labelNames: ['operation'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  }),
};

// Metrics endpoint
export const metricsHandler = async (req: Request, res: Response) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
};
```

### Prometheus Configuration

```yaml
# monitoring/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

rule_files:
  - /etc/prometheus/rules/*.yml

scrape_configs:
  # Prometheus self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # API servers
  - job_name: 'insightdesk-api'
    static_configs:
      - targets: ['api:4000']
    metrics_path: /metrics
    scheme: http

  # Web servers  
  - job_name: 'insightdesk-web'
    static_configs:
      - targets: ['web:3000']
    metrics_path: /api/metrics

  # Workers
  - job_name: 'insightdesk-worker'
    static_configs:
      - targets: ['worker:9100']

  # PostgreSQL
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  # Valkey
  - job_name: 'valkey'
    static_configs:
      - targets: ['valkey-exporter:9121']

  # Node exporters
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
```

---

## Alerting

### Alert Rules

```yaml
# monitoring/prometheus/rules/alerts.yml
groups:
  - name: insightdesk-availability
    interval: 30s
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
          description: "{{ $labels.instance }} has been down for more than 1 minute"

      - alert: HighErrorRate
        expr: |
          sum(rate(insightdesk_http_requests_total{status=~"5.."}[5m])) 
          / sum(rate(insightdesk_http_requests_total[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, 
            rate(insightdesk_http_request_duration_seconds_bucket[5m])
          ) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High API latency"
          description: "95th percentile latency is {{ $value | humanizeDuration }}"

  - name: insightdesk-resources
    rules:
      - alert: HighMemoryUsage
        expr: |
          (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) 
          / node_memory_MemTotal_bytes > 0.90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is {{ $value | humanizePercentage }}"

      - alert: HighCPUUsage
        expr: |
          100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.instance }}"

      - alert: DiskSpaceLow
        expr: |
          (node_filesystem_avail_bytes{mountpoint="/"} 
          / node_filesystem_size_bytes{mountpoint="/"}) < 0.15
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Low disk space on {{ $labels.instance }}"
          description: "Only {{ $value | humanizePercentage }} disk space remaining"

  - name: insightdesk-database
    rules:
      - alert: DatabaseConnectionPoolExhausted
        expr: insightdesk_db_pool_size{state="waiting"} > 10
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Database connection pool exhausted"

      - alert: SlowDatabaseQueries
        expr: |
          histogram_quantile(0.95, 
            rate(insightdesk_db_query_duration_seconds_bucket[5m])
          ) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow database queries detected"

  - name: insightdesk-business
    rules:
      - alert: HighTicketBacklog
        expr: insightdesk_active_tickets{status="open"} > 100
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "High ticket backlog"
          description: "{{ $value }} tickets are waiting"

      - alert: JobQueueBacklog
        expr: insightdesk_job_queue_size{status="waiting"} > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Job queue backlog on {{ $labels.queue }}"
```

### Alertmanager Configuration

```yaml
# monitoring/alertmanager/alertmanager.yml
global:
  smtp_smarthost: 'smtp.example.com:587'
  smtp_from: 'alerts@insightdesk.io'
  smtp_auth_username: 'alerts@insightdesk.io'
  smtp_auth_password: '${SMTP_PASSWORD}'
  slack_api_url: '${SLACK_WEBHOOK_URL}'

route:
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'default'
  
  routes:
    - match:
        severity: critical
      receiver: 'critical'
      continue: true
    
    - match:
        severity: warning
      receiver: 'warning'

receivers:
  - name: 'default'
    email_configs:
      - to: 'ops@insightdesk.io'

  - name: 'critical'
    slack_configs:
      - channel: '#alerts-critical'
        send_resolved: true
        title: '{{ template "slack.title" . }}'
        text: '{{ template "slack.text" . }}'
    pagerduty_configs:
      - service_key: '${PAGERDUTY_KEY}'
    email_configs:
      - to: 'oncall@insightdesk.io'

  - name: 'warning'
    slack_configs:
      - channel: '#alerts'
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'instance']
```

---

## Health Checks

### Health Endpoint Implementation

```typescript
// routes/health.ts
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { valkey } from '../lib/valkey';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail';
      latency?: number;
      message?: string;
    };
  };
}

// Basic liveness probe (is the process running?)
router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness probe (can the service handle requests?)
router.get('/health/ready', async (req, res) => {
  try {
    // Quick DB check
    await prisma.$queryRaw`SELECT 1`;
    // Quick cache check
    await valkey.ping();
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});

// Detailed health check
router.get('/health', async (req, res) => {
  const startTime = Date.now();
  const checks: HealthStatus['checks'] = {};
  
  // Database check
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = {
      status: 'pass',
      latency: Date.now() - dbStart,
    };
  } catch (error) {
    checks.database = {
      status: 'fail',
      message: error.message,
    };
  }
  
  // Cache check
  try {
    const cacheStart = Date.now();
    await valkey.ping();
    checks.cache = {
      status: 'pass',
      latency: Date.now() - cacheStart,
    };
  } catch (error) {
    checks.cache = {
      status: 'fail',
      message: error.message,
    };
  }
  
  // Determine overall status
  const failedChecks = Object.values(checks).filter(c => c.status === 'fail');
  let status: HealthStatus['status'] = 'healthy';
  
  if (failedChecks.length > 0) {
    status = failedChecks.some(c => 
      ['database'].includes(c.message || '')
    ) ? 'unhealthy' : 'degraded';
  }
  
  const response: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '0.0.0',
    uptime: process.uptime(),
    checks,
  };
  
  const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(response);
});

export default router;
```

---

## Error Tracking

### Sentry Integration

```typescript
// lib/sentry.ts
import * as Sentry from '@sentry/node';

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn('Sentry DSN not configured');
    return;
  }
  
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.APP_VERSION,
    
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Session tracking
    autoSessionTracking: true,
    
    // Filter sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
    
    // Ignore known errors
    ignoreErrors: [
      'AbortError',
      'NetworkError',
      'Request aborted',
    ],
    
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express(),
      new Sentry.Integrations.Prisma(),
    ],
  });
}

// Usage in Express
export function setupSentryMiddleware(app: Express) {
  // Request handler creates a separate transaction for each request
  app.use(Sentry.Handlers.requestHandler());
  
  // TracingHandler creates spans for incoming requests
  app.use(Sentry.Handlers.tracingHandler());
  
  // Error handler must be before other error handlers
  app.use(Sentry.Handlers.errorHandler());
}

// Manual error capture
export function captureError(error: Error, context?: Record<string, any>) {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}
```

---

## Dashboards

### Key Dashboards

1. **Overview Dashboard**
   - Request rate and error rate
   - Response time percentiles
   - Active users
   - System resources

2. **API Performance Dashboard**
   - Endpoint latency heatmap
   - Slowest endpoints
   - Error breakdown by endpoint
   - Request volume by endpoint

3. **Business Metrics Dashboard**
   - Tickets created/resolved
   - Average resolution time
   - SLA compliance
   - Agent performance

4. **Infrastructure Dashboard**
   - CPU/Memory/Disk usage
   - Database connections
   - Cache hit rate
   - Queue depths

### Grafana Dashboard JSON (Example)

```json
{
  "dashboard": {
    "title": "InsightDesk Overview",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(insightdesk_http_requests_total[5m]))",
            "legendFormat": "Requests/s"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "gauge",
        "targets": [
          {
            "expr": "sum(rate(insightdesk_http_requests_total{status=~\"5..\"}[5m])) / sum(rate(insightdesk_http_requests_total[5m])) * 100"
          }
        ]
      },
      {
        "title": "Response Time (p95)",
        "type": "stat",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(insightdesk_http_request_duration_seconds_bucket[5m])) by (le))"
          }
        ]
      }
    ]
  }
}
```

---

## On-Call & Incident Response

### Incident Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| SEV1 | Complete outage | 15 minutes | Site down, data loss |
| SEV2 | Major degradation | 30 minutes | Core feature broken |
| SEV3 | Minor issue | 4 hours | Non-critical feature broken |
| SEV4 | Low priority | Next business day | Minor bug, cosmetic |

### Incident Response Playbook

```markdown
## Incident Response Steps

### 1. Acknowledge (5 min)
- [ ] Acknowledge alert in PagerDuty/Slack
- [ ] Join incident channel
- [ ] Assess severity level

### 2. Investigate (15 min)
- [ ] Check monitoring dashboards
- [ ] Review recent deployments
- [ ] Check error logs
- [ ] Identify affected services

### 3. Mitigate
- [ ] Implement quick fix (rollback if needed)
- [ ] Update status page
- [ ] Communicate with stakeholders

### 4. Resolve
- [ ] Verify fix in production
- [ ] Monitor for recurrence
- [ ] Update status page to resolved

### 5. Post-Incident (within 48h)
- [ ] Write incident report
- [ ] Conduct blameless post-mortem
- [ ] Create follow-up tickets
- [ ] Update runbooks if needed
```

### Runbook Template

```markdown
# Runbook: High Error Rate

## Symptoms
- Alert: HighErrorRate
- Error rate > 5% for 5+ minutes

## Investigation Steps
1. Check which endpoints are failing:
   ```promql
   topk(10, sum(rate(insightdesk_http_requests_total{status=~"5.."}[5m])) by (route))
   ```

2. Review error logs:
   ```bash
   # Loki query
   {app="insightdesk-api"} |= "error" | json
   ```

3. Check recent deployments:
   ```bash
   git log --oneline -10
   ```

## Resolution Steps
1. If caused by recent deploy → Rollback
2. If database related → Check connection pool
3. If external service → Check circuit breakers

## Escalation
- If unresolved in 15 min → Page backend lead
- If unresolved in 30 min → Page engineering manager
```
