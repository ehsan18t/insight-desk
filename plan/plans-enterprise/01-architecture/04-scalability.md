# Scalability Strategy

> Scaling strategies, capacity planning, and performance targets for InsightDesk

---

## Table of Contents

- [Scaling Dimensions](#scaling-dimensions)
- [Component Scaling Strategies](#component-scaling-strategies)
- [Database Scaling](#database-scaling)
- [Valkey/Cache Scaling](#valkeycache-scaling)
- [WebSocket Scaling](#websocket-scaling)
- [Worker Scaling](#worker-scaling)
- [Capacity Planning](#capacity-planning)
- [Performance Targets](#performance-targets)

---

## Scaling Dimensions

### Types of Scaling

| Type | Description | When to Use |
|------|-------------|-------------|
| **Vertical** | Increase resources (CPU, RAM) | Quick wins, single points |
| **Horizontal** | Add more instances | Sustainable scaling |
| **Functional** | Separate services by function | Service isolation |

### Scaling Indicators

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|-------------------|-------------------|--------|
| CPU Usage | > 70% | > 85% | Scale horizontally |
| Memory Usage | > 75% | > 90% | Scale vertically or horizontally |
| Response Time (p95) | > 300ms | > 500ms | Optimize or scale |
| Error Rate | > 0.5% | > 1% | Investigate, possibly scale |
| Queue Depth | > 1000 jobs | > 5000 jobs | Scale workers |
| Connection Pool | > 80% utilized | > 95% utilized | Increase pool or add replicas |

---

## Component Scaling Strategies

### API Server Scaling

```
┌─────────────────────────────────────────────────────────────────┐
│                      Load Balancer                               │
│            (Round Robin / Least Connections)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  API Server 1 │     │  API Server 2 │     │  API Server N │
│               │     │               │     │               │
│  CPU: 2 cores │     │  CPU: 2 cores │     │  CPU: 2 cores │
│  RAM: 1GB     │     │  RAM: 1GB     │     │  RAM: 1GB     │
└───────────────┘     └───────────────┘     └───────────────┘
```

**Scaling Rules:**

```yaml
# Auto-scaling configuration
api_servers:
  min_instances: 2
  max_instances: 10
  target_cpu_utilization: 70%
  
  scale_up:
    cpu_threshold: 70%
    duration: 2m
    cooldown: 3m
    
  scale_down:
    cpu_threshold: 30%
    duration: 10m
    cooldown: 5m
```

**Stateless Design Requirements:**

1. No in-memory sessions (use Valkey)
2. No local file storage (use S3/Cloudinary)
3. No sticky sessions required
4. All state externalized

---

## Database Scaling

### Connection Pooling

```
┌─────────────────────────────────────────────────────────────────┐
│                      API / Worker Servers                        │
│         (Each maintains local connection pool)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PgBouncer (Connection Pooler)                 │
│                                                                  │
│   Pool Mode: Transaction                                         │
│   Max Client Connections: 1000                                   │
│   Max Server Connections: 100                                    │
│   Default Pool Size: 20                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         PostgreSQL                               │
│                   max_connections = 150                          │
└─────────────────────────────────────────────────────────────────┘
```

### Prisma Connection Configuration

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Connection URL with pooling parameters
// DATABASE_URL="postgresql://user:pass@host:6543/db?pgbouncer=true&connection_limit=10"
```

```typescript
// src/core/database/prisma.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

// Connection pool sizing formula:
// pool_size = (core_count * 2) + effective_spindle_count
// For SSD with 4 cores: (4 * 2) + 1 = 9 connections per server
```

### Read Replicas

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Servers                               │
└─────────────────────────────────────────────────────────────────┘
              │                                │
              │ Writes                         │ Reads
              ▼                                ▼
┌───────────────────────┐        ┌───────────────────────────────┐
│    Primary Database   │──WAL──>│       Read Replicas           │
│                       │        │                               │
│  • All writes         │        │  • Read-only queries          │
│  • Transactions       │        │  • Analytics queries          │
│  • Schema changes     │        │  • Reporting                  │
└───────────────────────┘        └───────────────────────────────┘
```

**Read/Write Split Configuration:**

```typescript
// src/core/database/prisma.ts
import { PrismaClient } from '@prisma/client';

// Primary for writes
const primaryPrisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_PRIMARY_URL },
  },
});

// Replica for reads
const replicaPrisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_REPLICA_URL },
  },
});

export const db = {
  write: primaryPrisma,
  read: replicaPrisma,
};

// Usage
await db.write.ticket.create({ data: ticketData });
const tickets = await db.read.ticket.findMany({ where: filters });
```

### Partitioning Strategy

For large tables (TicketMessages, ActivityLogs):

```sql
-- Partition ticket_messages by month
CREATE TABLE ticket_messages (
    id UUID DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create partitions
CREATE TABLE ticket_messages_2025_01 PARTITION OF ticket_messages
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE ticket_messages_2025_02 PARTITION OF ticket_messages
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Automated partition creation (via cron job)
```

---

## Valkey/Cache Scaling

### Cluster Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Valkey Cluster (6 nodes)                      │
│                                                                  │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│   │  Primary 1    │  │  Primary 2    │  │  Primary 3    │       │
│   │  Slots 0-5460 │  │ Slots 5461-   │  │ Slots 10923-  │       │
│   │               │  │     10922     │  │     16383     │       │
│   └───────┬───────┘  └───────┬───────┘  └───────┬───────┘       │
│           │                  │                  │                │
│   ┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐       │
│   │  Replica 1    │  │  Replica 2    │  │  Replica 3    │       │
│   └───────────────┘  └───────────────┘  └───────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Separate Instances by Purpose

```typescript
// src/core/cache/valkey.ts
import { createClient, createCluster } from 'valkey';

// Cache cluster (can be volatile)
export const cacheClient = createClient({
  url: process.env.VALKEY_CACHE_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
  },
});

// Queue cluster (must persist)
export const queueClient = createClient({
  url: process.env.VALKEY_QUEUE_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
  },
});

// Session cluster
export const sessionClient = createClient({
  url: process.env.VALKEY_SESSION_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
  },
});
```

### Memory Management

```
# valkey.conf
maxmemory 2gb
maxmemory-policy allkeys-lru

# For cache instance
maxmemory-policy volatile-lru

# For queue instance (no eviction)
maxmemory-policy noeviction
```

### Key Naming Convention

```typescript
// Key patterns for efficient management
const keyPatterns = {
  // Session keys (24h TTL)
  session: (userId: string) => `session:${userId}`,
  
  // Cache keys (variable TTL)
  ticketList: (filters: string) => `cache:tickets:list:${filters}`,
  ticketDetail: (id: string) => `cache:tickets:${id}`,
  kbArticle: (slug: string) => `cache:kb:article:${slug}`,
  
  // Rate limiting (1m TTL)
  rateLimit: (identifier: string) => `ratelimit:${identifier}`,
  
  // Locks (short TTL)
  lock: (resource: string) => `lock:${resource}`,
};
```

---

## WebSocket Scaling

### Horizontal Scaling with Valkey Adapter

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Load Balancer (Sticky Sessions)                     │
│                      IP Hash / Cookie                            │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ WS Server 1   │     │ WS Server 2   │     │ WS Server N   │
│               │     │               │     │               │
│ Local rooms   │     │ Local rooms   │     │ Local rooms   │
└───────┬───────┘     └───────┬───────┘     └───────┬───────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Valkey Pub/Sub                                │
│                                                                  │
│  Channels: socket.io#/#, socket.io#/ticket_123#                 │
└─────────────────────────────────────────────────────────────────┘
```

### Socket.IO Adapter Configuration

```typescript
// src/sockets/index.ts
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/valkey-adapter';
import { createClient } from 'valkey';

export async function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(','),
      credentials: true,
    },
    // Connection settings for scaling
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
  });

  // Valkey adapter for horizontal scaling
  const pubClient = createClient({ url: process.env.VALKEY_URL });
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);

  io.adapter(createAdapter(pubClient, subClient, {
    key: 'socket.io',
    publishOnSpecificResponseChannel: true,
  }));

  return io;
}
```

### Connection Limits

```typescript
// Per-server connection management
const MAX_CONNECTIONS_PER_SERVER = 10000;
let connectionCount = 0;

io.use((socket, next) => {
  if (connectionCount >= MAX_CONNECTIONS_PER_SERVER) {
    return next(new Error('Server at capacity'));
  }
  connectionCount++;
  socket.on('disconnect', () => connectionCount--);
  next();
});
```

---

## Worker Scaling

### Queue-Based Auto-Scaling

```
┌─────────────────────────────────────────────────────────────────┐
│                      BullMQ Queues                               │
│                                                                  │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│   │   sla-checks    │  │  notifications  │  │    analytics    │ │
│   │   Waiting: 50   │  │   Waiting: 200  │  │   Waiting: 1000 │ │
│   │   Priority: 1   │  │   Priority: 2   │  │   Priority: 3   │ │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Worker Pool                                 │
│                                                                  │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│   │ SLA Worker (x2) │  │ Notify Worker(3)│  │ Analytics (x1)  │ │
│   │ concurrency: 10 │  │ concurrency: 20 │  │ concurrency: 5  │ │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Worker Configuration

```typescript
// src/workers/index.ts
import { Worker, QueueEvents } from 'bullmq';

const connection = {
  host: process.env.VALKEY_HOST,
  port: parseInt(process.env.VALKEY_PORT || '6379'),
};

// High priority SLA worker
const slaWorker = new Worker('sla-checks', slaProcessor, {
  connection,
  concurrency: 10,
  limiter: {
    max: 100,
    duration: 1000,
  },
  settings: {
    backoffStrategy: (attemptsMade) => {
      return Math.min(1000 * Math.pow(2, attemptsMade), 30000);
    },
  },
});

// Notification worker with higher concurrency
const notificationWorker = new Worker('notifications', notificationProcessor, {
  connection,
  concurrency: 20,
  limiter: {
    max: 50,
    duration: 1000,
  },
});

// Low priority analytics worker
const analyticsWorker = new Worker('analytics', analyticsProcessor, {
  connection,
  concurrency: 5,
});
```

### Scaling Rules

```yaml
workers:
  sla-checks:
    base_replicas: 2
    max_replicas: 5
    scale_on_waiting: 100  # Scale up when > 100 waiting jobs
    
  notifications:
    base_replicas: 2
    max_replicas: 8
    scale_on_waiting: 500
    
  analytics:
    base_replicas: 1
    max_replicas: 3
    scale_on_waiting: 2000
```

---

## Capacity Planning

### Traffic Estimation

| Metric | Small | Medium | Large | Enterprise |
|--------|-------|--------|-------|------------|
| Monthly Active Users | 1K | 10K | 100K | 1M+ |
| Daily Tickets | 100 | 1K | 10K | 100K+ |
| Concurrent WS Connections | 100 | 1K | 10K | 100K+ |
| API Requests/min | 500 | 5K | 50K | 500K+ |

### Resource Requirements

| Scale | API Servers | WS Servers | Workers | PostgreSQL | Valkey |
|-------|-------------|------------|---------|------------|--------|
| Small | 1 x 1CPU/1GB | 1 x 1CPU/1GB | 1 x 1CPU/1GB | 2CPU/4GB | 1CPU/1GB |
| Medium | 2 x 2CPU/2GB | 2 x 2CPU/2GB | 2 x 2CPU/2GB | 4CPU/8GB | 2CPU/4GB |
| Large | 4 x 4CPU/4GB | 4 x 4CPU/4GB | 4 x 2CPU/2GB | 8CPU/16GB | 4CPU/8GB |
| Enterprise | 10+ x 4CPU/4GB | 10+ x 4CPU/4GB | 10+ x 2CPU/2GB | 16CPU/32GB+ replicas | Cluster |

### Cost Estimation (Monthly)

| Scale | Compute | Database | Cache | Storage | Total |
|-------|---------|----------|-------|---------|-------|
| Small | $50 | $25 | $10 | $10 | ~$100 |
| Medium | $200 | $100 | $50 | $25 | ~$400 |
| Large | $800 | $400 | $200 | $100 | ~$1,500 |
| Enterprise | $3,000+ | $1,500+ | $500+ | $500+ | ~$6,000+ |

---

## Performance Targets

### Service Level Objectives (SLOs)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Availability** | 99.9% | Uptime monitoring |
| **API Response Time (p50)** | < 100ms | APM percentiles |
| **API Response Time (p95)** | < 300ms | APM percentiles |
| **API Response Time (p99)** | < 500ms | APM percentiles |
| **WebSocket Message Latency** | < 100ms | Custom metrics |
| **Error Rate** | < 0.1% | Error tracking |
| **Queue Processing Time (p95)** | < 5s | BullMQ metrics |

### Performance Budgets

```typescript
// Performance budget configuration
export const performanceBudgets = {
  api: {
    listTickets: { p95: 200, p99: 500 },
    getTicket: { p95: 100, p99: 200 },
    createTicket: { p95: 300, p99: 500 },
    searchKB: { p95: 150, p99: 300 },
  },
  websocket: {
    messageDelivery: { p95: 50, p99: 100 },
    roomJoin: { p95: 100, p99: 200 },
  },
  worker: {
    slaCheck: { p95: 1000, p99: 3000 },
    notification: { p95: 2000, p99: 5000 },
  },
};
```

---

## Load Testing Targets

### k6 Test Scenarios

```javascript
// k6/scenarios/api-load.js
export const options = {
  scenarios: {
    // Ramp up to peak load
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '1m',
    },
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 100 },
        { duration: '10m', target: 100 },
        { duration: '5m', target: 0 },
      ],
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 400 },
        { duration: '5m', target: 400 },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};
```

---

## Related Documents

- [Architecture Overview](./overview.md)
- [Infrastructure](./infrastructure.md)
- [Performance Optimization](../09-performance/overview.md)
- [Monitoring](../07-devops/monitoring.md)

---

*Next: [Database Design →](../02-database/erd.md)*
