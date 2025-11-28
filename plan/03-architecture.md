# 03 - System Architecture

> **How the pieces fit together: Express backend, Next.js frontend, Docker orchestration**

---

## 🏗️ High-Level Architecture

InsightDesk uses a **separated frontend/backend architecture** running in Docker containers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Docker Compose Network                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                        Frontend Container                       │   │
│   │  ┌───────────────────────────────────────────────────────────┐  │   │
│   │  │                    Next.js 16 (:3000)                     │  │   │
│   │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  │   │
│   │  │  │  Pages   │ │Components│ │  Hooks   │ │ API Client   │  │  │   │
│   │  │  │  (RSC)   │ │ (shadcn) │ │(TanStack)│ │(fetch+socket)│  │  │   │
│   │  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │  │   │
│   │  └───────────────────────────────────────────────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    │ HTTP + WebSocket                   │
│                                    ▼                                    │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                        Backend Container                        │   │
│   │  ┌───────────────────────────────────────────────────────────┐  │   │
│   │  │                   Express 5.1 (:3001)                     │  │   │
│   │  │  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────┐ │  │   │
│   │  │  │  Routes  │ │Controllers│ │ Services │ │  Socket.IO   │ │  │   │
│   │  │  └──────────┘ └───────────┘ └──────────┘ └──────────────┘ │  │   │
│   │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                   │  │   │
│   │  │  │ BullMQ   │ │  Auth    │ │Middleware│                   │  │   │
│   │  │  │  (jobs)  │ │(Better)  │ │(validate)│                   │  │   │
│   │  │  └──────────┘ └──────────┘ └──────────┘                   │  │   │
│   │  └───────────────────────────────────────────────────────────┘  │   │
│   └─────────────────────────┬──────────────────────┬────────────────┘   │
│                             │                      │                    │
│                             ▼                      ▼                    │
│  ┌─────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │      PostgreSQL 17 (:5432)      │  │      Valkey 8.0 (:6379)      │  │
│  │  ┌───────────────────────────┐  │  │  ┌───────────────────────┐   │  │
│  │  │       App Data Tables     │  │  │  │  Socket.IO Adapter    │   │  │
│  │  │                           │  │  │  │  BullMQ Job Queues    │   │  │
│  │  └───────────────────────────┘  │  │  │  Session Cache        │   │  │
│  └─────────────────────────────────┘  │  │  Rate Limiting        │   │  │
│                                       │  └───────────────────────┘   │  │
│                                       └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Complete Project Structure

```
insight-desk/
│
├── docker-compose.yml              # All services orchestration
├── docker-compose.dev.yml          # Development overrides
├── .env.example                    # Environment template
├── .env                            # Local secrets (git ignored)
├── .gitignore
├── README.md
│
├── frontend/                       # Next.js 16 Application
│   ├── Dockerfile
│   ├── package.json
│   ├── bun.lockb
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── components.json            # shadcn/ui config
│   │
│   ├── public/
│   │   ├── favicon.ico
│   │   └── images/
│   │
│   └── src/
│       ├── app/                   # App Router (pages)
│       │   ├── layout.tsx         # Root layout
│       │   ├── page.tsx           # Landing page
│       │   ├── globals.css        # Tailwind imports
│       │   │
│       │   ├── (auth)/            # Auth group (no layout)
│       │   │   ├── login/page.tsx
│       │   │   ├── register/page.tsx
│       │   │   └── forgot-password/page.tsx
│       │   │
│       │   ├── (customer)/        # Customer portal
│       │   │   ├── layout.tsx
│       │   │   ├── portal/page.tsx
│       │   │   ├── tickets/
│       │   │   │   ├── page.tsx
│       │   │   │   ├── new/page.tsx
│       │   │   │   └── [id]/page.tsx
│       │   │   └── settings/page.tsx
│       │   │
│       │   ├── (agent)/           # Agent dashboard
│       │   │   ├── layout.tsx
│       │   │   ├── dashboard/page.tsx
│       │   │   ├── inbox/page.tsx
│       │   │   ├── tickets/[id]/page.tsx
│       │   │   └── customers/page.tsx
│       │   │
│       │   └── (admin)/           # Admin panel
│       │       ├── layout.tsx
│       │       ├── admin/page.tsx
│       │       ├── admin/team/page.tsx
│       │       ├── admin/sla/page.tsx
│       │       └── admin/settings/page.tsx
│       │
│       ├── components/
│       │   ├── ui/                # shadcn/ui components
│       │   │   ├── button.tsx
│       │   │   ├── card.tsx
│       │   │   ├── dialog.tsx
│       │   │   ├── dropdown-menu.tsx
│       │   │   ├── input.tsx
│       │   │   ├── select.tsx
│       │   │   ├── table.tsx
│       │   │   ├── tabs.tsx
│       │   │   ├── textarea.tsx
│       │   │   └── toast.tsx
│       │   │
│       │   ├── layout/            # Layout components
│       │   │   ├── header.tsx
│       │   │   ├── sidebar.tsx
│       │   │   ├── footer.tsx
│       │   │   └── mobile-nav.tsx
│       │   │
│       │   ├── tickets/           # Ticket components
│       │   │   ├── ticket-card.tsx
│       │   │   ├── ticket-list.tsx
│       │   │   ├── ticket-form.tsx
│       │   │   ├── ticket-detail.tsx
│       │   │   ├── ticket-messages.tsx
│       │   │   ├── ticket-sidebar.tsx
│       │   │   └── ticket-filters.tsx
│       │   │
│       │   ├── chat/              # Chat components
│       │   │   ├── chat-window.tsx
│       │   │   ├── message-bubble.tsx
│       │   │   ├── message-input.tsx
│       │   │   └── typing-indicator.tsx
│       │   │
│       │   └── shared/            # Shared components
│       │       ├── avatar.tsx
│       │       ├── badge.tsx
│       │       ├── loading.tsx
│       │       ├── empty-state.tsx
│       │       └── error-boundary.tsx
│       │
│       ├── hooks/                 # Custom React hooks
│       │   ├── use-tickets.ts
│       │   ├── use-socket.ts
│       │   ├── use-auth.ts
│       │   ├── use-debounce.ts
│       │   └── use-media-query.ts
│       │
│       ├── lib/                   # Utilities
│       │   ├── api.ts             # API client
│       │   ├── socket.ts          # Socket.IO client
│       │   ├── auth-client.ts     # Better Auth client
│       │   ├── query-client.ts    # TanStack Query setup
│       │   ├── utils.ts           # Helper functions
│       │   └── constants.ts       # App constants
│       │
│       ├── stores/                # Zustand stores
│       │   ├── ticket-store.ts
│       │   ├── ui-store.ts
│       │   └── notification-store.ts
│       │
│       └── types/                 # TypeScript types
│           ├── ticket.ts
│           ├── user.ts
│           ├── message.ts
│           └── api.ts
│
├── backend/                       # Express 5.1 API Server
│   ├── Dockerfile
│   ├── package.json
│   ├── bun.lockb
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   │
│   └── src/
│       ├── index.ts               # Entry point
│       ├── app.ts                 # Express app setup
│       ├── server.ts              # HTTP server + Socket.IO
│       │
│       ├── config/                # Configuration
│       │   ├── index.ts           # Config aggregator
│       │   ├── database.ts        # DB config
│       │   ├── auth.ts            # Auth config
│       │   └── features.ts        # Feature flags
│       │
│       ├── db/                    # Database layer
│       │   ├── index.ts           # Drizzle client
│       │   ├── schema/            # Table definitions
│       │   │   ├── index.ts       # Schema exports
│       │   │   ├── users.ts
│       │   │   ├── organizations.ts
│       │   │   ├── tickets.ts
│       │   │   ├── messages.ts
│       │   │   ├── sla.ts
│       │   │   └── activities.ts
│       │   └── migrations/        # Generated migrations
│       │
│       ├── modules/               # Feature modules
│       │   ├── auth/
│       │   │   ├── auth.routes.ts
│       │   │   ├── auth.controller.ts
│       │   │   ├── auth.service.ts
│       │   │   └── auth.schema.ts
│       │   │
│       │   ├── tickets/
│       │   │   ├── tickets.routes.ts
│       │   │   ├── tickets.controller.ts
│       │   │   ├── tickets.service.ts
│       │   │   └── tickets.schema.ts
│       │   │
│       │   ├── users/
│       │   │   ├── users.routes.ts
│       │   │   ├── users.controller.ts
│       │   │   ├── users.service.ts
│       │   │   └── users.schema.ts
│       │   │
│       │   ├── messages/
│       │   │   ├── messages.routes.ts
│       │   │   ├── messages.controller.ts
│       │   │   ├── messages.service.ts
│       │   │   └── messages.schema.ts
│       │   │
│       │   └── organizations/
│       │       ├── orgs.routes.ts
│       │       ├── orgs.controller.ts
│       │       ├── orgs.service.ts
│       │       └── orgs.schema.ts
│       │
│       ├── socket/                # Socket.IO handlers
│       │   ├── index.ts           # Socket setup
│       │   ├── middleware.ts      # Auth middleware
│       │   ├── ticket-handlers.ts
│       │   └── chat-handlers.ts
│       │
│       ├── lib/                   # Shared utilities
│       │   ├── jobs.ts            # BullMQ queues & workers
│       │   ├── cache.ts           # Valkey client
│       │   ├── email.ts           # Nodemailer client
│       │   ├── socket.ts          # Socket.IO instance
│       │   └── logger.ts          # Pino logging
│       │
│       ├── middleware/            # Express middleware
│       │   ├── auth.ts            # Authentication
│       │   ├── validate.ts        # Zod validation
│       │   ├── rate-limit.ts      # Rate limiting
│       │   └── error-handler.ts   # Global error handler
│       │
│       └── types/                 # TypeScript types
│           ├── express.d.ts       # Express extensions
│           └── socket.d.ts        # Socket.IO extensions
│
├── docs-solo/                     # This documentation
│   ├── README.md
│   ├── 01-principles.md
│   ├── 02-tech-stack.md
│   ├── 03-architecture.md        # (this file)
│   └── ... (more docs)
│
└── shared/                        # Shared code (optional)
    └── types/
        ├── ticket.ts
        ├── user.ts
        └── api.ts
```

---

## 🐳 Docker Compose Configuration

### Main Configuration

```yaml
# docker-compose.yml
services:
  # ─────────────────────────────────────────────────────────────
  # Frontend - Next.js 16
  # ─────────────────────────────────────────────────────────────
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:3001
      - NEXT_PUBLIC_WS_URL=ws://localhost:3001
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - insightdesk

  # ─────────────────────────────────────────────────────────────
  # Backend - Express 5.1
  # ─────────────────────────────────────────────────────────────
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - DATABASE_URL=postgresql://insightdesk:${DB_PASSWORD}@db:5432/insightdesk
      - VALKEY_URL=valkey://valkey:6379
      - FRONTEND_URL=http://localhost:3000
      - JWT_SECRET=${JWT_SECRET}
      - RESEND_API_KEY=${RESEND_API_KEY}
    depends_on:
      db:
        condition: service_healthy
      valkey:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - insightdesk

  # ─────────────────────────────────────────────────────────────
  # Database - PostgreSQL 18
  # ─────────────────────────────────────────────────────────────
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
    networks:
      - insightdesk

  # ─────────────────────────────────────────────────────────────
  # Cache - Valkey 9.0
  # ─────────────────────────────────────────────────────────────
  valkey:
    image: valkey/valkey:9.0-alpine
    command: valkey-server --appendonly yes
    volumes:
      - valkey_data:/data
    ports:
      - "6379:6379"
    networks:
      - insightdesk

networks:
  insightdesk:
    driver: bridge

volumes:
  postgres_data:
  valkey_data:
```

### Development Overrides

```yaml
# docker-compose.dev.yml
services:
  frontend:
    build:
      target: development
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next
    environment:
      - NODE_ENV=development
    command: bun run dev

  backend:
    build:
      target: development
    volumes:
      - ./backend:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
    command: bun --watch src/index.ts
```

---

## 🔧 Dockerfiles

### Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM oven/bun:1.3.3-alpine AS base

# ─────────────────────────────────────────────────────────────
# Dependencies stage
# ─────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Development stage
# ─────────────────────────────────────────────────────────────
FROM base AS development
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3001
CMD ["bun", "--watch", "src/index.ts"]

# ─────────────────────────────────────────────────────────────
# Production build
# ─────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun build src/index.ts --outdir dist --target bun

# ─────────────────────────────────────────────────────────────
# Production stage
# ─────────────────────────────────────────────────────────────
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3001
CMD ["bun", "dist/index.js"]
```

### Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
FROM oven/bun:1.3.3-alpine AS base

# ─────────────────────────────────────────────────────────────
# Dependencies stage
# ─────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Development stage
# ─────────────────────────────────────────────────────────────
FROM base AS development
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
CMD ["bun", "run", "dev"]

# ─────────────────────────────────────────────────────────────
# Production build
# ─────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ─────────────────────────────────────────────────────────────
# Production stage
# ─────────────────────────────────────────────────────────────
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["bun", "server.js"]
```

---

## 🔌 Backend Entry Point

```typescript
// backend/src/index.ts
import { createServer } from 'http';
import { app } from './app';
import { setupSocketIO } from './socket';
import { setupJobs } from './jobs';
import { db } from './db';
import { cache } from './lib/cache';
import { config } from './config';

async function bootstrap() {
  console.log('🚀 Starting InsightDesk Backend...');

  // Create HTTP server
  const httpServer = createServer(app);

  // Setup Socket.IO
  const io = await setupSocketIO(httpServer);
  console.log('✅ Socket.IO initialized');

  // Setup background jobs
  await setupJobs();
  console.log('✅ Background jobs initialized');

  // Test database connection
  await db.execute('SELECT 1');
  console.log('✅ Database connected');

  // Test cache connection
  await cache.ping();
  console.log('✅ Valkey connected');

  // Start server
  httpServer.listen(config.port, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎫 InsightDesk API Server                               ║
║                                                           ║
║   📡 HTTP:      http://localhost:${config.port}                 ║
║   🔌 WebSocket: ws://localhost:${config.port}                   ║
║   📚 API Docs:  http://localhost:${config.port}/docs            ║
║                                                           ║
║   Environment: ${config.env.padEnd(40)}║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    httpServer.close();
    await cache.quit();
    console.log('👋 Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
```

---

## 🛣️ Express App Setup

```typescript
// backend/src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/logger';
import { rateLimiter } from './middleware/rate-limit';

// Import routes
import { authRoutes } from './modules/auth/auth.routes';
import { ticketRoutes } from './modules/tickets/tickets.routes';
import { userRoutes } from './modules/users/users.routes';
import { messageRoutes } from './modules/messages/messages.routes';
import { orgRoutes } from './modules/organizations/orgs.routes';

export const app = express();

// ─────────────────────────────────────────────────────────────
// Global Middleware
// ─────────────────────────────────────────────────────────────

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Rate limiting
app.use('/api', rateLimiter);

// ─────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/organizations', orgRoutes);

// ─────────────────────────────────────────────────────────────
// 404 Handler
// ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// ─────────────────────────────────────────────────────────────
// Global Error Handler
// ─────────────────────────────────────────────────────────────
app.use(errorHandler);
```

---

## 📂 Module Pattern

Each feature is organized as a module with consistent structure:

```typescript
// backend/src/modules/tickets/tickets.routes.ts
import { Router } from 'express';
import { ticketController } from './tickets.controller';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { 
  createTicketSchema, 
  updateTicketSchema,
  ticketFiltersSchema 
} from './tickets.schema';

export const ticketRoutes = Router();

// All routes require authentication
ticketRoutes.use(authenticate);

// GET /api/tickets - List tickets with filters
ticketRoutes.get(
  '/',
  validate(ticketFiltersSchema, 'query'),
  ticketController.list
);

// GET /api/tickets/:id - Get single ticket
ticketRoutes.get(
  '/:id',
  ticketController.get
);

// POST /api/tickets - Create ticket
ticketRoutes.post(
  '/',
  validate(createTicketSchema),
  ticketController.create
);

// PATCH /api/tickets/:id - Update ticket
ticketRoutes.patch(
  '/:id',
  validate(updateTicketSchema),
  ticketController.update
);

// POST /api/tickets/:id/assign - Assign ticket
ticketRoutes.post(
  '/:id/assign',
  ticketController.assign
);

// POST /api/tickets/:id/close - Close ticket
ticketRoutes.post(
  '/:id/close',
  ticketController.close
);
```

```typescript
// backend/src/modules/tickets/tickets.controller.ts
import { Request, Response, NextFunction } from 'express';
import { ticketService } from './tickets.service';
import { CreateTicketInput, UpdateTicketInput, TicketFilters } from './tickets.schema';

export const ticketController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = req.query as TicketFilters;
      const userId = req.user!.id;
      const userRole = req.user!.role;
      
      const result = await ticketService.list(filters, userId, userRole);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const ticket = await ticketService.getById(id);
      
      if (!ticket) {
        res.status(404).json({ error: 'Ticket not found' });
        return;
      }
      
      res.json(ticket);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body as CreateTicketInput;
      const customerId = req.user!.id;
      const organizationId = req.user!.organizationId;
      
      const ticket = await ticketService.create({
        ...data,
        customerId,
        organizationId,
      });
      
      res.status(201).json(ticket);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = req.body as UpdateTicketInput;
      
      const ticket = await ticketService.update(id, data);
      res.json(ticket);
    } catch (error) {
      next(error);
    }
  },

  async assign(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { assigneeId } = req.body;
      
      const ticket = await ticketService.assign(id, assigneeId);
      res.json(ticket);
    } catch (error) {
      next(error);
    }
  },

  async close(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { resolution } = req.body;
      
      const ticket = await ticketService.close(id, resolution);
      res.json(ticket);
    } catch (error) {
      next(error);
    }
  },
};
```

```typescript
// backend/src/modules/tickets/tickets.service.ts
import { eq, and, or, ilike, inArray, desc, sql } from 'drizzle-orm';
import { db } from '../../db';
import { tickets, ticketMessages, users } from '../../db/schema';
import { io } from '../../server';
import { boss } from '../../jobs';
import { CreateTicketInput, UpdateTicketInput, TicketFilters } from './tickets.schema';

export const ticketService = {
  async list(filters: TicketFilters, userId: string, userRole: string) {
    const { status, priority, search, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [];

    // Role-based filtering
    if (userRole === 'customer') {
      conditions.push(eq(tickets.customerId, userId));
    }

    if (status?.length) {
      conditions.push(inArray(tickets.status, status));
    }

    if (priority?.length) {
      conditions.push(inArray(tickets.priority, priority));
    }

    if (search) {
      conditions.push(
        or(
          ilike(tickets.title, `%${search}%`),
          ilike(tickets.description, `%${search}%`)
        )
      );
    }

    // Query with pagination
    const [data, countResult] = await Promise.all([
      db.query.tickets.findMany({
        where: conditions.length ? and(...conditions) : undefined,
        orderBy: desc(tickets.createdAt),
        limit,
        offset,
        with: {
          customer: {
            columns: { id: true, name: true, email: true, avatarUrl: true },
          },
          assignee: {
            columns: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      }),
      db.select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(conditions.length ? and(...conditions) : undefined),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total: countResult[0].count,
        totalPages: Math.ceil(countResult[0].count / limit),
      },
    };
  },

  async getById(id: string) {
    return db.query.tickets.findFirst({
      where: eq(tickets.id, id),
      with: {
        customer: true,
        assignee: true,
        messages: {
          orderBy: desc(ticketMessages.createdAt),
          with: {
            sender: {
              columns: { id: true, name: true, avatarUrl: true },
            },
          },
        },
      },
    });
  },

  async create(data: CreateTicketInput & { customerId: string; organizationId: string }) {
    const [ticket] = await db.insert(tickets)
      .values({
        ...data,
        status: 'open',
      })
      .returning();

    // Schedule SLA check
    const slaDeadline = this.calculateSLADeadline(ticket.priority);
    await boss.send('sla:check', { ticketId: ticket.id }, {
      startAfter: slaDeadline,
    });

    // Emit real-time event
    io.to(`org:${data.organizationId}`).emit('ticket:created', ticket);

    return ticket;
  },

  async update(id: string, data: UpdateTicketInput) {
    const [ticket] = await db.update(tickets)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, id))
      .returning();

    // Emit real-time event
    io.to(`ticket:${id}`).emit('ticket:updated', ticket);

    return ticket;
  },

  async assign(id: string, assigneeId: string) {
    const [ticket] = await db.update(tickets)
      .set({
        assigneeId,
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, id))
      .returning();

    // Notify assignee
    io.to(`user:${assigneeId}`).emit('ticket:assigned', ticket);

    return ticket;
  },

  async close(id: string, resolution?: string) {
    const [ticket] = await db.update(tickets)
      .set({
        status: 'closed',
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, id))
      .returning();

    // Emit real-time event
    io.to(`ticket:${id}`).emit('ticket:closed', ticket);

    // Schedule auto-close job cancellation if any
    await boss.cancel('sla:check', { ticketId: id });

    return ticket;
  },

  calculateSLADeadline(priority: string): Date {
    const slaMinutes = {
      low: 24 * 60,      // 24 hours
      medium: 8 * 60,    // 8 hours
      high: 4 * 60,      // 4 hours
      urgent: 60,        // 1 hour
    };

    const minutes = slaMinutes[priority as keyof typeof slaMinutes] || slaMinutes.medium;
    return new Date(Date.now() + minutes * 60 * 1000);
  },
};
```

---

## 📊 Request/Response Flow

```
┌──────────┐   HTTP Request    ┌──────────────┐
│  Client  │ ─────────────────►│   Express    │
└──────────┘                   │    Server    │
                               └──────┬───────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            ▼                            │
         │  ┌──────────────────────────────────────────────────┐  │
         │  │                   Middleware                      │  │
         │  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────────┐  │  │
         │  │  │ Helmet │→│  CORS  │→│  Auth  │→│ Validate  │  │  │
         │  │  └────────┘ └────────┘ └────────┘ └───────────┘  │  │
         │  └──────────────────────────────────────────────────┘  │
         │                            │                            │
         │                            ▼                            │
         │  ┌──────────────────────────────────────────────────┐  │
         │  │                    Router                         │  │
         │  │         Route matching: /api/tickets/:id          │  │
         │  └──────────────────────────────────────────────────┘  │
         │                            │                            │
         │                            ▼                            │
         │  ┌──────────────────────────────────────────────────┐  │
         │  │                  Controller                       │  │
         │  │         Extract params, call service              │  │
         │  └──────────────────────────────────────────────────┘  │
         │                            │                            │
         │                            ▼                            │
         │  ┌──────────────────────────────────────────────────┐  │
         │  │                   Service                         │  │
         │  │    Business logic, database queries, events       │  │
         │  └──────────────────────────────────────────────────┘  │
         │                            │                            │
         │            ┌───────────────┼───────────────┐           │
         │            ▼               ▼               ▼           │
         │     ┌──────────┐   ┌──────────────┐  ┌──────────┐     │
         │     │ Database │   │  Socket.IO   │  │  BullMQ  │     │
         │     │ (Drizzle)│   │   (events)   │  │  (jobs)  │     │
         │     └──────────┘   └──────────────┘  └──────────┘     │
         │                                                        │
         └────────────────────────────────────────────────────────┘
```

---

## 🔐 Environment Configuration

```bash
# .env.example

# ─────────────────────────────────────────────────────────────
# Application
# ─────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000

# ─────────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────────
DB_PASSWORD=your-secure-password
DATABASE_URL=postgresql://insightdesk:${DB_PASSWORD}@localhost:5432/insightdesk

# ─────────────────────────────────────────────────────────────
# Cache
# ─────────────────────────────────────────────────────────────
VALKEY_URL=valkey://localhost:6379

# ─────────────────────────────────────────────────────────────
# Authentication
# ─────────────────────────────────────────────────────────────
JWT_SECRET=your-256-bit-secret-key-here
BETTER_AUTH_SECRET=another-secure-secret

# OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# ─────────────────────────────────────────────────────────────
# Email
# ─────────────────────────────────────────────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=support@yourdomain.com

# ─────────────────────────────────────────────────────────────
# Feature Flags
# ─────────────────────────────────────────────────────────────
FEATURE_LIVE_CHAT=true
FEATURE_SLA=true
FEATURE_EMAIL_INTEGRATION=false
```

---

## 🚀 Development Commands

```bash
# ─────────────────────────────────────────────────────────────
# Full Stack Development
# ─────────────────────────────────────────────────────────────

# Start everything with Docker
docker compose up

# Start with rebuild
docker compose up --build

# Start only infrastructure (for local dev)
docker compose up db valkey -d

# ─────────────────────────────────────────────────────────────
# Backend Development (local)
# ─────────────────────────────────────────────────────────────
cd backend

# Install dependencies
bun install

# Run with hot reload
bun run dev

# Run database migrations
bun run db:migrate

# Open Drizzle Studio
bun run db:studio

# Run tests
bun test

# ─────────────────────────────────────────────────────────────
# Frontend Development (local)
# ─────────────────────────────────────────────────────────────
cd frontend

# Install dependencies
bun install

# Run with hot reload
bun run dev

# Build for production
bun run build

# Run E2E tests
bun run test:e2e
```

---

## Next Steps

→ Continue to [04-database.md](./04-database.md) to design the database schema.
