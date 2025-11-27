# Database Performance

> PostgreSQL optimization strategies for InsightDesk scalability.

## Table of Contents

1. [Query Optimization](#query-optimization)
2. [Indexing Strategies](#indexing-strategies)
3. [Connection Pooling](#connection-pooling)
4. [Query Analysis](#query-analysis)
5. [Materialized Views](#materialized-views)
6. [Partitioning](#partitioning)
7. [Vacuum & Maintenance](#vacuum--maintenance)
8. [Monitoring](#monitoring)

---

## Query Optimization

### Prisma Query Best Practices

```typescript
// ✅ Select only needed fields
const tickets = await prisma.ticket.findMany({
  select: {
    id: true,
    title: true,
    status: true,
    createdAt: true,
    assignee: {
      select: {
        id: true,
        name: true,
      },
    },
  },
  where: { status: 'OPEN' },
  take: 20,
});

// ❌ Avoid selecting all fields
const tickets = await prisma.ticket.findMany({
  include: {
    assignee: true,
    createdBy: true,
    organization: true,
    comments: true,
    attachments: true,
  },
});
```

### Pagination Strategies

```typescript
// Offset pagination (simple, but slow for large offsets)
async function getTicketsWithOffset(
  page: number, 
  limit: number
): Promise<PaginatedResult<Ticket>> {
  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.ticket.count(),
  ]);

  return {
    data: tickets,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// Cursor pagination (efficient for infinite scroll)
async function getTicketsWithCursor(
  cursor: string | undefined,
  limit: number
): Promise<CursorPaginatedResult<Ticket>> {
  const tickets = await prisma.ticket.findMany({
    take: limit + 1, // Fetch one extra to determine hasMore
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1, // Skip cursor item
    }),
    orderBy: { createdAt: 'desc' },
  });

  const hasMore = tickets.length > limit;
  if (hasMore) tickets.pop();

  return {
    data: tickets,
    nextCursor: hasMore ? tickets[tickets.length - 1]?.id : undefined,
    hasMore,
  };
}

// Keyset pagination (best for large datasets)
async function getTicketsKeyset(
  lastCreatedAt: Date | undefined,
  lastId: string | undefined,
  limit: number
): Promise<KeysetResult<Ticket>> {
  const tickets = await prisma.ticket.findMany({
    where: lastCreatedAt && lastId ? {
      OR: [
        { createdAt: { lt: lastCreatedAt } },
        {
          createdAt: lastCreatedAt,
          id: { lt: lastId },
        },
      ],
    } : undefined,
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    take: limit + 1,
  });

  const hasMore = tickets.length > limit;
  if (hasMore) tickets.pop();

  return { data: tickets, hasMore };
}
```

### N+1 Query Prevention

```typescript
// ❌ N+1 problem
const tickets = await prisma.ticket.findMany();
for (const ticket of tickets) {
  ticket.assignee = await prisma.user.findUnique({
    where: { id: ticket.assigneeId },
  });
}

// ✅ Using include
const tickets = await prisma.ticket.findMany({
  include: {
    assignee: {
      select: { id: true, name: true, email: true },
    },
  },
});

// ✅ Batch loading with findMany
const tickets = await prisma.ticket.findMany();
const assigneeIds = [...new Set(tickets.map(t => t.assigneeId).filter(Boolean))];
const assignees = await prisma.user.findMany({
  where: { id: { in: assigneeIds } },
});
const assigneeMap = new Map(assignees.map(a => [a.id, a]));

const ticketsWithAssignees = tickets.map(ticket => ({
  ...ticket,
  assignee: ticket.assigneeId ? assigneeMap.get(ticket.assigneeId) : null,
}));
```

### DataLoader Pattern

```typescript
// lib/dataloaders.ts
import DataLoader from 'dataloader';

export function createLoaders() {
  return {
    user: new DataLoader<string, User | null>(async (ids) => {
      const users = await prisma.user.findMany({
        where: { id: { in: [...ids] } },
      });
      const userMap = new Map(users.map(u => [u.id, u]));
      return ids.map(id => userMap.get(id) ?? null);
    }),

    ticketComments: new DataLoader<string, Comment[]>(async (ticketIds) => {
      const comments = await prisma.comment.findMany({
        where: { ticketId: { in: [...ticketIds] } },
        orderBy: { createdAt: 'asc' },
      });
      
      const grouped = new Map<string, Comment[]>();
      for (const comment of comments) {
        const existing = grouped.get(comment.ticketId) ?? [];
        grouped.set(comment.ticketId, [...existing, comment]);
      }
      
      return ticketIds.map(id => grouped.get(id) ?? []);
    }),
  };
}

// Usage in resolvers/services
const ticket = await prisma.ticket.findUnique({ where: { id } });
const assignee = await loaders.user.load(ticket.assigneeId);
const comments = await loaders.ticketComments.load(ticket.id);
```

---

## Indexing Strategies

### Essential Indexes

```sql
-- Primary indexes (created automatically)
-- tickets_pkey, users_pkey, etc.

-- Foreign key indexes
CREATE INDEX idx_tickets_assignee_id ON tickets(assignee_id);
CREATE INDEX idx_tickets_organization_id ON tickets(organization_id);
CREATE INDEX idx_tickets_created_by_id ON tickets(created_by_id);
CREATE INDEX idx_comments_ticket_id ON comments(ticket_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);

-- Status and date filtering (common query patterns)
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX idx_tickets_updated_at ON tickets(updated_at DESC);

-- Compound indexes for common queries
CREATE INDEX idx_tickets_org_status_created 
ON tickets(organization_id, status, created_at DESC);

CREATE INDEX idx_tickets_assignee_status 
ON tickets(assignee_id, status) WHERE assignee_id IS NOT NULL;

-- Full-text search
CREATE INDEX idx_tickets_search ON tickets 
USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));

CREATE INDEX idx_articles_search ON articles 
USING GIN (to_tsvector('english', title || ' ' || content));
```

### Prisma Schema Indexes

```prisma
// schema.prisma
model Ticket {
  id             String       @id @default(cuid())
  title          String
  description    String?
  status         TicketStatus @default(OPEN)
  priority       Priority     @default(MEDIUM)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  
  assigneeId     String?
  assignee       User?        @relation("AssignedTickets", fields: [assigneeId], references: [id])
  
  createdById    String
  createdBy      User         @relation("CreatedTickets", fields: [createdById], references: [id])

  @@index([organizationId, status, createdAt(sort: Desc)])
  @@index([assigneeId, status])
  @@index([status, priority])
  @@index([createdAt(sort: Desc)])
}

model Article {
  id          String   @id @default(cuid())
  title       String
  slug        String   @unique
  content     String
  status      ArticleStatus @default(DRAFT)
  categoryId  String?
  
  @@index([categoryId, status])
  @@index([status, updatedAt(sort: Desc)])
}
```

### Partial Indexes

```sql
-- Index only active tickets (reduces index size)
CREATE INDEX idx_active_tickets 
ON tickets(created_at DESC, priority)
WHERE status IN ('OPEN', 'IN_PROGRESS', 'PENDING');

-- Index only unassigned tickets
CREATE INDEX idx_unassigned_tickets 
ON tickets(organization_id, priority DESC, created_at DESC)
WHERE assignee_id IS NULL AND status = 'OPEN';

-- Index only published articles
CREATE INDEX idx_published_articles 
ON articles(category_id, updated_at DESC)
WHERE status = 'PUBLISHED';
```

---

## Connection Pooling

### Prisma Configuration

```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Connection URL with pool settings
// DATABASE_URL="postgresql://user:password@localhost:5432/insightdesk?connection_limit=20&pool_timeout=20"
```

### PgBouncer Configuration

```ini
# /etc/pgbouncer/pgbouncer.ini
[databases]
insightdesk = host=localhost port=5432 dbname=insightdesk

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432

# Connection pooling mode
pool_mode = transaction

# Pool size settings
default_pool_size = 25
max_client_conn = 200
min_pool_size = 5

# Timeouts
server_idle_timeout = 600
query_timeout = 30

# Authentication
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

# Logging
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1
```

### Docker Compose with PgBouncer

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: insightdesk
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

  pgbouncer:
    image: bitnami/pgbouncer:latest
    environment:
      POSTGRESQL_HOST: postgres
      POSTGRESQL_PORT: 5432
      POSTGRESQL_USERNAME: postgres
      POSTGRESQL_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRESQL_DATABASE: insightdesk
      PGBOUNCER_DATABASE: insightdesk
      PGBOUNCER_POOL_MODE: transaction
      PGBOUNCER_MAX_CLIENT_CONN: 200
      PGBOUNCER_DEFAULT_POOL_SIZE: 25
    ports:
      - '6432:6432'
    depends_on:
      postgres:
        condition: service_healthy

  api:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@pgbouncer:6432/insightdesk?pgbouncer=true
    depends_on:
      - pgbouncer
```

---

## Query Analysis

### EXPLAIN ANALYZE

```sql
-- Analyze ticket list query
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT t.*, u.name as assignee_name
FROM tickets t
LEFT JOIN users u ON t.assignee_id = u.id
WHERE t.organization_id = 'org_123'
  AND t.status IN ('OPEN', 'IN_PROGRESS')
ORDER BY t.created_at DESC
LIMIT 20;
```

### Prisma Query Logging

```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
  ],
});

// Log slow queries
prisma.$on('query', (e) => {
  if (e.duration > 100) {
    console.warn(`Slow query (${e.duration}ms):`, {
      query: e.query,
      params: e.params,
      duration: e.duration,
    });
  }
});

// Metrics collection
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;

  dbQueryHistogram.observe(
    { model: params.model, operation: params.action },
    duration / 1000
  );

  return result;
});
```

### Query Statistics

```sql
-- Enable query stats extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 10 slowest queries
SELECT 
  query,
  calls,
  mean_exec_time::numeric(10,2) as avg_ms,
  total_exec_time::numeric(10,2) as total_ms,
  rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Most frequently executed queries
SELECT 
  query,
  calls,
  mean_exec_time::numeric(10,2) as avg_ms
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;

-- Reset statistics
SELECT pg_stat_statements_reset();
```

---

## Materialized Views

### Dashboard Statistics View

```sql
-- Create materialized view for dashboard stats
CREATE MATERIALIZED VIEW mv_dashboard_stats AS
SELECT 
  organization_id,
  DATE(created_at) as date,
  status,
  priority,
  COUNT(*) as ticket_count,
  AVG(EXTRACT(EPOCH FROM (
    CASE WHEN first_response_at IS NOT NULL 
         THEN first_response_at - created_at 
    END
  ))) as avg_first_response_seconds,
  AVG(EXTRACT(EPOCH FROM (
    CASE WHEN resolved_at IS NOT NULL 
         THEN resolved_at - created_at 
    END
  ))) as avg_resolution_seconds
FROM tickets
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY organization_id, DATE(created_at), status, priority
WITH DATA;

-- Create indexes on materialized view
CREATE INDEX idx_mv_dashboard_org_date 
ON mv_dashboard_stats(organization_id, date DESC);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_dashboard_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_stats;
END;
$$ LANGUAGE plpgsql;
```

### Scheduled Refresh

```typescript
// jobs/refresh-materialized-views.ts
import { Queue, Worker } from 'bullmq';
import { valkey } from '@/lib/valkey';

const refreshQueue = new Queue('materialized-views', {
  connection: valkey,
});

// Schedule refresh every 15 minutes
await refreshQueue.add(
  'refresh-dashboard-stats',
  {},
  {
    repeat: { pattern: '*/15 * * * *' },
    removeOnComplete: 10,
    removeOnFail: 50,
  }
);

new Worker('materialized-views', async (job) => {
  if (job.name === 'refresh-dashboard-stats') {
    await prisma.$executeRaw`
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_stats
    `;
  }
}, { connection: valkey });
```

---

## Partitioning

### Time-Based Partitioning

```sql
-- Create partitioned table for audit logs
CREATE TABLE audit_logs (
  id UUID DEFAULT gen_random_uuid(),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50),
  organization_id VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE audit_logs_2024_01 PARTITION OF audit_logs
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE audit_logs_2024_02 PARTITION OF audit_logs
FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Auto-create future partitions
CREATE OR REPLACE FUNCTION create_audit_partition()
RETURNS void AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  partition_date := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  partition_name := 'audit_logs_' || TO_CHAR(partition_date, 'YYYY_MM');
  start_date := partition_date;
  end_date := partition_date + INTERVAL '1 month';
  
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs 
     FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date
  );
END;
$$ LANGUAGE plpgsql;

-- Schedule partition creation
SELECT cron.schedule('create-audit-partition', '0 0 25 * *', 'SELECT create_audit_partition()');
```

### Partition Management

```typescript
// lib/partition-manager.ts
export async function ensurePartitionsExist(monthsAhead = 2) {
  for (let i = 0; i <= monthsAhead; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() + i);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const partitionName = `audit_logs_${year}_${month}`;
    
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(year, date.getMonth() + 1, 1)
      .toISOString()
      .split('T')[0];

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${partitionName} 
      PARTITION OF audit_logs 
      FOR VALUES FROM ('${startDate}') TO ('${endDate}')
    `);
  }
}

// Drop old partitions
export async function dropOldPartitions(monthsToKeep = 12) {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);
  
  const result = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables 
    WHERE tablename LIKE 'audit_logs_%'
  `;

  for (const { tablename } of result) {
    const match = tablename.match(/audit_logs_(\d{4})_(\d{2})/);
    if (match) {
      const partitionDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1);
      if (partitionDate < cutoffDate) {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${tablename}`);
      }
    }
  }
}
```

---

## Vacuum & Maintenance

### Autovacuum Configuration

```sql
-- Check autovacuum settings
SHOW autovacuum;
SHOW autovacuum_vacuum_threshold;
SHOW autovacuum_analyze_threshold;

-- Adjust for high-write tables
ALTER TABLE tickets SET (
  autovacuum_vacuum_threshold = 50,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_threshold = 50,
  autovacuum_analyze_scale_factor = 0.01
);

-- Check vacuum/analyze status
SELECT 
  schemaname,
  relname,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze,
  n_live_tup,
  n_dead_tup
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

### Maintenance Scripts

```sql
-- Reindex large indexes
REINDEX INDEX CONCURRENTLY idx_tickets_org_status_created;

-- Update statistics
ANALYZE tickets;
ANALYZE VERBOSE tickets;

-- Full vacuum (blocks writes - use carefully)
VACUUM FULL tickets;

-- Regular vacuum (concurrent)
VACUUM ANALYZE tickets;
```

---

## Monitoring

### PostgreSQL Metrics

```typescript
// lib/db-metrics.ts
import { Gauge, Histogram } from 'prom-client';

export const dbMetrics = {
  connections: new Gauge({
    name: 'pg_connections_total',
    help: 'Number of database connections',
    labelNames: ['state'],
  }),

  queryDuration: new Histogram({
    name: 'pg_query_duration_seconds',
    help: 'Database query duration',
    labelNames: ['operation', 'table'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  }),

  deadTuples: new Gauge({
    name: 'pg_dead_tuples',
    help: 'Dead tuples per table',
    labelNames: ['table'],
  }),

  cacheHitRatio: new Gauge({
    name: 'pg_cache_hit_ratio',
    help: 'Buffer cache hit ratio',
  }),
};

// Collect metrics periodically
export async function collectDbMetrics() {
  // Connection stats
  const connStats = await prisma.$queryRaw<{ state: string; count: number }[]>`
    SELECT state, COUNT(*) as count 
    FROM pg_stat_activity 
    WHERE datname = current_database()
    GROUP BY state
  `;
  
  for (const { state, count } of connStats) {
    dbMetrics.connections.set({ state }, count);
  }

  // Cache hit ratio
  const cacheStats = await prisma.$queryRaw<{ ratio: number }[]>`
    SELECT 
      ROUND(100 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2) as ratio
    FROM pg_stat_database
    WHERE datname = current_database()
  `;
  
  if (cacheStats[0]?.ratio) {
    dbMetrics.cacheHitRatio.set(cacheStats[0].ratio);
  }

  // Dead tuples
  const tableStats = await prisma.$queryRaw<{ relname: string; n_dead_tup: number }[]>`
    SELECT relname, n_dead_tup 
    FROM pg_stat_user_tables 
    WHERE n_dead_tup > 1000
  `;
  
  for (const { relname, n_dead_tup } of tableStats) {
    dbMetrics.deadTuples.set({ table: relname }, n_dead_tup);
  }
}
```

### Health Check Queries

```sql
-- Database size
SELECT pg_size_pretty(pg_database_size(current_database())) as db_size;

-- Table sizes
SELECT 
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  pg_size_pretty(pg_relation_size(relid)) as data_size,
  pg_size_pretty(pg_indexes_size(relid)) as index_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;

-- Index usage
SELECT 
  indexrelname as index_name,
  idx_scan as scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
ORDER BY idx_scan
LIMIT 20;

-- Long-running queries
SELECT 
  pid,
  now() - pg_stat_activity.query_start as duration,
  query,
  state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '30 seconds'
  AND state != 'idle'
ORDER BY duration DESC;
```
