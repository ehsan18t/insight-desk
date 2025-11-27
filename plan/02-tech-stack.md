# 02 - Technology Stack

> **Every tool and library with exact versions (November 2025)**

---

## 📦 Runtime & Package Management

### Bun 1.3.3

The all-in-one JavaScript runtime that replaces Node.js, npm, and more.

```bash
# Install Bun (Windows via PowerShell)
irm bun.sh/install.ps1 | iex

# Or with npm
npm install -g bun

# Verify installation
bun --version  # 1.3.3
```

**Why Bun?**
- ⚡ 3-4x faster than Node.js for many operations
- 📦 Built-in package manager (replaces npm/yarn/pnpm)
- 🧪 Built-in test runner
- 🔧 Built-in bundler
- ✅ 99% Node.js compatible

```typescript
// bun.lockb is binary (faster) - no more huge lockfiles
// package.json works exactly the same

// Start a project
bun init

// Install dependencies
bun install

// Add a package
bun add express

// Run scripts
bun run dev

// Run TypeScript directly (no compilation step!)
bun src/index.ts
```

---

## 🖥️ Frontend Stack

### Next.js 16

The React framework for production with App Router.

```bash
bun create next-app frontend --typescript --tailwind --app --src-dir
```

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: {
    // React Compiler (automatically optimizes)
    reactCompiler: true,
  },
  images: {
    remotePatterns: [
      { hostname: 'avatars.githubusercontent.com' },
    ],
  },
};

export default config;
```

### React 19.2

The latest React with built-in optimizations.

```typescript
// New in React 19: use() hook for async data
import { use } from 'react';

function TicketDetails({ ticketPromise }: { ticketPromise: Promise<Ticket> }) {
  const ticket = use(ticketPromise);  // Suspense-enabled data fetching
  return <div>{ticket.title}</div>;
}

// New: Actions for forms
function CreateTicketForm() {
  async function createTicket(formData: FormData) {
    'use server';
    const title = formData.get('title') as string;
    // Server-side mutation
  }

  return (
    <form action={createTicket}>
      <input name="title" required />
      <button type="submit">Create</button>
    </form>
  );
}
```

### TypeScript 5.9

Strict type safety across the entire codebase.

```json
// frontend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["DOM", "DOM.Iterable", "ES2024"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Tailwind CSS 4.1

Utility-first CSS with the new Oxide engine.

```css
/* src/app/globals.css */
@import "tailwindcss";

/* Custom design tokens */
@theme {
  --color-brand-50: #eff6ff;
  --color-brand-500: #3b82f6;
  --color-brand-600: #2563eb;
  --color-brand-700: #1d4ed8;
  
  --font-sans: 'Inter Variable', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

```tsx
// Component example with Tailwind 4
function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <h3 className="font-semibold text-gray-900">{ticket.title}</h3>
      <p className="mt-1 text-sm text-gray-600 line-clamp-2">
        {ticket.description}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className={cn(
          "px-2 py-0.5 rounded-full text-xs font-medium",
          priorityColors[ticket.priority]
        )}>
          {ticket.priority}
        </span>
      </div>
    </div>
  );
}
```

### shadcn/ui

Copy-paste component library built on Radix UI.

```bash
# Initialize shadcn in your project
bunx shadcn@latest init

# Add components as needed
bunx shadcn@latest add button card dialog dropdown-menu
bunx shadcn@latest add form input label textarea select
bunx shadcn@latest add table tabs toast avatar badge
```

```tsx
// Components are in your codebase - full control
// src/components/ui/button.tsx
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ 
  className, 
  variant = 'default', 
  size = 'md',
  ...props 
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
```

### Zustand 5.0

Lightweight state management.

```typescript
// src/stores/ticket-store.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface TicketState {
  selectedTicketId: string | null;
  filters: TicketFilters;
  setSelectedTicket: (id: string | null) => void;
  setFilters: (filters: Partial<TicketFilters>) => void;
  resetFilters: () => void;
}

const defaultFilters: TicketFilters = {
  status: [],
  priority: [],
  assignee: null,
};

export const useTicketStore = create<TicketState>()(
  devtools(
    persist(
      (set) => ({
        selectedTicketId: null,
        filters: defaultFilters,
        
        setSelectedTicket: (id) => set({ selectedTicketId: id }),
        
        setFilters: (newFilters) => set((state) => ({
          filters: { ...state.filters, ...newFilters },
        })),
        
        resetFilters: () => set({ filters: defaultFilters }),
      }),
      { name: 'ticket-store' }
    )
  )
);
```

### TanStack Query 5.90

Server state management and caching.

```typescript
// src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      gcTime: 1000 * 60 * 5, // 5 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// src/hooks/use-tickets.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useTickets(filters?: TicketFilters) {
  return useQuery({
    queryKey: ['tickets', filters],
    queryFn: () => api.tickets.list(filters),
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.tickets.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
```

---

## ⚙️ Backend Stack

### Express 5.1

Mature, battle-tested web framework.

```typescript
// backend/src/index.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { errorHandler } from './middleware/error-handler';
import { routes } from './routes';

const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
});

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api', routes);

// Error handling (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export { io };
```

### Zod 4.0

Runtime type validation.

```typescript
// backend/src/schemas/ticket.schema.ts
import { z } from 'zod';

export const createTicketSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(10000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  categoryId: z.string().uuid().optional(),
  tags: z.array(z.string()).max(10).default([]),
});

export const updateTicketSchema = createTicketSchema.partial().extend({
  status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

export const ticketFiltersSchema = z.object({
  status: z.array(z.enum(['open', 'pending', 'resolved', 'closed'])).optional(),
  priority: z.array(z.enum(['low', 'medium', 'high', 'urgent'])).optional(),
  assigneeId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Type inference from schema
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type TicketFilters = z.infer<typeof ticketFiltersSchema>;
```

### Validation Middleware

```typescript
// backend/src/middleware/validate.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = schema.parse(req[target]);
      req[target] = data; // Replace with validated/transformed data
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}

// Usage in routes
router.post(
  '/',
  validate(createTicketSchema),
  ticketController.create
);
```

---

## 🗄️ Database Stack

### PostgreSQL 18

The world's most advanced open-source database.

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: insightdesk
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: insightdesk
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U insightdesk"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### Drizzle ORM 0.44

Type-safe ORM with SQL-like syntax.

```typescript
// backend/src/db/schema/tickets.ts
import { pgTable, text, timestamp, pgEnum, uuid, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { organizations } from './organizations';

export const ticketStatusEnum = pgEnum('ticket_status', [
  'open', 'pending', 'resolved', 'closed'
]);

export const ticketPriorityEnum = pgEnum('ticket_priority', [
  'low', 'medium', 'high', 'urgent'
]);

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Core fields
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: ticketStatusEnum('status').notNull().default('open'),
  priority: ticketPriorityEnum('priority').notNull().default('medium'),
  
  // Relationships
  customerId: uuid('customer_id').notNull().references(() => users.id),
  assigneeId: uuid('assignee_id').references(() => users.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  
  // Metadata
  tags: text('tags').array().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at'),
  closedAt: timestamp('closed_at'),
});

export const ticketRelations = relations(tickets, ({ one, many }) => ({
  customer: one(users, {
    fields: [tickets.customerId],
    references: [users.id],
    relationName: 'customer_tickets',
  }),
  assignee: one(users, {
    fields: [tickets.assigneeId],
    references: [users.id],
    relationName: 'assigned_tickets',
  }),
  organization: one(organizations, {
    fields: [tickets.organizationId],
    references: [organizations.id],
  }),
  messages: many(ticketMessages),
  activities: many(ticketActivities),
}));
```

### Migrations with Drizzle Kit

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema/*',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

```bash
# Generate migration from schema changes
bun drizzle-kit generate

# Apply migrations
bun drizzle-kit migrate

# Open Drizzle Studio (GUI)
bun drizzle-kit studio
```

---

## 🔐 Authentication

### Better Auth 1.x

Simple, secure authentication library.

```typescript
// backend/src/lib/auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // Update session every 24 hours
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
});

// Auth routes
// POST /api/auth/sign-up
// POST /api/auth/sign-in
// POST /api/auth/sign-out
// GET  /api/auth/session
```

```typescript
// Frontend client
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

export const { useSession, signIn, signUp, signOut } = authClient;
```

---

## 🔄 Real-time

### Socket.IO 4.8

Full-duplex communication with rooms and namespaces.

```typescript
// backend/src/socket/index.ts
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/valkey-adapter';
import { createClient } from 'valkey';

export async function setupSocketIO(io: Server) {
  // Valkey adapter for horizontal scaling
  const pubClient = createClient({ url: process.env.VALKEY_URL });
  const subClient = pubClient.duplicate();
  
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  
  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    try {
      const session = await verifySession(token);
      socket.data.user = session.user;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });
  
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.user.id;
    
    // Join user's personal room
    socket.join(`user:${userId}`);
    
    // Join organization room
    socket.join(`org:${socket.data.user.organizationId}`);
    
    // Handle events
    socket.on('ticket:subscribe', (ticketId: string) => {
      socket.join(`ticket:${ticketId}`);
    });
    
    socket.on('ticket:unsubscribe', (ticketId: string) => {
      socket.leave(`ticket:${ticketId}`);
    });
    
    socket.on('chat:message', async (data) => {
      // Handle chat message
    });
    
    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected`);
    });
  });
}
```

---

## ⏰ Background Jobs

### pg-boss 10.x

PostgreSQL-based job queue.

```typescript
// backend/src/jobs/index.ts
import PgBoss from 'pg-boss';

export const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
  retryLimit: 3,
  retryDelay: 30, // seconds
  retryBackoff: true,
  expireInHours: 24,
});

// Job handlers
boss.work('email:send', async (job) => {
  const { to, subject, html } = job.data;
  await sendEmail({ to, subject, html });
});

boss.work('sla:check', async (job) => {
  const { ticketId } = job.data;
  await checkSLABreaches(ticketId);
});

boss.work('ticket:auto-close', async (job) => {
  const { ticketId } = job.data;
  await autoCloseTicket(ticketId);
});

// Schedule recurring jobs
await boss.schedule('sla:check-all', '*/5 * * * *'); // Every 5 minutes

// Start the boss
await boss.start();
```

```typescript
// Using jobs in services
// backend/src/services/tickets.ts
import { boss } from '../jobs';

export async function createTicket(data: CreateTicketInput) {
  const ticket = await db.insert(tickets).values(data).returning();
  
  // Schedule SLA breach check
  const slaDeadline = calculateSLADeadline(ticket.priority);
  await boss.send('sla:check', { ticketId: ticket.id }, {
    startAfter: slaDeadline,
  });
  
  // Send notification email
  await boss.send('email:send', {
    to: data.customerEmail,
    subject: `Ticket #${ticket.id} created`,
    html: renderTicketCreatedEmail(ticket),
  });
  
  return ticket;
}
```

---

## 🗃️ Caching

### Valkey 9.0

Redis-compatible cache (Redis fork).

```typescript
// backend/src/lib/cache.ts
import { createClient } from 'valkey';

export const cache = createClient({
  url: process.env.VALKEY_URL,
});

await cache.connect();

// Cache utilities
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds = 300
): Promise<T> {
  const existing = await cache.get(key);
  if (existing) {
    return JSON.parse(existing) as T;
  }
  
  const result = await fn();
  await cache.setEx(key, ttlSeconds, JSON.stringify(result));
  return result;
}

// Usage
const ticket = await cached(
  `ticket:${ticketId}`,
  () => getTicketFromDb(ticketId),
  60 // Cache for 1 minute
);

// Invalidation
await cache.del(`ticket:${ticketId}`);
```

---

## 🧪 Testing

### Vitest 4.0

Fast unit and integration testing.

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules', 'dist', '**/*.d.ts'],
    },
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

```typescript
// backend/src/services/__tests__/tickets.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTicket, getTicket } from '../tickets';
import { db } from '../../db';

describe('Ticket Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should create a ticket with default values', async () => {
    const input = {
      title: 'Test ticket',
      description: 'This is a test ticket',
      customerId: 'user-123',
      organizationId: 'org-456',
    };
    
    const ticket = await createTicket(input);
    
    expect(ticket).toMatchObject({
      ...input,
      status: 'open',
      priority: 'medium',
    });
    expect(ticket.id).toBeDefined();
    expect(ticket.createdAt).toBeDefined();
  });
});
```

### Playwright 1.57

End-to-end testing.

```typescript
// e2e/tickets.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Ticket Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'agent@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });
  
  test('should create a new ticket', async ({ page }) => {
    await page.click('text=New Ticket');
    await page.fill('[name="title"]', 'Test Ticket');
    await page.fill('[name="description"]', 'This is a test ticket');
    await page.selectOption('[name="priority"]', 'high');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.toast')).toContainText('Ticket created');
    await expect(page.locator('h1')).toContainText('Test Ticket');
  });
});
```

---

## 📦 Complete Package.json Files

### Backend

```json
{
  "name": "insightdesk-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target node",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  },
  "dependencies": {
    "express": "^5.1.0",
    "cors": "^2.8.5",
    "helmet": "^8.0.0",
    "socket.io": "^4.8.0",
    "@socket.io/valkey-adapter": "^0.2.0",
    "valkey": "^9.0.0",
    "drizzle-orm": "^0.44.0",
    "postgres": "^3.4.0",
    "pg-boss": "^10.0.0",
    "better-auth": "^1.0.0",
    "zod": "^4.0.0",
    "resend": "^4.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/cors": "^2.8.17",
    "drizzle-kit": "^0.30.0",
    "vitest": "^4.0.0",
    "@vitest/coverage-v8": "^4.0.0",
    "typescript": "^5.9.0"
  }
}
```

### Frontend

```json
{
  "name": "insightdesk-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@tanstack/react-query": "^5.90.0",
    "zustand": "^5.0.0",
    "socket.io-client": "^4.8.0",
    "better-auth": "^1.0.0",
    "zod": "^4.0.0",
    "@hookform/resolvers": "^4.0.0",
    "react-hook-form": "^7.56.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^3.0.0",
    "lucide-react": "^0.480.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-toast": "^1.2.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "tailwindcss": "^4.1.0",
    "@tailwindcss/typography": "^0.5.0",
    "playwright": "^1.57.0",
    "@playwright/test": "^1.57.0"
  }
}
```

---

## Next Steps

→ Continue to [03-architecture.md](./03-architecture.md) to understand how these pieces fit together.
