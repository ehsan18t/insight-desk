# Caching Strategy

> Multi-layer caching approach for optimal performance in InsightDesk.

## Table of Contents

1. [Caching Architecture](#caching-architecture)
2. [Valkey (Redis) Caching](#valkey-redis-caching)
3. [Application-Level Caching](#application-level-caching)
4. [HTTP Caching](#http-caching)
5. [React Query Caching](#react-query-caching)
6. [CDN Caching](#cdn-caching)
7. [Cache Invalidation](#cache-invalidation)
8. [Monitoring & Debugging](#monitoring--debugging)

---

## Caching Architecture

### Multi-Layer Cache Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  Browser Cache │ Service Worker │ React Query │ Local Storage   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                         CDN Layer                                │
├─────────────────────────────────────────────────────────────────┤
│       Static Assets │ API Responses (public) │ Images           │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      Application Layer                           │
├─────────────────────────────────────────────────────────────────┤
│            In-Memory Cache │ Request Deduplication              │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      Valkey (Redis) Layer                        │
├─────────────────────────────────────────────────────────────────┤
│  Session Data │ API Cache │ Rate Limits │ Real-time State       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                       Database Layer                             │
├─────────────────────────────────────────────────────────────────┤
│        Query Cache │ Connection Pool │ Materialized Views       │
└─────────────────────────────────────────────────────────────────┘
```

### Cache Decision Matrix

| Data Type | TTL | Cache Layer | Invalidation |
|-----------|-----|-------------|--------------|
| Static assets | 1 year | CDN, Browser | Version hash |
| User session | 24 hours | Valkey | Logout/refresh |
| API responses | 5 min | React Query | Mutation |
| Ticket list | 30 sec | Valkey, RQ | Real-time event |
| User profile | 5 min | Valkey | Profile update |
| Knowledge base | 1 hour | CDN, Valkey | Article update |
| Analytics | 15 min | Valkey | Scheduled |
| Search results | 1 min | Valkey | New content |

---

## Valkey (Redis) Caching

### Connection Setup

```typescript
// lib/valkey.ts
import { createClient, RedisClientType } from 'redis';

const globalForValkey = globalThis as unknown as {
  valkey: RedisClientType | undefined;
};

export const valkey = globalForValkey.valkey ?? createClient({
  url: process.env.VALKEY_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        return new Error('Max retries reached');
      }
      return Math.min(retries * 100, 3000);
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  globalForValkey.valkey = valkey;
}

valkey.on('error', (err) => {
  console.error('Valkey error:', err);
});

valkey.on('connect', () => {
  console.log('Connected to Valkey');
});

// Initialize connection
export async function initValkey() {
  if (!valkey.isOpen) {
    await valkey.connect();
  }
}
```

### Cache Service

```typescript
// services/cache.service.ts
import { valkey } from '@/lib/valkey';

export class CacheService {
  private defaultTTL = 300; // 5 minutes

  /**
   * Get cached value or fetch from source
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: { ttl?: number; tags?: string[] } = {}
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await valkey.get(key);
    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * Set cached value with optional TTL and tags
   */
  async set(
    key: string,
    value: unknown,
    options: { ttl?: number; tags?: string[] } = {}
  ): Promise<void> {
    const ttl = options.ttl ?? this.defaultTTL;
    const serialized = JSON.stringify(value);

    await valkey.setEx(key, ttl, serialized);

    // Store key in tag sets for invalidation
    if (options.tags?.length) {
      for (const tag of options.tags) {
        await valkey.sAdd(`tag:${tag}`, key);
        await valkey.expire(`tag:${tag}`, ttl + 60);
      }
    }
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    await valkey.del(key);
  }

  /**
   * Delete all keys with a specific tag
   */
  async invalidateTag(tag: string): Promise<number> {
    const keys = await valkey.sMembers(`tag:${tag}`);
    if (keys.length === 0) {
      return 0;
    }

    await valkey.del(keys);
    await valkey.del(`tag:${tag}`);
    return keys.length;
  }

  /**
   * Delete keys matching a pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    let cursor = 0;
    let deletedCount = 0;

    do {
      const result = await valkey.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      
      if (result.keys.length > 0) {
        await valkey.del(result.keys);
        deletedCount += result.keys.length;
      }
    } while (cursor !== 0);

    return deletedCount;
  }
}

export const cacheService = new CacheService();
```

### Key Naming Conventions

```typescript
// lib/cache-keys.ts
export const CacheKeys = {
  // User-related
  user: (id: string) => `user:${id}`,
  userSession: (id: string) => `session:${id}`,
  userPermissions: (id: string) => `user:${id}:permissions`,

  // Ticket-related
  ticket: (id: string) => `ticket:${id}`,
  ticketList: (filters: TicketFilters) => 
    `tickets:list:${hashObject(filters)}`,
  ticketCount: (status?: string) => 
    `tickets:count${status ? `:${status}` : ''}`,

  // Organization-related
  orgSettings: (id: string) => `org:${id}:settings`,
  orgTeams: (id: string) => `org:${id}:teams`,

  // Knowledge base
  article: (id: string) => `kb:article:${id}`,
  articleSearch: (query: string) => `kb:search:${hash(query)}`,
  categoryTree: (orgId: string) => `kb:categories:${orgId}`,

  // Analytics
  dashboardStats: (userId: string, period: string) => 
    `analytics:dashboard:${userId}:${period}`,
  
  // Rate limiting
  rateLimit: (key: string) => `ratelimit:${key}`,
};

function hashObject(obj: Record<string, any>): string {
  return crypto.createHash('md5')
    .update(JSON.stringify(obj))
    .digest('hex')
    .substring(0, 8);
}
```

### Caching Patterns

```typescript
// services/ticket.service.ts
import { cacheService, CacheKeys } from '@/lib/cache';

export class TicketService {
  async getTicket(id: string): Promise<Ticket | null> {
    return cacheService.getOrSet(
      CacheKeys.ticket(id),
      async () => {
        return prisma.ticket.findUnique({
          where: { id },
          include: {
            assignee: true,
            createdBy: true,
          },
        });
      },
      { 
        ttl: 300,
        tags: ['tickets', `ticket:${id}`],
      }
    );
  }

  async getTicketList(filters: TicketFilters): Promise<PaginatedTickets> {
    return cacheService.getOrSet(
      CacheKeys.ticketList(filters),
      async () => {
        const [tickets, total] = await Promise.all([
          prisma.ticket.findMany({
            where: this.buildWhere(filters),
            orderBy: { createdAt: 'desc' },
            take: filters.limit,
            skip: (filters.page - 1) * filters.limit,
          }),
          prisma.ticket.count({
            where: this.buildWhere(filters),
          }),
        ]);

        return { data: tickets, total, page: filters.page };
      },
      {
        ttl: 30, // Short TTL for list data
        tags: ['tickets', `tickets:status:${filters.status}`],
      }
    );
  }

  async updateTicket(id: string, data: UpdateTicketInput): Promise<Ticket> {
    const ticket = await prisma.ticket.update({
      where: { id },
      data,
    });

    // Invalidate related caches
    await Promise.all([
      cacheService.delete(CacheKeys.ticket(id)),
      cacheService.invalidateTag('tickets'),
    ]);

    return ticket;
  }
}
```

---

## Application-Level Caching

### In-Memory Cache with LRU

```typescript
// lib/lru-cache.ts
import { LRUCache } from 'lru-cache';

// Type-safe LRU cache factory
export function createLRUCache<K extends string, V>(options: {
  max: number;
  ttl: number;
  updateAgeOnGet?: boolean;
}) {
  return new LRUCache<K, V>({
    max: options.max,
    ttl: options.ttl,
    updateAgeOnGet: options.updateAgeOnGet ?? true,
    allowStale: false,
  });
}

// Shared caches
export const userCache = createLRUCache<string, User>({
  max: 1000,
  ttl: 5 * 60 * 1000, // 5 minutes
});

export const permissionCache = createLRUCache<string, string[]>({
  max: 500,
  ttl: 10 * 60 * 1000, // 10 minutes
});

export const configCache = createLRUCache<string, any>({
  max: 100,
  ttl: 60 * 60 * 1000, // 1 hour
});
```

### Request-Level Memoization

```typescript
// lib/request-cache.ts
import { AsyncLocalStorage } from 'async_hooks';

const requestContext = new AsyncLocalStorage<Map<string, any>>();

export function withRequestCache<T>(fn: () => Promise<T>): Promise<T> {
  return requestContext.run(new Map(), fn);
}

export function requestCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cache = requestContext.getStore();
  if (!cache) {
    return fn(); // No request context, execute directly
  }

  if (cache.has(key)) {
    return cache.get(key);
  }

  const promise = fn();
  cache.set(key, promise);
  return promise;
}

// Usage in middleware
app.use((req, res, next) => {
  withRequestCache(() => {
    next();
  });
});

// Usage in service
async function getUserWithOrg(userId: string) {
  const user = await requestCache(`user:${userId}`, () => 
    userService.getById(userId)
  );
  
  // This won't hit the DB again in the same request
  const org = await requestCache(`org:${user.orgId}`, () =>
    orgService.getById(user.orgId)
  );
  
  return { user, org };
}
```

---

## HTTP Caching

### Cache Headers Middleware

```typescript
// middleware/caching.ts
import { Request, Response, NextFunction } from 'express';

interface CacheOptions {
  maxAge?: number;
  sMaxAge?: number;
  private?: boolean;
  noStore?: boolean;
  staleWhileRevalidate?: number;
  staleIfError?: number;
}

export function cacheControl(options: CacheOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (options.noStore) {
      res.setHeader('Cache-Control', 'no-store');
      return next();
    }

    const directives: string[] = [];

    if (options.private) {
      directives.push('private');
    } else {
      directives.push('public');
    }

    if (options.maxAge !== undefined) {
      directives.push(`max-age=${options.maxAge}`);
    }

    if (options.sMaxAge !== undefined) {
      directives.push(`s-maxage=${options.sMaxAge}`);
    }

    if (options.staleWhileRevalidate !== undefined) {
      directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
    }

    if (options.staleIfError !== undefined) {
      directives.push(`stale-if-error=${options.staleIfError}`);
    }

    res.setHeader('Cache-Control', directives.join(', '));
    next();
  };
}

// Route examples
app.get('/api/v1/articles/:id', 
  cacheControl({ 
    maxAge: 300, 
    sMaxAge: 3600,
    staleWhileRevalidate: 86400,
  }),
  articlesController.getById
);

app.get('/api/v1/user/me',
  cacheControl({ private: true, maxAge: 60 }),
  usersController.getMe
);

app.post('/api/v1/tickets',
  cacheControl({ noStore: true }),
  ticketsController.create
);
```

### ETag Support

```typescript
// middleware/etag.ts
import { createHash } from 'crypto';

export function withETag(handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    // Capture response
    const originalJson = res.json.bind(res);
    
    res.json = (body: any) => {
      const etag = generateETag(body);
      res.setHeader('ETag', `"${etag}"`);
      
      const clientETag = req.headers['if-none-match'];
      if (clientETag === `"${etag}"`) {
        return res.status(304).end();
      }
      
      return originalJson(body);
    };
    
    next();
  };
}

function generateETag(data: any): string {
  const content = typeof data === 'string' 
    ? data 
    : JSON.stringify(data);
  
  return createHash('md5')
    .update(content)
    .digest('hex')
    .substring(0, 16);
}
```

---

## React Query Caching

### Query Client Configuration

```typescript
// lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // Data considered fresh for 30s
      gcTime: 5 * 60 * 1000, // Cache kept for 5 minutes
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        if ((error as any)?.status >= 400 && (error as any)?.status < 500) {
          return false;
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false,
    },
  },
});
```

### Query Key Factory

```typescript
// lib/query-keys.ts
export const queryKeys = {
  // Tickets
  tickets: {
    all: ['tickets'] as const,
    lists: () => [...queryKeys.tickets.all, 'list'] as const,
    list: (filters: TicketFilters) => 
      [...queryKeys.tickets.lists(), filters] as const,
    details: () => [...queryKeys.tickets.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.tickets.details(), id] as const,
  },

  // Users
  users: {
    all: ['users'] as const,
    detail: (id: string) => [...queryKeys.users.all, id] as const,
    me: () => [...queryKeys.users.all, 'me'] as const,
  },

  // Knowledge Base
  articles: {
    all: ['articles'] as const,
    lists: () => [...queryKeys.articles.all, 'list'] as const,
    list: (params: ArticleSearchParams) => 
      [...queryKeys.articles.lists(), params] as const,
    detail: (id: string) => [...queryKeys.articles.all, id] as const,
  },
};
```

### Optimistic Updates

```typescript
// hooks/useUpdateTicket.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

export function useUpdateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateTicketInput) => 
      ticketApi.update(data.id, data),
    
    onMutate: async (data) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ 
        queryKey: queryKeys.tickets.detail(data.id) 
      });

      // Snapshot previous value
      const previousTicket = queryClient.getQueryData<Ticket>(
        queryKeys.tickets.detail(data.id)
      );

      // Optimistically update
      queryClient.setQueryData(
        queryKeys.tickets.detail(data.id),
        (old: Ticket | undefined) => old ? { ...old, ...data } : old
      );

      return { previousTicket };
    },

    onError: (err, data, context) => {
      // Rollback on error
      if (context?.previousTicket) {
        queryClient.setQueryData(
          queryKeys.tickets.detail(data.id),
          context.previousTicket
        );
      }
    },

    onSettled: (data) => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tickets.detail(data?.id || '') 
      });
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.tickets.lists() 
      });
    },
  });
}
```

### Prefetching

```typescript
// hooks/usePrefetch.ts
import { useQueryClient } from '@tanstack/react-query';

export function usePrefetchTicket() {
  const queryClient = useQueryClient();

  return (ticketId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.tickets.detail(ticketId),
      queryFn: () => ticketApi.getById(ticketId),
      staleTime: 30 * 1000,
    });
  };
}

// Usage in component
function TicketRow({ ticket }: { ticket: TicketSummary }) {
  const prefetch = usePrefetchTicket();

  return (
    <Link 
      href={`/tickets/${ticket.id}`}
      onMouseEnter={() => prefetch(ticket.id)}
    >
      {ticket.title}
    </Link>
  );
}
```

---

## CDN Caching

### Cloudflare Configuration

```typescript
// Configuration headers for Cloudflare
const cdnHeaders = {
  // Cache public content
  '/api/v1/articles/*': {
    'Cache-Control': 'public, max-age=300, s-maxage=3600',
    'CDN-Cache-Control': 'max-age=86400',
    'Cloudflare-CDN-Cache-Control': 'max-age=86400',
  },
  
  // Cache images
  '/uploads/*': {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'CDN-Cache-Control': 'max-age=31536000',
  },
  
  // Never cache authenticated endpoints
  '/api/v1/user/*': {
    'Cache-Control': 'private, no-cache',
    'CDN-Cache-Control': 'no-store',
  },
};
```

### Cache Purging

```typescript
// lib/cdn.ts
export async function purgeCloudflareCache(urls: string[]): Promise<void> {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.warn('Cloudflare not configured, skipping cache purge');
    return;
  }

  await fetch(
    `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/purge_cache`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: urls,
      }),
    }
  );
}

// Usage after article update
async function updateArticle(id: string, data: UpdateArticleInput) {
  const article = await prisma.article.update({
    where: { id },
    data,
  });

  // Purge CDN cache
  await purgeCloudflareCache([
    `${process.env.API_URL}/api/v1/articles/${id}`,
    `${process.env.FRONTEND_URL}/knowledge-base/${article.slug}`,
  ]);

  return article;
}
```

---

## Cache Invalidation

### Event-Driven Invalidation

```typescript
// services/cache-invalidation.service.ts
import { EventEmitter } from 'events';

class CacheInvalidator extends EventEmitter {
  constructor() {
    super();
    this.setupListeners();
  }

  private setupListeners() {
    // Ticket events
    this.on('ticket:created', async ({ ticketId, organizationId }) => {
      await cacheService.invalidatePattern(`tickets:list:*`);
      await cacheService.delete(CacheKeys.ticketCount());
    });

    this.on('ticket:updated', async ({ ticketId, changes }) => {
      await cacheService.delete(CacheKeys.ticket(ticketId));
      
      if (changes.status) {
        await cacheService.invalidateTag('tickets');
      }
    });

    // User events
    this.on('user:updated', async ({ userId }) => {
      await cacheService.delete(CacheKeys.user(userId));
      await cacheService.delete(CacheKeys.userPermissions(userId));
    });

    // Organization events
    this.on('org:settings:updated', async ({ organizationId }) => {
      await cacheService.delete(CacheKeys.orgSettings(organizationId));
    });
  }
}

export const cacheInvalidator = new CacheInvalidator();

// Usage
ticketService.on('update', (ticket, changes) => {
  cacheInvalidator.emit('ticket:updated', { 
    ticketId: ticket.id, 
    changes,
  });
});
```

### Real-time Synchronization

```typescript
// services/cache-sync.service.ts
import { valkey } from '@/lib/valkey';

// Subscribe to cache invalidation messages across instances
export async function setupCacheSync() {
  const subscriber = valkey.duplicate();
  await subscriber.connect();

  await subscriber.subscribe('cache:invalidate', (message) => {
    const { key, pattern, tag } = JSON.parse(message);

    if (key) {
      // Invalidate local LRU cache
      localCache.delete(key);
    }
    
    if (pattern) {
      // Pattern invalidation
      for (const k of localCache.keys()) {
        if (k.match(pattern)) {
          localCache.delete(k);
        }
      }
    }
  });
}

// Publish invalidation to all instances
export async function broadcastInvalidation(params: {
  key?: string;
  pattern?: string;
  tag?: string;
}) {
  await valkey.publish('cache:invalidate', JSON.stringify(params));
}
```

---

## Monitoring & Debugging

### Cache Hit Rate Tracking

```typescript
// lib/cache-metrics.ts
import { Counter, Gauge } from 'prom-client';

export const cacheMetrics = {
  hits: new Counter({
    name: 'cache_hits_total',
    help: 'Total cache hits',
    labelNames: ['cache', 'key_prefix'],
  }),

  misses: new Counter({
    name: 'cache_misses_total',
    help: 'Total cache misses',
    labelNames: ['cache', 'key_prefix'],
  }),

  size: new Gauge({
    name: 'cache_size_bytes',
    help: 'Cache size in bytes',
    labelNames: ['cache'],
  }),

  latency: new Histogram({
    name: 'cache_operation_duration_seconds',
    help: 'Cache operation latency',
    labelNames: ['cache', 'operation'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
  }),
};

// Instrumented cache service
class InstrumentedCacheService extends CacheService {
  async get<T>(key: string): Promise<T | null> {
    const timer = cacheMetrics.latency.startTimer({ 
      cache: 'valkey', 
      operation: 'get' 
    });
    
    const value = await super.get<T>(key);
    
    timer();
    
    const prefix = key.split(':')[0];
    if (value !== null) {
      cacheMetrics.hits.inc({ cache: 'valkey', key_prefix: prefix });
    } else {
      cacheMetrics.misses.inc({ cache: 'valkey', key_prefix: prefix });
    }
    
    return value;
  }
}
```

### Debug Endpoints

```typescript
// routes/debug.ts (dev only)
if (process.env.NODE_ENV === 'development') {
  router.get('/debug/cache/stats', async (req, res) => {
    const info = await valkey.info('stats');
    const dbSize = await valkey.dbSize();
    
    res.json({
      dbSize,
      info: parseRedisInfo(info),
      hitRate: calculateHitRate(),
    });
  });

  router.get('/debug/cache/keys', async (req, res) => {
    const pattern = req.query.pattern as string || '*';
    const keys = await scanKeys(pattern, 100);
    
    res.json({ pattern, count: keys.length, keys });
  });

  router.delete('/debug/cache/flush', async (req, res) => {
    await valkey.flushDb();
    res.json({ message: 'Cache flushed' });
  });
}
```
