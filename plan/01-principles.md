# 01 - Solo Developer Principles

> **The mindset and decision framework for building InsightDesk alone**

---

## 🎯 The Solo Developer Reality

Building a production application alone is fundamentally different from team development. This document establishes the principles that will guide every decision in InsightDesk.

### What Changes When You're Solo

| Team Development          | Solo Development               |
| ------------------------- | ------------------------------ |
| Specialized roles         | You do everything              |
| Code reviews catch issues | Tests and linting catch issues |
| Knowledge is distributed  | Knowledge is in your head      |
| Can parallelize work      | Sequential focus is key        |
| Complex patterns OK       | Simplicity is survival         |
| Microservices possible    | Monolith is mandatory          |

---

## 📐 Core Principles

### 1. PostgreSQL is Your Best Friend

```typescript
// ❌ DON'T: Add infrastructure for every problem
const redis = new Redis();        // Cache
const rabbitmq = new RabbitMQ();  // Queue
const mongodb = new MongoDB();    // Documents
const elastic = new Elastic();    // Search

// ✅ DO: PostgreSQL handles almost everything
const db = drizzle(postgres(DATABASE_URL));

// Caching → PostgreSQL with smart queries + Valkey for hot data
// Queues → pg-boss (uses PostgreSQL)
// Documents → JSONB columns
// Search → PostgreSQL full-text search (to start)
```

**Why?** Every new database is:
- Another thing to learn
- Another thing to monitor
- Another thing that can fail
- Another backup strategy

### 2. Monolith First, Always

```
❌ Microservices Architecture (for solo dev)
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ Tickets │ │  Users  │ │  Chat   │ │  Email  │
│ Service │ │ Service │ │ Service │ │ Service │
└────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
     │           │           │           │
     └───────────┴───────────┴───────────┘
                      │
              API Gateway (another service!)


✅ Modular Monolith (solo-friendly)
┌─────────────────────────────────────────┐
│              Express Server              │
├─────────┬─────────┬─────────┬───────────┤
│ tickets │  users  │  chat   │   email   │
│ module  │ module  │ module  │  module   │
└─────────┴─────────┴─────────┴───────────┘
                    │
             Single Database
```

### 3. Vertical Slices Over Horizontal Layers

```typescript
// ❌ Horizontal: Build all controllers, then all services, then all repos
// Week 1: All controllers (no working features)
// Week 2: All services (still no working features)
// Week 3: All repos (finally something works?)

// ✅ Vertical: Complete one feature at a time
// Week 1: Ticket creation (route → controller → service → db → UI)
// Week 2: Ticket listing (route → controller → service → db → UI)
// Result: Working features from day one!
```

### 4. Type Safety is Your Code Review

```typescript
// When you're solo, TypeScript catches what a teammate would

// ❌ Runtime error waiting to happen
function createTicket(data: any) {
  return db.insert(tickets).values(data);
}

// ✅ Compiler catches issues before runtime
interface CreateTicketInput {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  customerId: string;
}

function createTicket(data: CreateTicketInput) {
  return db.insert(tickets).values({
    ...data,
    status: 'open',
    createdAt: new Date(),
  });
}
```

### 5. Ship Early, Iterate Often

```
❌ Waterfall (risky for solo)
┌─────────────────────────────────────────────────────┐
│ Month 1-2: Build everything → Month 3: Hope it works │
└─────────────────────────────────────────────────────┘

✅ Iterative (safe for solo)
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ Week 2  │ │ Week 4  │ │ Week 6  │ │ Week 8  │
│ MVP v1  │ │ MVP v2  │ │ Beta    │ │ Launch  │
│ Deploy! │ │ Deploy! │ │ Deploy! │ │ Deploy! │
└─────────┘ └─────────┘ └─────────┘ └─────────┘
```

---

## 🚫 Anti-Patterns to Avoid

### 1. Premature Abstraction

```typescript
// ❌ Over-engineered from day one
interface ITicketRepository {
  findById(id: string): Promise<Ticket>;
  findAll(filters: TicketFilters): Promise<Ticket[]>;
  create(data: CreateTicketDTO): Promise<Ticket>;
  update(id: string, data: UpdateTicketDTO): Promise<Ticket>;
  delete(id: string): Promise<void>;
}

class PostgresTicketRepository implements ITicketRepository {
  // 100+ lines of abstraction
}

class TicketRepositoryFactory {
  static create(type: 'postgres' | 'mysql' | 'mongodb'): ITicketRepository {
    // You'll never switch databases
  }
}

// ✅ Just write the code you need
// src/services/tickets.ts
export async function getTicket(id: string) {
  return db.query.tickets.findFirst({
    where: eq(tickets.id, id),
    with: { customer: true, assignee: true },
  });
}

export async function createTicket(data: CreateTicketInput) {
  return db.insert(tickets).values(data).returning();
}
```

### 2. Unnecessary Indirection

```typescript
// ❌ Too many layers
// route → controller → service → repository → mapper → entity → database
// 7 files for one operation!

// ✅ Pragmatic layers
// route → controller (thin) → service (business logic) → database
// 3-4 files, clear responsibilities
```

### 3. Perfect Before Progress

```typescript
// ❌ Perfecting error handling before you have features
class TicketNotFoundError extends BaseError {
  constructor(id: string) {
    super(`Ticket ${id} not found`, 'TICKET_NOT_FOUND', 404);
  }
}

class TicketPermissionError extends BaseError { /* ... */ }
class TicketValidationError extends BaseError { /* ... */ }
class TicketStateError extends BaseError { /* ... */ }
// 20 error classes before first feature works

// ✅ Start simple, refine later
throw new Error(`Ticket ${id} not found`);
// Add structured errors when patterns emerge
```

---

## ✅ Patterns to Embrace

### 1. Convention Over Configuration

```typescript
// File: src/routes/tickets.ts
// Convention: filename = route prefix
router.get('/', ticketController.list);      // GET /tickets
router.get('/:id', ticketController.get);    // GET /tickets/:id
router.post('/', ticketController.create);   // POST /tickets
router.patch('/:id', ticketController.update); // PATCH /tickets/:id

// No configuration file needed - the structure IS the configuration
```

### 2. Colocation

```
// ❌ Features spread across many folders
src/
├── controllers/
│   ├── ticketController.ts
│   └── userController.ts
├── services/
│   ├── ticketService.ts
│   └── userService.ts
├── repositories/
│   ├── ticketRepository.ts
│   └── userRepository.ts
└── validators/
    ├── ticketValidator.ts
    └── userValidator.ts

// ✅ Features together
src/
├── modules/
│   ├── tickets/
│   │   ├── tickets.routes.ts
│   │   ├── tickets.controller.ts
│   │   ├── tickets.service.ts
│   │   └── tickets.schema.ts
│   └── users/
│       ├── users.routes.ts
│       ├── users.controller.ts
│       ├── users.service.ts
│       └── users.schema.ts
```

### 3. Smart Defaults

```typescript
// src/lib/config.ts
export const config = {
  // Sensible defaults - override only when needed
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
  tickets: {
    defaultPriority: 'medium' as const,
    autoCloseAfterDays: 7,
  },
  sla: {
    responseTime: {
      low: 24 * 60,      // 24 hours in minutes
      medium: 8 * 60,    // 8 hours
      high: 4 * 60,      // 4 hours
      urgent: 1 * 60,    // 1 hour
    },
  },
};
```

### 4. Feature Flags (Simple Version)

```typescript
// src/lib/features.ts
export const features = {
  // Start with simple booleans
  enableLiveChat: process.env.FEATURE_LIVE_CHAT === 'true',
  enableSLATracking: process.env.FEATURE_SLA === 'true',
  enableEmailIntegration: process.env.FEATURE_EMAIL === 'true',
} as const;

// Usage
if (features.enableLiveChat) {
  registerChatRoutes(app);
}
```

---

## 📅 Decision Framework

When facing a technical decision, ask these questions in order:

### 1. Do I Need This Now?

```
Question: Should I add Elasticsearch for search?

Analysis:
- Current tickets: 0 (you're just starting!)
- PostgreSQL full-text search handles: 100,000+ rows easily
- Elasticsearch adds: complexity, RAM, learning curve

Decision: NO - Start with PostgreSQL, add Elasticsearch if/when needed
```

### 2. What's the Simplest Solution?

```
Question: How should I handle background jobs?

Options:
A) Kubernetes CronJobs + Redis + Celery
B) BullMQ + Redis
C) pg-boss (uses PostgreSQL)
D) setTimeout in Node.js

Analysis:
- A: Way too complex for solo dev
- B: Adds Redis as hard dependency
- C: Uses existing PostgreSQL ✓
- D: Too simple, no persistence

Decision: C - pg-boss (already have PostgreSQL)
```

### 3. Will I Understand This in 6 Months?

```typescript
// ❌ Clever code (will confuse future you)
const getTickets = (f) => (s) => (p) => 
  db.query.tickets.findMany({ where: f, orderBy: s, ...p });

// ✅ Boring code (future you will thank you)
async function getTickets(options: {
  filters?: TicketFilters;
  sort?: SortOptions;
  pagination?: PaginationOptions;
}) {
  const { filters, sort, pagination } = options;
  
  return db.query.tickets.findMany({
    where: buildFilters(filters),
    orderBy: buildSort(sort),
    limit: pagination?.limit ?? 20,
    offset: pagination?.offset ?? 0,
  });
}
```

---

## 🎯 Time Investment Guidelines

### Where to Spend Time

| Area                   | Investment | Reason                    |
| ---------------------- | ---------- | ------------------------- |
| Database Schema        | High       | Changing later is painful |
| API Design             | High       | Clients depend on it      |
| Core Business Logic    | High       | This is your product      |
| Testing Critical Paths | High       | Prevents disasters        |
| Type Definitions       | Medium     | Catches bugs early        |
| Dev Experience         | Medium     | Speeds up everything      |
| Documentation          | Medium     | Future you needs this     |

### Where to Save Time

| Area                   | Investment | Reason                 |
| ---------------------- | ---------- | ---------------------- |
| UI Polish (initially)  | Low        | Iterate after feedback |
| Premature Optimization | Low        | Profile first          |
| Perfect Error Messages | Low        | Improve over time      |
| Admin Dashboard        | Low        | Direct DB queries work |
| Fancy Animations       | Low        | Function over form     |

---

## 💪 Motivation for the Journey

### The Solo Developer Advantage

1. **No Meetings** - More coding time
2. **No Consensus** - Faster decisions
3. **No Politics** - Pure technical focus
4. **Full Context** - You know everything
5. **Complete Ownership** - Your vision, your way

### When It Gets Hard

Remember:
- Every expert was once a beginner
- Every large app started as a small one
- Shipping imperfect code beats perfect code never shipped
- Your users care about features, not architecture

### Success Metrics

| Metric | Target                           |
| ------ | -------------------------------- |
| Week 2 | First deployment with basic auth |
| Week 4 | Tickets CRUD working end-to-end  |
| Week 6 | Real-time updates functioning    |
| Week 8 | MVP ready for beta users         |

---

## 📋 Checklist Before Starting

- [ ] Understood that PostgreSQL handles most needs
- [ ] Accepted monolith architecture
- [ ] Committed to vertical slice development
- [ ] Set up TypeScript strict mode
- [ ] Ready to ship early and often
- [ ] Bookmarked this document for tough days

---

## Next Steps

→ Continue to [02-tech-stack.md](./02-tech-stack.md) to learn about every tool we'll use.
