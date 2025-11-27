# Performance Optimization

> Strategies and techniques for optimizing InsightDesk performance across all layers.

## Table of Contents

1. [Performance Goals](#performance-goals)
2. [Backend Optimization](#backend-optimization)
3. [Database Optimization](#database-optimization)
4. [Frontend Optimization](#frontend-optimization)
5. [Network Optimization](#network-optimization)
6. [Real-time Performance](#real-time-performance)
7. [Monitoring & Profiling](#monitoring--profiling)
8. [Related Documentation](#related-documentation)

---

## Performance Goals

### Target Metrics

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| API Response Time (p95) | < 200ms | < 500ms |
| API Response Time (p99) | < 500ms | < 1000ms |
| Time to First Byte (TTFB) | < 200ms | < 400ms |
| First Contentful Paint (FCP) | < 1.5s | < 2.5s |
| Largest Contentful Paint (LCP) | < 2.5s | < 4.0s |
| Time to Interactive (TTI) | < 3.5s | < 5.0s |
| Cumulative Layout Shift (CLS) | < 0.1 | < 0.25 |
| Database Query Time (avg) | < 50ms | < 200ms |
| WebSocket Latency | < 100ms | < 300ms |

### Load Capacity Targets

| Scenario | Target |
|----------|--------|
| Concurrent Users | 10,000 |
| API Requests/sec | 5,000 |
| WebSocket Connections | 50,000 |
| Database Connections | 500 |

---

## Backend Optimization

### Connection Pooling

```typescript
// lib/prisma.ts - Optimized Prisma configuration
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

// Configure connection pool via DATABASE_URL:
// postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=30
```

### Query Optimization

```typescript
// services/ticket.service.ts
import { prisma } from '@/lib/prisma';

export class TicketService {
  // ✅ Optimized: Select only needed fields
  async getTicketList(filters: TicketFilters) {
    return prisma.ticket.findMany({
      where: this.buildWhereClause(filters),
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        assignee: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      skip: (filters.page - 1) * filters.limit,
    });
  }

  // ✅ Optimized: Use includes for related data in single query
  async getTicketDetail(id: string) {
    return prisma.ticket.findUnique({
      where: { id },
      include: {
        assignee: {
          select: { id: true, name: true, avatar: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        comments: {
          where: { isInternal: false },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            author: {
              select: { id: true, name: true, avatar: true },
            },
          },
        },
        _count: {
          select: { comments: true, attachments: true },
        },
      },
    });
  }

  // ✅ Optimized: Batch operations
  async batchUpdateStatus(ticketIds: string[], status: TicketStatus) {
    return prisma.ticket.updateMany({
      where: { id: { in: ticketIds } },
      data: { 
        status,
        updatedAt: new Date(),
      },
    });
  }
}
```

### Async Processing

```typescript
// services/ticket.service.ts
import { emailQueue, notificationQueue, analyticsQueue } from '@/queues';

export class TicketService {
  async create(input: CreateTicketInput) {
    // Create ticket synchronously
    const ticket = await prisma.ticket.create({
      data: input,
    });

    // Offload non-critical work to queues
    await Promise.all([
      // Send confirmation email (async)
      emailQueue.add('ticket-created', {
        ticketId: ticket.id,
        userId: input.createdById,
      }),
      
      // Notify agents (async)
      notificationQueue.add('new-ticket', {
        ticketId: ticket.id,
        priority: input.priority,
      }),
      
      // Track analytics (async)
      analyticsQueue.add('ticket-created', {
        ticketId: ticket.id,
        channel: input.channel,
        timestamp: new Date(),
      }),
    ]);

    return ticket;
  }
}
```

### Response Compression

```typescript
// middleware/compression.ts
import compression from 'compression';

export const compressionMiddleware = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress responses > 1KB
});

// app.ts
app.use(compressionMiddleware);
```

### Request Batching

```typescript
// lib/dataloader.ts
import DataLoader from 'dataloader';
import { prisma } from './prisma';

// Batch user lookups
export const userLoader = new DataLoader(async (userIds: string[]) => {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
  });
  
  const userMap = new Map(users.map(u => [u.id, u]));
  return userIds.map(id => userMap.get(id) || null);
});

// Usage in resolver
export async function getTicketWithAssignee(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });
  
  if (ticket?.assigneeId) {
    ticket.assignee = await userLoader.load(ticket.assigneeId);
  }
  
  return ticket;
}
```

---

## Database Optimization

### Indexing Strategy

```prisma
// prisma/schema.prisma
model Ticket {
  id          String   @id @default(uuid())
  number      Int      @unique @default(autoincrement())
  title       String
  description String?
  status      TicketStatus @default(open)
  priority    TicketPriority @default(medium)
  createdById String
  assigneeId  String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  resolvedAt  DateTime?

  // Composite indexes for common queries
  @@index([status, priority])
  @@index([assigneeId, status])
  @@index([createdById, createdAt])
  @@index([status, createdAt])
  
  // Full-text search index
  @@index([title, description], type: GIN)
}
```

### Query Analysis

```sql
-- Analyze slow queries
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM tickets
WHERE status = 'open'
  AND priority = 'high'
ORDER BY created_at DESC
LIMIT 20;

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Find missing indexes
SELECT
  relname AS table,
  seq_scan,
  idx_scan,
  seq_tup_read,
  n_tup_ins + n_tup_upd + n_tup_del AS writes
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan
  AND n_live_tup > 10000
ORDER BY seq_tup_read DESC;
```

### Connection Optimization

```typescript
// Database URL configuration
const databaseUrl = new URL(process.env.DATABASE_URL);

// Production connection settings
databaseUrl.searchParams.set('connection_limit', '20');
databaseUrl.searchParams.set('pool_timeout', '30');
databaseUrl.searchParams.set('connect_timeout', '10');
databaseUrl.searchParams.set('statement_cache_size', '100');

// Enable prepared statements
databaseUrl.searchParams.set('prepare', 'true');
```

### Read Replicas

```typescript
// lib/prisma.ts - Read replica support
import { PrismaClient } from '@prisma/client';

export const prismaWrite = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

export const prismaRead = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_REPLICA_URL || process.env.DATABASE_URL },
  },
});

// Usage
export class TicketService {
  async getList(filters: TicketFilters) {
    return prismaRead.ticket.findMany({ ... }); // Read from replica
  }

  async create(data: CreateTicketInput) {
    return prismaWrite.ticket.create({ data }); // Write to primary
  }
}
```

---

## Frontend Optimization

### Code Splitting

```typescript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Automatic code splitting
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
};

// Dynamic imports for heavy components
const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor'),
  { 
    loading: () => <EditorSkeleton />,
    ssr: false,
  }
);

const Charts = dynamic(
  () => import('@/components/Charts'),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);
```

### Image Optimization

```typescript
// components/Avatar.tsx
import Image from 'next/image';

export function Avatar({ user, size = 40 }: AvatarProps) {
  return (
    <Image
      src={user.avatar || '/default-avatar.png'}
      alt={user.name}
      width={size}
      height={size}
      className="rounded-full"
      placeholder="blur"
      blurDataURL={generateBlurDataUrl(size)}
      priority={false}
      loading="lazy"
    />
  );
}

// next.config.js
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.insightdesk.io',
      },
    ],
  },
};
```

### Bundle Analysis

```bash
# Analyze bundle size
ANALYZE=true bun run build

# Install bundle analyzer
bun add -D @next/bundle-analyzer

# next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer(nextConfig);
```

### React Optimization

```typescript
// Memoization for expensive computations
import { useMemo, memo, useCallback } from 'react';

// Memoize filtered/sorted data
function TicketList({ tickets, filter }: TicketListProps) {
  const filteredTickets = useMemo(() => {
    return tickets
      .filter(t => matchesFilter(t, filter))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [tickets, filter]);

  return (
    <ul>
      {filteredTickets.map(ticket => (
        <TicketItem key={ticket.id} ticket={ticket} />
      ))}
    </ul>
  );
}

// Memoize components that receive stable props
const TicketItem = memo(function TicketItem({ ticket }: TicketItemProps) {
  return (
    <li>
      <h3>{ticket.title}</h3>
      <StatusBadge status={ticket.status} />
    </li>
  );
});

// Memoize callbacks
function TicketActions({ onUpdate }: TicketActionsProps) {
  const handleStatusChange = useCallback((status: TicketStatus) => {
    onUpdate({ status });
  }, [onUpdate]);

  return <StatusDropdown onChange={handleStatusChange} />;
}
```

### Virtual Scrolling

```typescript
// components/VirtualTicketList.tsx
import { useVirtualizer } from '@tanstack/react-virtual';

export function VirtualTicketList({ tickets }: VirtualTicketListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: tickets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated row height
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <TicketRow ticket={tickets[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Network Optimization

### API Response Optimization

```typescript
// middleware/responseOptimization.ts
import { gzip } from 'zlib';

// Conditional response based on client needs
export function optimizedResponse(req: Request, res: Response, data: any) {
  // Check if client wants minimal response
  if (req.headers['x-response-type'] === 'minimal') {
    return res.json(minimalTransform(data));
  }

  // Support field selection
  const fields = req.query.fields?.split(',');
  if (fields) {
    return res.json(selectFields(data, fields));
  }

  return res.json(data);
}

// ETag support for conditional requests
export function withETag(handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    const result = await handler(req, res, next);
    
    if (result) {
      const etag = generateETag(result);
      res.setHeader('ETag', etag);
      
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
    }
    
    return result;
  };
}
```

### Request Deduplication

```typescript
// lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error instanceof ApiError && error.status < 500) {
          return false;
        }
        return failureCount < 3;
      },
      // Deduplicate identical requests
      networkMode: 'offlineFirst',
    },
  },
});
```

### CDN Configuration

```nginx
# nginx/cdn.conf
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header Vary "Accept-Encoding";
}

location ~* \.html$ {
    expires -1;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}

# API responses
location /api/ {
    add_header Cache-Control "private, no-cache";
    add_header Vary "Authorization, Accept-Encoding";
}
```

---

## Real-time Performance

### WebSocket Optimization

```typescript
// lib/socket.ts
import { Server } from 'socket.io';

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    // Transport configuration
    transports: ['websocket', 'polling'],
    
    // Connection optimization
    pingTimeout: 20000,
    pingInterval: 25000,
    
    // Payload limits
    maxHttpBufferSize: 1e6, // 1MB
    
    // Compression
    perMessageDeflate: {
      threshold: 1024, // Only compress messages > 1KB
    },
    
    // CORS
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
    },
  });

  // Room-based broadcasting for efficiency
  io.on('connection', (socket) => {
    // Join user to their personal room
    const userId = socket.handshake.auth.userId;
    socket.join(`user:${userId}`);
    
    // Join organization room
    const orgId = socket.handshake.auth.organizationId;
    socket.join(`org:${orgId}`);
    
    // Ticket-specific rooms (on demand)
    socket.on('join:ticket', (ticketId) => {
      socket.join(`ticket:${ticketId}`);
    });
    
    socket.on('leave:ticket', (ticketId) => {
      socket.leave(`ticket:${ticketId}`);
    });
  });

  return io;
}
```

### Event Batching

```typescript
// lib/eventBatcher.ts
class EventBatcher {
  private batch: Map<string, any[]> = new Map();
  private flushInterval: NodeJS.Timeout;

  constructor(private flushMs: number = 100) {
    this.flushInterval = setInterval(() => this.flush(), flushMs);
  }

  add(channel: string, event: any) {
    if (!this.batch.has(channel)) {
      this.batch.set(channel, []);
    }
    this.batch.get(channel)!.push(event);
  }

  flush() {
    for (const [channel, events] of this.batch) {
      if (events.length > 0) {
        io.to(channel).emit('batch', events);
        this.batch.set(channel, []);
      }
    }
  }

  destroy() {
    clearInterval(this.flushInterval);
    this.flush();
  }
}

export const eventBatcher = new EventBatcher(100);
```

---

## Monitoring & Profiling

### Performance Metrics Collection

```typescript
// lib/metrics.ts
import { performance, PerformanceObserver } from 'perf_hooks';

// Measure async operations
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    metrics.histogram.observe({ operation: name }, duration);
    
    if (duration > 1000) {
      logger.warn({ operation: name, duration }, 'Slow operation detected');
    }
  }
}

// Usage
const tickets = await measureAsync('getTicketList', () => 
  ticketService.getList(filters)
);
```

### Database Query Monitoring

```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
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
    logger.warn({
      query: e.query,
      params: e.params,
      duration: e.duration,
    }, 'Slow database query');
    
    metrics.slowQueries.inc({ query: e.query.substring(0, 50) });
  }
  
  metrics.queryDuration.observe(e.duration);
});
```

### Frontend Performance Monitoring

```typescript
// lib/performance.ts
export function initPerformanceMonitoring() {
  if (typeof window === 'undefined') return;

  // Core Web Vitals
  import('web-vitals').then(({ onCLS, onFID, onLCP, onFCP, onTTFB }) => {
    onCLS(sendToAnalytics);
    onFID(sendToAnalytics);
    onLCP(sendToAnalytics);
    onFCP(sendToAnalytics);
    onTTFB(sendToAnalytics);
  });

  // Long tasks
  if (PerformanceObserver) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          sendToAnalytics({
            name: 'long-task',
            value: entry.duration,
          });
        }
      }
    });
    
    observer.observe({ entryTypes: ['longtask'] });
  }
}

function sendToAnalytics(metric: { name: string; value: number }) {
  // Send to your analytics service
  fetch('/api/analytics/vitals', {
    method: 'POST',
    body: JSON.stringify(metric),
    keepalive: true,
  });
}
```

---

## Related Documentation

- [Caching Strategy](./caching.md) - Multi-layer caching approach
- [Benchmarks](./benchmarks.md) - Performance testing and baselines
- [Database Indexing](../02-database/indexing.md) - Database optimization
- [Scalability](../01-architecture/scalability.md) - Horizontal scaling

---

## Quick Wins Checklist

```markdown
## Immediate Optimizations

### Backend
- [ ] Enable response compression
- [ ] Add database connection pooling
- [ ] Implement query result caching
- [ ] Use select() to limit fields returned

### Database
- [ ] Add indexes for common queries
- [ ] Enable query plan caching
- [ ] Set up connection pooler (PgBouncer)

### Frontend
- [ ] Enable Next.js image optimization
- [ ] Add dynamic imports for heavy components
- [ ] Configure stale-while-revalidate caching
- [ ] Implement virtual scrolling for long lists

### Network
- [ ] Enable CDN for static assets
- [ ] Configure proper cache headers
- [ ] Implement request deduplication
```
