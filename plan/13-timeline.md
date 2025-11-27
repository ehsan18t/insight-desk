# 13. Development Timeline & Roadmap

> **Philosophy:** "Ship a working product in 8-10 weeks, not a perfect product never."

## Timeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    InsightDesk MVP Timeline                     │
│                    Total: 8-10 Weeks                            │
├─────────────────────────────────────────────────────────────────┤
│  Phase 1: Foundation (Weeks 1-2)                                │
│  ├── Project setup, Docker, database, auth                     │
│  └── Basic CRUD operations                                      │
├─────────────────────────────────────────────────────────────────┤
│  Phase 2: Core Features (Weeks 3-5)                             │
│  ├── Ticket system complete                                     │
│  ├── Customer portal                                            │
│  └── Agent dashboard                                            │
├─────────────────────────────────────────────────────────────────┤
│  Phase 3: Enhancement (Weeks 6-7)                               │
│  ├── Real-time updates                                          │
│  ├── Background jobs                                            │
│  └── SLA tracking                                               │
├─────────────────────────────────────────────────────────────────┤
│  Phase 4: Polish & Launch (Weeks 8-10)                          │
│  ├── Testing & bug fixes                                        │
│  ├── Production deployment                                      │
│  └── MVP launch!                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation (Weeks 1-2)

### Week 1: Project Setup & Infrastructure

**Goal:** Get the development environment running with authentication.

#### Day 1-2: Project Initialization

```bash
# Create project structure
mkdir insightdesk && cd insightdesk

# Initialize monorepo structure
mkdir -p apps/web apps/api packages/shared

# Initialize frontend (Next.js 16)
cd apps/web
bunx create-next-app@latest . --typescript --tailwind --eslint --app --turbopack

# Initialize backend (Express 5.1)
cd ../api
bun init
bun add express@5.1 cors helmet
bun add -D @types/express @types/cors typescript tsx

# Initialize shared types
cd ../../packages/shared
bun init
bun add zod
```

**Checklist:**
- [ ] Git repository created
- [ ] Monorepo structure in place
- [ ] Next.js 16 app running on localhost:3000
- [ ] Express 5.1 API running on localhost:3001
- [ ] TypeScript configured in both apps
- [ ] Shared package for types/schemas

#### Day 3-4: Docker & Database Setup

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:18
    environment:
      POSTGRES_USER: insightdesk
      POSTGRES_PASSWORD: dev_password_123
      POSTGRES_DB: insightdesk
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  valkey:
    image: valkey/valkey:9.0
    ports:
      - "6379:6379"
    volumes:
      - valkey_data:/data

volumes:
  postgres_data:
  valkey_data:
```

**Checklist:**
- [ ] Docker Compose file created
- [ ] PostgreSQL 18 running
- [ ] Valkey running
- [ ] Database connection verified from API
- [ ] pgAdmin or similar tool set up (optional)

#### Day 5-7: Authentication Setup

```typescript
// apps/api/src/lib/auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
});
```

**Checklist:**
- [ ] Better Auth installed and configured
- [ ] User registration working
- [ ] User login working
- [ ] Session management working
- [ ] Protected routes implemented
- [ ] Auth client set up in Next.js

### Week 2: Database Schema & Basic API

#### Day 1-3: Drizzle Schema Implementation

```typescript
// packages/shared/src/db/schema/index.ts
export * from './users';
export * from './organizations';
export * from './tickets';
export * from './messages';
```

```typescript
// packages/shared/src/db/schema/tickets.ts
import { pgTable, uuid, varchar, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const ticketStatusEnum = pgEnum('ticket_status', [
  'open', 'in_progress', 'waiting_customer', 'waiting_internal', 'resolved', 'closed'
]);

export const ticketPriorityEnum = pgEnum('ticket_priority', [
  'low', 'normal', 'high', 'urgent'
]);

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  customerId: uuid('customer_id').notNull().references(() => users.id),
  assignedToId: uuid('assigned_to_id').references(() => users.id),
  subject: varchar('subject', { length: 255 }).notNull(),
  description: text('description').notNull(),
  status: ticketStatusEnum('status').notNull().default('open'),
  priority: ticketPriorityEnum('priority').notNull().default('normal'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});
```

**Checklist:**
- [ ] User schema complete
- [ ] Organization schema complete
- [ ] Ticket schema complete
- [ ] Message schema complete
- [ ] All relationships defined
- [ ] Indexes created for common queries
- [ ] First migration run successfully

#### Day 4-5: Basic CRUD Endpoints

```typescript
// apps/api/src/routes/tickets.ts
import { Router } from 'express';
import { db } from '../lib/db';
import { tickets } from '@insightdesk/shared/db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

// List tickets (with role-based filtering)
router.get('/', requireAuth, async (req, res) => {
  const { user } = req;
  
  let query = db.select().from(tickets);
  
  if (user.role === 'customer') {
    query = query.where(eq(tickets.customerId, user.id));
  } else if (user.role === 'agent') {
    query = query.where(eq(tickets.organizationId, user.organizationId));
  }
  
  const result = await query.orderBy(desc(tickets.createdAt)).limit(50);
  res.json({ data: result });
});

// Create ticket
router.post('/', requireAuth, async (req, res) => {
  const { subject, description, priority } = req.body;
  
  const [ticket] = await db.insert(tickets).values({
    organizationId: req.user.organizationId,
    customerId: req.user.id,
    subject,
    description,
    priority: priority || 'normal',
  }).returning();
  
  res.status(201).json({ data: ticket });
});

export default router;
```

**Checklist:**
- [ ] GET /api/tickets - List tickets
- [ ] POST /api/tickets - Create ticket
- [ ] GET /api/tickets/:id - Get ticket details
- [ ] PATCH /api/tickets/:id - Update ticket
- [ ] POST /api/tickets/:id/messages - Add message
- [ ] All endpoints have proper auth

#### Day 6-7: Week 2 Polish

**Checklist:**
- [ ] Error handling middleware
- [ ] Request validation with Zod
- [ ] API response formatting consistent
- [ ] Basic logging set up
- [ ] Environment variables organized
- [ ] README updated with setup instructions

### Week 2 Milestone Deliverables

```
✅ User can register and log in
✅ User can create a ticket
✅ User can view their tickets
✅ API is structured and documented
✅ Database schema is solid
```

---

## Phase 2: Core Features (Weeks 3-5)

### Week 3: Ticket System Complete

#### Day 1-2: Ticket Workflow

```typescript
// apps/api/src/services/ticket.service.ts
import { db } from '../lib/db';
import { tickets, ticketActivities } from '@insightdesk/shared/db/schema';
import { eq } from 'drizzle-orm';

export class TicketService {
  static async updateStatus(
    ticketId: string,
    newStatus: TicketStatus,
    userId: string
  ) {
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId));

    if (!ticket) throw new NotFoundError('Ticket not found');

    const [updated] = await db
      .update(tickets)
      .set({
        status: newStatus,
        updatedAt: new Date(),
        resolvedAt: newStatus === 'resolved' ? new Date() : ticket.resolvedAt,
        closedAt: newStatus === 'closed' ? new Date() : ticket.closedAt,
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    // Log activity
    await db.insert(ticketActivities).values({
      ticketId,
      userId,
      action: 'status_changed',
      fromValue: ticket.status,
      toValue: newStatus,
    });

    return updated;
  }

  static async assign(ticketId: string, agentId: string, assignedBy: string) {
    const [updated] = await db
      .update(tickets)
      .set({
        assignedToId: agentId,
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    await db.insert(ticketActivities).values({
      ticketId,
      userId: assignedBy,
      action: 'assigned',
      toValue: agentId,
    });

    return updated;
  }
}
```

**Checklist:**
- [ ] Status transitions working
- [ ] Ticket assignment working
- [ ] Activity logging implemented
- [ ] Priority updates working
- [ ] Ticket history/timeline visible

#### Day 3-4: Message/Reply System

```typescript
// apps/api/src/routes/messages.ts
import { Router } from 'express';
import { db } from '../lib/db';
import { messages, tickets, attachments } from '@insightdesk/shared/db/schema';

const router = Router();

router.post('/tickets/:ticketId/messages', requireAuth, async (req, res) => {
  const { ticketId } = req.params;
  const { content, isInternal } = req.body;
  const userId = req.user.id;

  // Validate user can access ticket
  const ticket = await TicketService.getById(ticketId, userId);
  
  const [message] = await db.insert(messages).values({
    ticketId,
    userId,
    content,
    isInternal: req.user.role !== 'customer' && isInternal,
  }).returning();

  // Update ticket status if customer replies
  if (req.user.role === 'customer' && ticket.status === 'waiting_customer') {
    await TicketService.updateStatus(ticketId, 'open', userId);
  }

  // Update ticket timestamp
  await db.update(tickets)
    .set({ updatedAt: new Date() })
    .where(eq(tickets.id, ticketId));

  res.status(201).json({ data: message });
});

router.get('/tickets/:ticketId/messages', requireAuth, async (req, res) => {
  const { ticketId } = req.params;
  const userId = req.user.id;
  const isStaff = ['agent', 'admin'].includes(req.user.role);

  const ticketMessages = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.ticketId, ticketId),
        // Hide internal notes from customers
        isStaff ? undefined : eq(messages.isInternal, false)
      )
    )
    .orderBy(messages.createdAt);

  res.json({ data: ticketMessages });
});

export default router;
```

**Checklist:**
- [ ] Reply to ticket working
- [ ] Internal notes (hidden from customers)
- [ ] Message timestamps
- [ ] Rich text support (optional, markdown)
- [ ] Conversation thread display

#### Day 5-7: File Attachments

```typescript
// apps/api/src/routes/uploads.ts
import { Router } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '../lib/db';
import { attachments } from '@insightdesk/shared/db/schema';
import { randomUUID } from 'crypto';

const router = Router();

// For MVP: Use local storage or simple S3-compatible (MinIO)
const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT, // Optional: MinIO endpoint
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

router.post('/presigned-url', requireAuth, async (req, res) => {
  const { fileName, contentType, ticketId, messageId } = req.body;
  
  const key = `attachments/${ticketId}/${randomUUID()}-${fileName}`;
  
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

  // Record in database
  const [attachment] = await db.insert(attachments).values({
    ticketId,
    messageId,
    userId: req.user.id,
    fileName,
    contentType,
    storageKey: key,
    status: 'pending',
  }).returning();

  res.json({ uploadUrl, attachmentId: attachment.id });
});

export default router;
```

**Checklist:**
- [ ] File upload via presigned URLs
- [ ] Attachment list on tickets
- [ ] Image preview in messages
- [ ] File size limits enforced
- [ ] Virus scan (optional, can defer)

### Week 4: Customer Portal

#### Day 1-3: Customer Frontend

```tsx
// apps/web/src/app/(customer)/my-tickets/page.tsx
import { TicketList } from '@/components/tickets/ticket-list';
import { CreateTicketButton } from '@/components/tickets/create-ticket-button';

export default async function MyTicketsPage() {
  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Support Tickets</h1>
        <CreateTicketButton />
      </div>
      
      <TicketList />
    </div>
  );
}
```

```tsx
// apps/web/src/components/tickets/ticket-list.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TicketCard } from './ticket-card';
import { TicketListSkeleton } from './ticket-list-skeleton';

export function TicketList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => api.get('/tickets'),
  });

  if (isLoading) return <TicketListSkeleton />;
  if (error) return <div>Error loading tickets</div>;

  return (
    <div className="space-y-4">
      {data.data.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} />
      ))}
      {data.data.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No tickets yet. Create your first ticket!
        </div>
      )}
    </div>
  );
}
```

**Checklist:**
- [ ] Ticket list page
- [ ] Ticket detail page
- [ ] Create ticket form
- [ ] Reply to ticket
- [ ] View message history
- [ ] Mobile responsive

#### Day 4-5: Ticket Detail & Conversation

```tsx
// apps/web/src/app/(customer)/my-tickets/[id]/page.tsx
import { TicketHeader } from '@/components/tickets/ticket-header';
import { MessageThread } from '@/components/tickets/message-thread';
import { ReplyForm } from '@/components/tickets/reply-form';

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  return (
    <div className="container py-8 max-w-4xl">
      <TicketHeader ticketId={id} />
      <MessageThread ticketId={id} />
      <ReplyForm ticketId={id} />
    </div>
  );
}
```

```tsx
// apps/web/src/components/tickets/message-thread.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MessageBubble } from './message-bubble';
import { formatRelativeTime } from '@/lib/utils';

export function MessageThread({ ticketId }: { ticketId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tickets', ticketId, 'messages'],
    queryFn: () => api.get(`/tickets/${ticketId}/messages`),
    refetchInterval: 10000, // Poll every 10s for now
  });

  if (isLoading) return <MessageThreadSkeleton />;

  return (
    <div className="space-y-4 my-6">
      {data?.data.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isOwn={message.userId === currentUser.id}
        />
      ))}
    </div>
  );
}
```

**Checklist:**
- [ ] Conversation view
- [ ] Message timestamps
- [ ] Author avatars
- [ ] Attachment display
- [ ] Status badges

#### Day 6-7: Customer Polish

**Checklist:**
- [ ] Loading states
- [ ] Error states
- [ ] Empty states
- [ ] Success toasts
- [ ] Form validation feedback
- [ ] Navigation breadcrumbs

### Week 5: Agent Dashboard

#### Day 1-3: Agent Ticket Queue

```tsx
// apps/web/src/app/(agent)/dashboard/page.tsx
import { TicketQueue } from '@/components/agent/ticket-queue';
import { TicketStats } from '@/components/agent/ticket-stats';
import { AgentQuickActions } from '@/components/agent/quick-actions';

export default function AgentDashboardPage() {
  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-6">Agent Dashboard</h1>
      
      <div className="grid gap-6 md:grid-cols-4 mb-8">
        <TicketStats />
      </div>
      
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TicketQueue />
        </div>
        <div>
          <AgentQuickActions />
        </div>
      </div>
    </div>
  );
}
```

```tsx
// apps/web/src/components/agent/ticket-queue.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TicketRow } from './ticket-row';

export function TicketQueue() {
  const { data: myTickets } = useQuery({
    queryKey: ['tickets', { assigned: 'me' }],
    queryFn: () => api.get('/tickets?assigned=me'),
  });

  const { data: unassigned } = useQuery({
    queryKey: ['tickets', { unassigned: true }],
    queryFn: () => api.get('/tickets?unassigned=true'),
  });

  return (
    <Tabs defaultValue="my-tickets">
      <TabsList>
        <TabsTrigger value="my-tickets">
          My Tickets ({myTickets?.data.length || 0})
        </TabsTrigger>
        <TabsTrigger value="unassigned">
          Unassigned ({unassigned?.data.length || 0})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="my-tickets">
        <div className="border rounded-lg divide-y">
          {myTickets?.data.map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} />
          ))}
        </div>
      </TabsContent>

      <TabsContent value="unassigned">
        <div className="border rounded-lg divide-y">
          {unassigned?.data.map((ticket) => (
            <TicketRow 
              key={ticket.id} 
              ticket={ticket}
              showAssignButton
            />
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}
```

**Checklist:**
- [ ] Ticket queue view
- [ ] Filter by status
- [ ] Filter by priority
- [ ] Assign to self
- [ ] Quick status changes
- [ ] Ticket count badges

#### Day 4-5: Agent Ticket Actions

```tsx
// apps/web/src/components/agent/ticket-actions.tsx
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

const statusOptions = [
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_customer', label: 'Waiting on Customer' },
  { value: 'waiting_internal', label: 'Waiting Internal' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export function TicketActions({ ticket }: { ticket: Ticket }) {
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: (status: string) =>
      api.patch(`/tickets/${ticket.id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success('Ticket status updated');
    },
  });

  const assignToMe = useMutation({
    mutationFn: () => api.post(`/tickets/${ticket.id}/assign`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success('Ticket assigned to you');
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!ticket.assignedToId && (
          <>
            <DropdownMenuItem onClick={() => assignToMe.mutate()}>
              Assign to me
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {statusOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => updateStatus.mutate(option.value)}
            disabled={ticket.status === option.value}
          >
            Mark as {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Checklist:**
- [ ] Status dropdown
- [ ] Assign/unassign
- [ ] Priority change
- [ ] Internal notes
- [ ] Canned responses (optional)

#### Day 6-7: Agent Polish & Stats

```tsx
// apps/web/src/components/agent/ticket-stats.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function TicketStats() {
  const { data } = useQuery({
    queryKey: ['agent-stats'],
    queryFn: () => api.get('/agents/me/stats'),
  });

  const stats = [
    { label: 'Open Tickets', value: data?.openTickets || 0 },
    { label: 'Resolved Today', value: data?.resolvedToday || 0 },
    { label: 'Avg Response Time', value: data?.avgResponseTime || '-' },
    { label: 'Customer Satisfaction', value: data?.satisfaction || '-' },
  ];

  return (
    <>
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
```

**Checklist:**
- [ ] Stats dashboard
- [ ] Today's metrics
- [ ] Quick navigation
- [ ] Keyboard shortcuts (optional)
- [ ] Dark mode support

### Phase 2 Milestone Deliverables

```
✅ Complete ticket lifecycle
✅ Customer can submit and track tickets
✅ Agent can manage and respond to tickets
✅ File attachments working
✅ Activity history visible
```

---

## Phase 3: Enhancement (Weeks 6-7)

### Week 6: Real-time Updates

#### Day 1-3: Socket.IO Integration

```typescript
// apps/api/src/lib/socket.ts
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/valkey-adapter';
import Valkey from 'iovalkey';
import { verifySession } from './auth';

export function initializeSocket(httpServer: HttpServer) {
  const pubClient = new Valkey(process.env.VALKEY_URL);
  const subClient = pubClient.duplicate();

  const io = new Server(httpServer, {
    adapter: createAdapter(pubClient, subClient),
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    try {
      const session = await verifySession(token);
      socket.data.user = session.user;
      next();
    } catch (error) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    console.log(`User connected: ${user.id}`);

    // Join user's personal room
    socket.join(`user:${user.id}`);

    // Join organization room
    if (user.organizationId) {
      socket.join(`org:${user.organizationId}`);
    }

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${user.id}`);
    });
  });

  return io;
}
```

**Checklist:**
- [ ] Socket.IO server running
- [ ] Valkey adapter configured
- [ ] Authentication on connection
- [ ] Room structure implemented
- [ ] Basic connection logging

#### Day 4-5: Real-time Events

```typescript
// apps/api/src/services/ticket.service.ts
import { getIO } from '../lib/socket';

export class TicketService {
  static async createMessage(ticketId: string, data: CreateMessageInput) {
    const [message] = await db.insert(messages).values({
      ticketId,
      ...data,
    }).returning();

    // Emit to all viewers of this ticket
    const io = getIO();
    io.to(`ticket:${ticketId}`).emit('message:new', {
      ticketId,
      message,
    });

    return message;
  }

  static async updateStatus(ticketId: string, newStatus: string, userId: string) {
    const [updated] = await db.update(tickets)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(tickets.id, ticketId))
      .returning();

    // Emit update
    const io = getIO();
    io.to(`ticket:${ticketId}`).emit('ticket:updated', {
      ticketId,
      changes: { status: newStatus },
    });

    // Also notify organization (for queue updates)
    io.to(`org:${updated.organizationId}`).emit('queue:updated', {
      ticketId,
      status: newStatus,
    });

    return updated;
  }
}
```

```tsx
// apps/web/src/hooks/use-socket.ts
'use client';

import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';

let socket: Socket | null = null;

export function useSocket() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session?.user) return;

    socket = io(process.env.NEXT_PUBLIC_API_URL!, {
      auth: { token: session.token },
    });

    socket.on('message:new', ({ ticketId }) => {
      queryClient.invalidateQueries({
        queryKey: ['tickets', ticketId, 'messages'],
      });
    });

    socket.on('ticket:updated', ({ ticketId }) => {
      queryClient.invalidateQueries({
        queryKey: ['tickets', ticketId],
      });
    });

    socket.on('queue:updated', () => {
      queryClient.invalidateQueries({
        queryKey: ['tickets'],
      });
    });

    return () => {
      socket?.disconnect();
    };
  }, [session, queryClient]);

  return socket;
}
```

**Checklist:**
- [ ] New message notifications
- [ ] Ticket status updates
- [ ] Queue auto-refresh
- [ ] Connection status indicator
- [ ] Reconnection handling

#### Day 6-7: Typing Indicators & Presence

```tsx
// apps/web/src/components/tickets/typing-indicator.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { useDebounce } from '@/hooks/use-debounce';

export function TypingIndicator({ ticketId }: { ticketId: string }) {
  const socket = useSocket();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!socket) return;

    socket.on('typing:start', ({ ticketId: tid, userName }) => {
      if (tid === ticketId) {
        setTypingUsers((prev) => [...new Set([...prev, userName])]);
      }
    });

    socket.on('typing:stop', ({ ticketId: tid, userName }) => {
      if (tid === ticketId) {
        setTypingUsers((prev) => prev.filter((u) => u !== userName));
      }
    });

    return () => {
      socket.off('typing:start');
      socket.off('typing:stop');
    };
  }, [socket, ticketId]);

  if (typingUsers.length === 0) return null;

  return (
    <div className="text-sm text-muted-foreground animate-pulse">
      {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
    </div>
  );
}

export function useTypingEmitter(ticketId: string) {
  const socket = useSocket();
  const [isTyping, setIsTyping] = useState(false);
  const debouncedStop = useDebounce(() => setIsTyping(false), 2000);

  const emitTyping = () => {
    if (!isTyping) {
      socket?.emit('typing:start', { ticketId });
      setIsTyping(true);
    }
    debouncedStop();
  };

  useEffect(() => {
    if (!isTyping) {
      socket?.emit('typing:stop', { ticketId });
    }
  }, [isTyping, socket, ticketId]);

  return { emitTyping };
}
```

**Checklist:**
- [ ] Typing indicators
- [ ] Online/offline status
- [ ] "User viewing" indicator
- [ ] Last seen timestamps

### Week 7: Background Jobs & SLA

#### Day 1-3: pg-boss Setup

```typescript
// apps/api/src/lib/jobs.ts
import PgBoss from 'pg-boss';
import { db } from './db';

let boss: PgBoss;

export async function initializeJobs() {
  boss = new PgBoss({
    db: {
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    },
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
  });

  await boss.start();

  // Register handlers
  await boss.work('email:send', emailHandler);
  await boss.work('ticket:sla-check', slaCheckHandler);
  await boss.work('ticket:auto-close', autoCloseHandler);
  await boss.work('report:daily', dailyReportHandler);

  // Schedule recurring jobs
  await boss.schedule('ticket:sla-check', '*/5 * * * *'); // Every 5 min
  await boss.schedule('ticket:auto-close', '0 * * * *');  // Every hour
  await boss.schedule('report:daily', '0 9 * * *');       // 9 AM daily

  console.log('pg-boss started and jobs registered');
  return boss;
}

export function getJobQueue() {
  return boss;
}
```

**Checklist:**
- [ ] pg-boss connected
- [ ] Email job handler
- [ ] SLA check job
- [ ] Auto-close job
- [ ] Job monitoring

#### Day 4-5: Email Notifications

```typescript
// apps/api/src/jobs/email.handler.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailJob {
  to: string;
  template: 'ticket-created' | 'ticket-reply' | 'ticket-resolved';
  data: Record<string, unknown>;
}

export async function emailHandler(job: PgBoss.Job<EmailJob>) {
  const { to, template, data } = job.data;

  const templates = {
    'ticket-created': {
      subject: `Ticket #${data.ticketNumber} Created`,
      html: `
        <h2>Your ticket has been created</h2>
        <p>Subject: ${data.subject}</p>
        <p>We'll get back to you soon!</p>
        <a href="${process.env.APP_URL}/tickets/${data.ticketId}">View Ticket</a>
      `,
    },
    'ticket-reply': {
      subject: `New reply on Ticket #${data.ticketNumber}`,
      html: `
        <h2>New message on your ticket</h2>
        <p>${data.preview}</p>
        <a href="${process.env.APP_URL}/tickets/${data.ticketId}">View Conversation</a>
      `,
    },
    'ticket-resolved': {
      subject: `Ticket #${data.ticketNumber} Resolved`,
      html: `
        <h2>Your ticket has been resolved</h2>
        <p>If you have any more questions, feel free to reply.</p>
      `,
    },
  };

  const { subject, html } = templates[template];

  await resend.emails.send({
    from: 'support@insightdesk.com',
    to,
    subject,
    html,
  });
}
```

**Checklist:**
- [ ] Email provider configured (Resend)
- [ ] Ticket created notification
- [ ] New reply notification
- [ ] Ticket resolved notification
- [ ] Unsubscribe handling (optional)

#### Day 6-7: SLA Tracking

```typescript
// apps/api/src/jobs/sla-check.handler.ts
import { db } from '../lib/db';
import { tickets, slaBreaches } from '@insightdesk/shared/db/schema';
import { and, lt, eq, isNull } from 'drizzle-orm';

// Default SLA: First response in 4 hours, resolution in 24 hours
const SLA_FIRST_RESPONSE_HOURS = 4;
const SLA_RESOLUTION_HOURS = 24;

export async function slaCheckHandler() {
  const now = new Date();
  
  // Check first response SLA
  const ticketsWithoutResponse = await db
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.status, 'open'),
        isNull(tickets.firstResponseAt),
        lt(tickets.createdAt, new Date(now.getTime() - SLA_FIRST_RESPONSE_HOURS * 60 * 60 * 1000))
      )
    );

  for (const ticket of ticketsWithoutResponse) {
    await recordSLABreach(ticket.id, 'first_response');
  }

  // Check resolution SLA
  const unresolvedTickets = await db
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.status, 'in_progress'),
        isNull(tickets.resolvedAt),
        lt(tickets.createdAt, new Date(now.getTime() - SLA_RESOLUTION_HOURS * 60 * 60 * 1000))
      )
    );

  for (const ticket of unresolvedTickets) {
    await recordSLABreach(ticket.id, 'resolution');
  }
}

async function recordSLABreach(ticketId: string, type: 'first_response' | 'resolution') {
  // Check if already recorded
  const existing = await db
    .select()
    .from(slaBreaches)
    .where(and(eq(slaBreaches.ticketId, ticketId), eq(slaBreaches.type, type)));

  if (existing.length === 0) {
    await db.insert(slaBreaches).values({
      ticketId,
      type,
      breachedAt: new Date(),
    });

    // TODO: Send notification to admin/manager
  }
}
```

**Checklist:**
- [ ] SLA timers per priority
- [ ] First response tracking
- [ ] Resolution tracking
- [ ] SLA breach alerts
- [ ] SLA dashboard (basic)

### Phase 3 Milestone Deliverables

```
✅ Real-time updates working
✅ Email notifications sent
✅ SLA tracking active
✅ Background jobs processing
✅ Typing indicators (bonus)
```

---

## Phase 4: Polish & Launch (Weeks 8-10)

### Week 8: Testing & Bug Fixes

#### Day 1-3: Critical Path Testing

```typescript
// apps/api/tests/integration/ticket-flow.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestClient, createTestUser } from '../helpers';

describe('Ticket Flow', () => {
  let customer: TestUser;
  let agent: TestUser;
  let api: TestClient;

  beforeAll(async () => {
    customer = await createTestUser({ role: 'customer' });
    agent = await createTestUser({ role: 'agent' });
    api = createTestClient();
  });

  test('customer can create ticket', async () => {
    const response = await api
      .as(customer)
      .post('/tickets', {
        subject: 'Need help with login',
        description: 'Cannot access my account',
      });

    expect(response.status).toBe(201);
    expect(response.data.subject).toBe('Need help with login');
    expect(response.data.status).toBe('open');
  });

  test('agent can assign and respond', async () => {
    const ticket = await createTicket(customer);

    // Assign
    await api.as(agent).post(`/tickets/${ticket.id}/assign`);

    // Respond
    const response = await api.as(agent).post(`/tickets/${ticket.id}/messages`, {
      content: 'I can help you with that!',
    });

    expect(response.status).toBe(201);
  });

  test('ticket can be resolved', async () => {
    const ticket = await createTicket(customer);
    await api.as(agent).post(`/tickets/${ticket.id}/assign`);

    const response = await api.as(agent).patch(`/tickets/${ticket.id}`, {
      status: 'resolved',
    });

    expect(response.data.status).toBe('resolved');
    expect(response.data.resolvedAt).toBeDefined();
  });
});
```

```typescript
// apps/web/tests/e2e/customer-journey.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Customer Journey', () => {
  test('customer can submit and track ticket', async ({ page }) => {
    // Login as customer
    await page.goto('/login');
    await page.fill('[name="email"]', 'customer@test.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Create ticket
    await page.goto('/my-tickets');
    await page.click('text=Create Ticket');
    await page.fill('[name="subject"]', 'Test ticket');
    await page.fill('[name="description"]', 'This is a test');
    await page.click('button[type="submit"]');

    // Verify created
    await expect(page.locator('text=Test ticket')).toBeVisible();

    // View ticket
    await page.click('text=Test ticket');
    await expect(page.locator('text=This is a test')).toBeVisible();
  });
});
```

**Checklist:**
- [ ] Auth flow tests
- [ ] Ticket CRUD tests
- [ ] Message flow tests
- [ ] File upload tests
- [ ] E2E customer journey
- [ ] E2E agent workflow

#### Day 4-5: Bug Fixing Sprint

Focus areas:
- [ ] Form validation edge cases
- [ ] Error message clarity
- [ ] Loading states coverage
- [ ] Mobile responsiveness issues
- [ ] Cross-browser testing (Chrome, Firefox, Safari)

#### Day 6-7: Performance Review

```typescript
// Quick performance checklist
const performanceChecks = {
  api: [
    'Database queries using indexes',
    'N+1 queries eliminated',
    'Pagination on list endpoints',
    'Response times < 200ms',
  ],
  frontend: [
    'Images optimized',
    'Code splitting working',
    'First paint < 2s',
    'Client bundle < 200KB gzipped',
  ],
};
```

**Checklist:**
- [ ] API response times acceptable
- [ ] Database queries optimized
- [ ] Frontend bundle size checked
- [ ] Lighthouse score > 80

### Week 9: Admin Panel & Final Features

#### Day 1-3: Admin Dashboard

```tsx
// apps/web/src/app/(admin)/admin/page.tsx
import { requireRole } from '@/lib/auth';
import { AdminStats } from '@/components/admin/admin-stats';
import { RecentActivity } from '@/components/admin/recent-activity';
import { AgentPerformance } from '@/components/admin/agent-performance';

export default async function AdminDashboardPage() {
  await requireRole('admin');

  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      
      <div className="grid gap-6 md:grid-cols-4 mb-8">
        <AdminStats />
      </div>
      
      <div className="grid gap-6 lg:grid-cols-2">
        <RecentActivity />
        <AgentPerformance />
      </div>
    </div>
  );
}
```

**Checklist:**
- [ ] Admin dashboard stats
- [ ] User management
- [ ] Agent management
- [ ] Organization settings
- [ ] Basic reports

#### Day 4-5: Search & Filtering

```tsx
// apps/web/src/components/tickets/ticket-search.tsx
'use client';

import { useQueryState } from 'nuqs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';

export function TicketSearch() {
  const [search, setSearch] = useQueryState('q');
  const [status, setStatus] = useQueryState('status');
  const [priority, setPriority] = useQueryState('priority');
  
  const debouncedSearch = useDebounce((value: string) => {
    setSearch(value || null);
  }, 300);

  return (
    <div className="flex gap-4 mb-6">
      <Input
        placeholder="Search tickets..."
        onChange={(e) => debouncedSearch(e.target.value)}
        className="max-w-sm"
      />
      <Select value={status || ''} onValueChange={(v) => setStatus(v || null)}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Statuses</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>
      <Select value={priority || ''} onValueChange={(v) => setPriority(v || null)}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All Priorities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Priorities</SelectItem>
          <SelectItem value="urgent">Urgent</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="normal">Normal</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

**Checklist:**
- [ ] Full-text search
- [ ] Status filtering
- [ ] Priority filtering
- [ ] Date range filtering
- [ ] URL-based filter state

#### Day 6-7: Documentation & Polish

**Checklist:**
- [ ] API documentation
- [ ] README complete
- [ ] Environment setup guide
- [ ] Deployment guide
- [ ] Known issues documented

### Week 10: Deployment & Launch

#### Day 1-3: Production Setup

```yaml
# docker-compose.prod.yml
services:
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=${API_URL}
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - VALKEY_URL=${VALKEY_URL}
    depends_on:
      - postgres
      - valkey
    restart: unless-stopped

  postgres:
    image: postgres:18
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  valkey:
    image: valkey/valkey:9.0
    volumes:
      - valkey_data:/data
    restart: unless-stopped

  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  valkey_data:
  caddy_data:
```

```
# Caddyfile
insightdesk.yourdomain.com {
    handle /api/* {
        reverse_proxy api:3001
    }
    
    handle /socket.io/* {
        reverse_proxy api:3001
    }
    
    handle {
        reverse_proxy web:3000
    }
}
```

**Checklist:**
- [ ] Production Docker images
- [ ] SSL/TLS configured
- [ ] Database backups scheduled
- [ ] Monitoring set up
- [ ] Error tracking (Sentry)

#### Day 4-5: Staging & Testing

**Checklist:**
- [ ] Deploy to staging
- [ ] Run full test suite
- [ ] Manual QA testing
- [ ] Performance testing
- [ ] Security checklist

#### Day 6-7: Launch! 🚀

**Launch Day Checklist:**
- [ ] Final code review
- [ ] Database migrations run
- [ ] Production deploy
- [ ] Smoke tests pass
- [ ] Monitoring alerts verified
- [ ] First real ticket created! 🎉

---

## Post-Launch: Week 11+

### Immediate Post-Launch (Week 11)

**Priority:**
1. Monitor for bugs and fix quickly
2. Watch performance metrics
3. Gather user feedback
4. Small improvements only

### Future Enhancements (Backlog)

When ready to expand, consider:

```
High Priority:
- [ ] Knowledge base / FAQ
- [ ] Canned responses
- [ ] Customer satisfaction surveys
- [ ] Advanced reporting

Medium Priority:
- [ ] Slack/Teams integration
- [ ] Webhooks for external systems
- [ ] Custom fields on tickets
- [ ] Ticket merging

Nice to Have:
- [ ] AI-powered responses
- [ ] Multi-language support
- [ ] Custom email domains
- [ ] Advanced SLA rules
```

---

## Solo Developer Tips

### Time Management

```
Daily Schedule (8 hours):
├── 2 hours: Deep focus coding (hardest tasks)
├── 4 hours: Feature development
├── 1 hour: Testing & bug fixes
└── 1 hour: Planning & documentation
```

### When Stuck

1. **Take a break** (15-20 min walk)
2. **Rubber duck debug** (explain to AI/toy)
3. **Simplify** (MVP the MVP)
4. **Ask for help** (communities, mentors)
5. **Move on** (work on different feature)

### Avoiding Burnout

- Set realistic daily goals
- Celebrate small wins
- Don't work weekends (usually)
- Ship imperfect features
- Remember: Done > Perfect

### Success Metrics

| Metric                | Target  |
| --------------------- | ------- |
| MVP launch            | Week 10 |
| First customer ticket | Week 10 |
| 10 active users       | Week 12 |
| Core features stable  | Week 12 |
| First paying customer | Week 14 |

---

## Quick Reference

### Weekly Checkpoints

| Week | Milestone       | Key Deliverable       |
| ---- | --------------- | --------------------- |
| 1    | Setup           | Docker + Auth working |
| 2    | Foundation      | Ticket CRUD complete  |
| 3    | Ticket System   | Full workflow done    |
| 4    | Customer Portal | Customers can use it  |
| 5    | Agent Dashboard | Agents can work       |
| 6    | Real-time       | Live updates work     |
| 7    | Background Jobs | Emails + SLA active   |
| 8    | Testing         | Bug-free core paths   |
| 9    | Admin           | Management features   |
| 10   | **LAUNCH**      | 🚀 Production live!    |

### Emergency Contacts

When things go wrong at 2 AM:
- Database down → `docker compose restart postgres`
- API crashed → Check logs, restart container
- Memory issue → Restart all containers
- SSL expired → Caddy auto-renews (wait 5 min)

---

## Final Thoughts

Building a complete help desk as a solo developer in 8-10 weeks is ambitious but achievable. The key is:

1. **Start simple** - Get basics working first
2. **Ship early** - Launch before it's "perfect"
3. **Iterate fast** - Fix real issues, not imagined ones
4. **Stay focused** - Avoid shiny object syndrome

You've got this! 💪

---

**Ready to start?** Head back to [README](./README.md) and begin with Week 1.
