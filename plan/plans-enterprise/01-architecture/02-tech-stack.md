# Technology Stack

> Detailed technology choices and rationale for InsightDesk

---

## Table of Contents

- [Stack Overview](#stack-overview)
- [Runtime & Package Management](#runtime--package-management)
- [Backend Technologies](#backend-technologies)
- [Frontend Technologies](#frontend-technologies)
- [Data Layer](#data-layer)
- [Infrastructure & DevOps](#infrastructure--devops)
- [Decision Rationale](#decision-rationale)

---

## Stack Overview

| Layer | Technology | Version |
|-------|------------|---------|
| **Runtime** | Bun | 1.1+ |
| **Backend Framework** | Express.js | 4.x |
| **Frontend Framework** | Next.js | 14+ |
| **Language** | TypeScript | 5.x |
| **Database** | PostgreSQL | 15+ |
| **Cache/Queue** | Valkey | 7+ |
| **Background Jobs** | BullMQ | 5.x |
| **Real-time** | Socket.IO | 4.x |
| **ORM** | Prisma | 5.x |
| **Validation** | Zod | 3.x |

---

## Runtime & Package Management

### Bun 1.1+

**Primary runtime and package manager for the entire stack.**

#### Why Bun?

| Benefit | Description |
|---------|-------------|
| **Speed** | 4x faster than npm for installs, native TypeScript execution |
| **All-in-one** | Runtime + package manager + bundler + test runner |
| **Node.js Compatible** | Runs Express, Socket.IO, and most npm packages |
| **Native TypeScript** | No transpilation step needed |
| **Built-in SQLite** | Useful for local development |
| **Hot Reloading** | `bun --watch` for development |

#### Configuration

```toml
# bunfig.toml
[install]
# Prefer offline mode when possible
prefer-offline = true

# Lock file for reproducible builds
frozen-lockfile = true

[run]
# Enable source maps for debugging
smol = false
```

#### Common Commands

```bash
# Install dependencies
bun install

# Add a package
bun add express

# Add dev dependency
bun add -d typescript

# Run scripts
bun run dev
bun run build
bun run test

# Execute TypeScript directly
bun run src/server.ts
```

---

## Backend Technologies

### Express.js 4.x

**Minimal, flexible Node.js web application framework.**

#### Why Express?

- Mature ecosystem with extensive middleware
- Bun-compatible
- Well-documented patterns
- Easy to test

#### Key Middleware Stack

```typescript
// Core middleware configuration
const app = express();

// Security
app.use(helmet());
app.use(cors(corsOptions));

// Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request ID
app.use(requestId());

// Logging
app.use(pinoHttp({ logger }));

// Rate limiting
app.use(rateLimit(rateLimitConfig));

// Routes
app.use('/api/v1', apiRouter);

// Error handling
app.use(errorHandler);
```

### Socket.IO 4.x

**Real-time bidirectional event-based communication.**

#### Features Used

| Feature | Purpose |
|---------|---------|
| Rooms | Per-ticket chat rooms |
| Namespaces | Separate concerns (chat, notifications) |
| Acknowledgments | Message delivery confirmation |
| Valkey Adapter | Horizontal scaling |

#### Configuration

```typescript
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/valkey-adapter';
import { createClient } from 'valkey';

const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Valkey adapter for scaling
const pubClient = createClient({ url: VALKEY_URL });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

### BullMQ 5.x

**Premium queue for handling distributed jobs.**

#### Queue Types

| Queue | Purpose | Priority |
|-------|---------|----------|
| `sla-checks` | SLA timer processing | High |
| `notifications` | Email/push notifications | Medium |
| `analytics` | Metric aggregation | Low |
| `cleanup` | Auto-close, data cleanup | Low |

#### Configuration

```typescript
import { Queue, Worker } from 'bullmq';

const connection = {
  host: VALKEY_HOST,
  port: VALKEY_PORT,
};

// Define queues
const slaQueue = new Queue('sla-checks', { connection });
const notificationQueue = new Queue('notifications', { connection });

// Define workers
const slaWorker = new Worker('sla-checks', slaProcessor, {
  connection,
  concurrency: 10,
  limiter: {
    max: 100,
    duration: 1000,
  },
});
```

### Prisma 5.x

**Type-safe ORM with excellent TypeScript integration.**

#### Why Prisma?

| Benefit | Description |
|---------|-------------|
| Type Safety | Generated types from schema |
| Migrations | Declarative schema migrations |
| Relations | Easy eager loading |
| Query Builder | Intuitive, type-safe queries |

#### Schema Example

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String
  role         Role     @default(USER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tickets      Ticket[] @relation("CreatedTickets")
  assignedTickets Ticket[] @relation("AssignedTickets")

  @@index([email])
}
```

### Zod 3.x

**TypeScript-first schema validation.**

#### Usage Patterns

```typescript
import { z } from 'zod';

// Request validation
const CreateTicketSchema = z.object({
  subject: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  channel: z.enum(['web', 'email', 'chat']).default('web'),
});

type CreateTicketDTO = z.infer<typeof CreateTicketSchema>;

// Validation middleware
const validate = (schema: ZodSchema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.flatten() });
  }
  req.validated = result.data;
  next();
};
```

---

## Frontend Technologies

### Next.js 14+ (App Router)

**React framework for production with server-side capabilities.**

#### Features Used

| Feature | Purpose |
|---------|---------|
| App Router | File-based routing with layouts |
| Server Components | Initial data fetching |
| Server Actions | Form mutations |
| Middleware | Auth checks, redirects |
| Image Optimization | Automatic image handling |

#### Project Structure

```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── tickets/
│   │   ├── knowledge-base/
│   │   └── settings/
│   ├── (public)/
│   │   └── kb/
│   ├── api/
│   └── layout.tsx
├── components/
│   ├── ui/           # Base components
│   ├── forms/        # Form components
│   └── features/     # Feature-specific
├── hooks/
├── lib/
└── services/
```

### Tailwind CSS

**Utility-first CSS framework.**

#### Configuration

```javascript
// tailwind.config.js
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { /* brand colors */ },
        accent: { /* accent colors */ },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
```

### State Management

#### TanStack Query (React Query)

For server state management:

```typescript
// Fetching tickets
const { data, isLoading } = useQuery({
  queryKey: ['tickets', filters],
  queryFn: () => ticketService.list(filters),
  staleTime: 30_000,
});

// Mutations
const mutation = useMutation({
  mutationFn: ticketService.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
  },
});
```

#### Zustand

For client-only state:

```typescript
// UI state store
const useUIStore = create((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));

// Socket state store
const useSocketStore = create((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}));
```

### React Hook Form + Zod

**Forms with validation.**

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const form = useForm<CreateTicketDTO>({
  resolver: zodResolver(CreateTicketSchema),
  defaultValues: {
    priority: 'medium',
    channel: 'web',
  },
});
```

---

## Data Layer

### PostgreSQL 15+

**Primary relational database.**

#### Key Features Used

| Feature | Purpose |
|---------|---------|
| JSONB | Flexible automation rules storage |
| Full-text Search | Ticket and KB article search |
| Indexes | Performance optimization |
| Triggers | Audit logging automation |
| Row-Level Security | Multi-tenant isolation (future) |

#### Configuration

```sql
-- Key PostgreSQL settings
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';
```

### Valkey 7+

**Redis-compatible in-memory data store.**

#### Why Valkey?

Valkey is an open-source fork of Redis, fully compatible with Redis protocol:

| Benefit | Description |
|---------|-------------|
| Open Source | Linux Foundation governance |
| Redis Compatible | Drop-in replacement, same clients |
| Community Driven | Active development, no licensing concerns |
| Production Ready | Battle-tested in large deployments |

#### Usage Patterns

```typescript
import { createClient } from 'valkey';

const client = createClient({
  url: process.env.VALKEY_URL,
});

// Caching
await client.setEx(`user:${id}`, 3600, JSON.stringify(user));
const cached = await client.get(`user:${id}`);

// Rate limiting
await client.incr(`ratelimit:${ip}`);
await client.expire(`ratelimit:${ip}`, 60);

// Pub/Sub
await client.publish('ticket:update', JSON.stringify(event));
```

#### Data Separation

```
Valkey Instance 1 (Cache):
├── sessions:*           # User sessions
├── cache:tickets:*      # Ticket list cache
├── cache:kb:*           # Knowledge base cache
└── ratelimit:*          # Rate limiting counters

Valkey Instance 2 (Queues):
├── bull:sla-checks:*    # SLA queue
├── bull:notifications:* # Notification queue
└── bull:analytics:*     # Analytics queue
```

---

## Infrastructure & DevOps

### Container Runtime

**Docker + Docker Compose for development, container orchestration for production.**

```yaml
# docker-compose.yml
services:
  api:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://...
      - VALKEY_URL=valkey://valkey:6379
    depends_on:
      - postgres
      - valkey

  worker:
    build: ./backend
    command: bun run worker
    depends_on:
      - valkey

  postgres:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data

  valkey:
    image: valkey/valkey:7-alpine
    volumes:
      - valkey_data:/data
```

### CI/CD

**GitHub Actions for continuous integration and deployment.**

### Monitoring Stack

| Tool | Purpose |
|------|---------|
| Prometheus | Metrics collection |
| Grafana | Dashboards, visualization |
| Pino + Loki | Log aggregation |
| Sentry | Error tracking |
| Uptime Kuma | Availability monitoring |

---

## Decision Rationale

### Why This Stack?

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| **Bun over Node.js** | Faster execution, native TS, all-in-one tooling | Node.js + tsx, Deno |
| **Express over Fastify** | Larger ecosystem, more middleware, team familiarity | Fastify, Hono, Elysia |
| **Valkey over Redis** | Open source, no licensing concerns, same API | Redis, KeyDB, Dragonfly |
| **PostgreSQL over MySQL** | Better JSON support, full-text search, advanced indexing | MySQL, CockroachDB |
| **Prisma over TypeORM** | Better type safety, cleaner migrations, excellent DX | TypeORM, Drizzle, Kysely |
| **Socket.IO over ws** | Built-in rooms, reconnection, fallbacks | ws, µWebSockets |
| **Next.js over Vite+React** | SSR, file routing, API routes, deployment options | Vite, Remix |

---

## Version Compatibility Matrix

| Package | Minimum Version | Tested Version |
|---------|-----------------|----------------|
| Bun | 1.1.0 | 1.1.30 |
| Express | 4.18.0 | 4.21.0 |
| Next.js | 14.0.0 | 14.2.0 |
| TypeScript | 5.0.0 | 5.6.0 |
| PostgreSQL | 15.0 | 16.0 |
| Valkey | 7.0.0 | 7.2.0 |
| Prisma | 5.0.0 | 5.20.0 |
| Socket.IO | 4.6.0 | 4.8.0 |
| BullMQ | 5.0.0 | 5.20.0 |

---

## Related Documents

- [Architecture Overview](./overview.md)
- [Infrastructure](./infrastructure.md)
- [Database Schema](../02-database/schema.md)

---

*Next: [Infrastructure →](./infrastructure.md)*
