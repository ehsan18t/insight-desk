# 06 - API Design

> **RESTful API structure, endpoints, request/response patterns**

---

## 🎯 API Design Principles

### 1. RESTful Conventions

```
GET    /api/resource          → List resources
GET    /api/resource/:id      → Get single resource
POST   /api/resource          → Create resource
PATCH  /api/resource/:id      → Partial update
PUT    /api/resource/:id      → Full replace (rarely used)
DELETE /api/resource/:id      → Delete resource
```

### 2. Consistent Response Format

```typescript
// Success response
{
  "data": { ... },           // Single object or array
  "pagination": { ... },     // Only for list endpoints
  "meta": { ... }            // Optional metadata
}

// Error response
{
  "error": "ValidationError",
  "message": "Invalid input",
  "details": [               // Field-level errors
    { "path": "email", "message": "Invalid email format" }
  ]
}
```

### 3. HTTP Status Codes

| Code | Meaning       | When to Use                 |
| ---- | ------------- | --------------------------- |
| 200  | OK            | Successful GET, PATCH, PUT  |
| 201  | Created       | Successful POST             |
| 204  | No Content    | Successful DELETE           |
| 400  | Bad Request   | Validation failed           |
| 401  | Unauthorized  | Not logged in               |
| 403  | Forbidden     | Logged in but not allowed   |
| 404  | Not Found     | Resource doesn't exist      |
| 409  | Conflict      | Duplicate or state conflict |
| 422  | Unprocessable | Business logic error        |
| 500  | Server Error  | Something broke             |

---

## 📋 API Endpoints Overview

### Authentication

```
POST   /api/auth/register        → Create account
POST   /api/auth/login           → Get session
POST   /api/auth/logout          → End session
GET    /api/auth/session         → Get current session
POST   /api/auth/forgot-password → Request reset
POST   /api/auth/reset-password  → Set new password
POST   /api/auth/verify-email    → Verify email
```

### Tickets

```
GET    /api/tickets              → List tickets
GET    /api/tickets/:id          → Get ticket details
POST   /api/tickets              → Create ticket
PATCH  /api/tickets/:id          → Update ticket
DELETE /api/tickets/:id          → Delete ticket (admin)

POST   /api/tickets/:id/assign   → Assign to agent
POST   /api/tickets/:id/close    → Close ticket
POST   /api/tickets/:id/reopen   → Reopen ticket
```

### Messages

```
GET    /api/tickets/:id/messages      → List ticket messages
POST   /api/tickets/:id/messages      → Add message/reply
PATCH  /api/messages/:id              → Edit message
DELETE /api/messages/:id              → Delete message
```

### Users

```
GET    /api/users                → List users (agents/admins)
GET    /api/users/:id            → Get user details
GET    /api/users/me             → Get current user
PATCH  /api/users/me             → Update current user
PATCH  /api/users/:id            → Update user (admin)
DELETE /api/users/:id            → Remove user (admin)
```

### Organizations

```
GET    /api/organizations/current     → Get current org
PATCH  /api/organizations/current     → Update org settings
GET    /api/organizations/members     → List org members
POST   /api/organizations/invite      → Invite member
DELETE /api/organizations/members/:id → Remove member
```

### SLA Policies

```
GET    /api/sla-policies              → List SLA policies
PATCH  /api/sla-policies/:id          → Update policy
```

### Canned Responses

```
GET    /api/canned-responses          → List responses
POST   /api/canned-responses          → Create response
PATCH  /api/canned-responses/:id      → Update response
DELETE /api/canned-responses/:id      → Delete response
```

### Dashboard

```
GET    /api/dashboard/stats           → Get dashboard metrics
GET    /api/dashboard/trends          → Get ticket trends
```

---

## 🛣️ Route Implementations

### Routes Index

```typescript
// backend/src/routes/index.ts
import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { ticketRoutes } from './tickets.routes';
import { messageRoutes } from './messages.routes';
import { userRoutes } from './users.routes';
import { orgRoutes } from './organizations.routes';
import { slaRoutes } from './sla.routes';
import { cannedResponseRoutes } from './canned-responses.routes';
import { dashboardRoutes } from './dashboard.routes';

export const routes = Router();

// Public routes
routes.use('/auth', authRoutes);

// Protected routes (auth required)
routes.use('/tickets', ticketRoutes);
routes.use('/messages', messageRoutes);
routes.use('/users', userRoutes);
routes.use('/organizations', orgRoutes);
routes.use('/sla-policies', slaRoutes);
routes.use('/canned-responses', cannedResponseRoutes);
routes.use('/dashboard', dashboardRoutes);
```

### Ticket Routes

```typescript
// backend/src/routes/tickets.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { requireRole } from '../middleware/require-role';
import * as ticketController from '../controllers/tickets.controller';
import * as ticketSchema from '../schemas/ticket.schema';

export const ticketRoutes = Router();

// All routes require authentication
ticketRoutes.use(authenticate);

// List tickets with filters and pagination
ticketRoutes.get(
  '/',
  validate(ticketSchema.listTicketsQuery, 'query'),
  ticketController.listTickets
);

// Get single ticket
ticketRoutes.get(
  '/:id',
  validate(ticketSchema.ticketIdParam, 'params'),
  ticketController.getTicket
);

// Create ticket (customers can create)
ticketRoutes.post(
  '/',
  validate(ticketSchema.createTicketBody),
  ticketController.createTicket
);

// Update ticket (agents+)
ticketRoutes.patch(
  '/:id',
  requireRole(['agent', 'admin', 'owner']),
  validate(ticketSchema.ticketIdParam, 'params'),
  validate(ticketSchema.updateTicketBody),
  ticketController.updateTicket
);

// Assign ticket
ticketRoutes.post(
  '/:id/assign',
  requireRole(['agent', 'admin', 'owner']),
  validate(ticketSchema.ticketIdParam, 'params'),
  validate(ticketSchema.assignTicketBody),
  ticketController.assignTicket
);

// Close ticket
ticketRoutes.post(
  '/:id/close',
  validate(ticketSchema.ticketIdParam, 'params'),
  validate(ticketSchema.closeTicketBody),
  ticketController.closeTicket
);

// Reopen ticket
ticketRoutes.post(
  '/:id/reopen',
  validate(ticketSchema.ticketIdParam, 'params'),
  ticketController.reopenTicket
);

// Delete ticket (admin only)
ticketRoutes.delete(
  '/:id',
  requireRole(['admin', 'owner']),
  validate(ticketSchema.ticketIdParam, 'params'),
  ticketController.deleteTicket
);
```

---

## 📝 Schemas (Validation)

### Ticket Schemas

```typescript
// backend/src/schemas/ticket.schema.ts
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Params
// ─────────────────────────────────────────────────────────────
export const ticketIdParam = z.object({
  id: z.string().uuid('Invalid ticket ID'),
});

// ─────────────────────────────────────────────────────────────
// Query (List/Filter)
// ─────────────────────────────────────────────────────────────
export const listTicketsQuery = z.object({
  // Pagination
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  
  // Filters
  status: z
    .enum(['open', 'pending', 'resolved', 'closed'])
    .or(z.array(z.enum(['open', 'pending', 'resolved', 'closed'])))
    .optional()
    .transform((val) => (val ? (Array.isArray(val) ? val : [val]) : undefined)),
  
  priority: z
    .enum(['low', 'medium', 'high', 'urgent'])
    .or(z.array(z.enum(['low', 'medium', 'high', 'urgent'])))
    .optional()
    .transform((val) => (val ? (Array.isArray(val) ? val : [val]) : undefined)),
  
  assigneeId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  
  // Search
  search: z.string().max(200).optional(),
  
  // Date range
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
  
  // Sorting
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ─────────────────────────────────────────────────────────────
// Create Ticket
// ─────────────────────────────────────────────────────────────
export const createTicketBody = z.object({
  title: z
    .string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title must be less than 200 characters')
    .trim(),
  
  description: z
    .string()
    .min(20, 'Description must be at least 20 characters')
    .max(10000, 'Description must be less than 10,000 characters')
    .trim(),
  
  priority: z
    .enum(['low', 'medium', 'high', 'urgent'])
    .default('medium'),
  
  categoryId: z.string().uuid().optional(),
  
  tags: z
    .array(z.string().max(50))
    .max(10, 'Maximum 10 tags allowed')
    .default([]),
});

// ─────────────────────────────────────────────────────────────
// Update Ticket
// ─────────────────────────────────────────────────────────────
export const updateTicketBody = z.object({
  title: z.string().min(5).max(200).trim().optional(),
  description: z.string().min(20).max(10000).trim().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  categoryId: z.string().uuid().nullable().optional(),
});

// ─────────────────────────────────────────────────────────────
// Assign Ticket
// ─────────────────────────────────────────────────────────────
export const assignTicketBody = z.object({
  assigneeId: z.string().uuid('Invalid assignee ID'),
});

// ─────────────────────────────────────────────────────────────
// Close Ticket
// ─────────────────────────────────────────────────────────────
export const closeTicketBody = z.object({
  resolution: z.string().max(5000).optional(),
}).optional();

// ─────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────
export type TicketIdParam = z.infer<typeof ticketIdParam>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuery>;
export type CreateTicketBody = z.infer<typeof createTicketBody>;
export type UpdateTicketBody = z.infer<typeof updateTicketBody>;
export type AssignTicketBody = z.infer<typeof assignTicketBody>;
export type CloseTicketBody = z.infer<typeof closeTicketBody>;
```

### Message Schemas

```typescript
// backend/src/schemas/message.schema.ts
import { z } from 'zod';

export const createMessageBody = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(10000, 'Message too long')
    .trim(),
  
  type: z
    .enum(['reply', 'internal_note'])
    .default('reply'),
  
  attachments: z
    .array(z.object({
      filename: z.string(),
      url: z.string().url(),
      mimeType: z.string(),
      size: z.number().max(10 * 1024 * 1024), // 10MB max
    }))
    .max(5)
    .default([]),
});

export const updateMessageBody = z.object({
  content: z.string().min(1).max(10000).trim(),
});

export type CreateMessageBody = z.infer<typeof createMessageBody>;
export type UpdateMessageBody = z.infer<typeof updateMessageBody>;
```

---

## 🎮 Controllers

### Ticket Controller

```typescript
// backend/src/controllers/tickets.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as ticketService from '../services/ticket.service';
import { 
  ListTicketsQuery, 
  CreateTicketBody, 
  UpdateTicketBody,
  AssignTicketBody,
  CloseTicketBody
} from '../schemas/ticket.schema';

// ─────────────────────────────────────────────────────────────
// List Tickets
// ─────────────────────────────────────────────────────────────
export async function listTickets(
  req: Request<{}, {}, {}, ListTicketsQuery>,
  res: Response,
  next: NextFunction
) {
  try {
    const user = req.user!;
    const query = req.query;
    
    // Customers can only see their own tickets
    if (user.role === 'customer') {
      query.customerId = user.id;
    }
    
    const result = await ticketService.listTickets({
      organizationId: user.organizationId,
      ...query,
    });
    
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────
// Get Single Ticket
// ─────────────────────────────────────────────────────────────
export async function getTicket(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const user = req.user!;
    
    const ticket = await ticketService.getTicketById(id);
    
    if (!ticket) {
      res.status(404).json({ error: 'NotFound', message: 'Ticket not found' });
      return;
    }
    
    // Check access
    if (user.role === 'customer' && ticket.customerId !== user.id) {
      res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
      return;
    }
    
    if (ticket.organizationId !== user.organizationId) {
      res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
      return;
    }
    
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────
// Create Ticket
// ─────────────────────────────────────────────────────────────
export async function createTicket(
  req: Request<{}, {}, CreateTicketBody>,
  res: Response,
  next: NextFunction
) {
  try {
    const user = req.user!;
    const body = req.body;
    
    const ticket = await ticketService.createTicket({
      ...body,
      customerId: user.id,
      organizationId: user.organizationId,
    });
    
    res.status(201).json({ data: ticket });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────
// Update Ticket
// ─────────────────────────────────────────────────────────────
export async function updateTicket(
  req: Request<{ id: string }, {}, UpdateTicketBody>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const user = req.user!;
    const updates = req.body;
    
    // Verify ticket exists and belongs to org
    const existing = await ticketService.getTicketById(id);
    if (!existing || existing.organizationId !== user.organizationId) {
      res.status(404).json({ error: 'NotFound', message: 'Ticket not found' });
      return;
    }
    
    const ticket = await ticketService.updateTicket(id, updates, user.id);
    
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────
// Assign Ticket
// ─────────────────────────────────────────────────────────────
export async function assignTicket(
  req: Request<{ id: string }, {}, AssignTicketBody>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const { assigneeId } = req.body;
    const user = req.user!;
    
    // Verify assignee is in same org
    const assignee = await ticketService.verifyAssignee(assigneeId, user.organizationId);
    if (!assignee) {
      res.status(400).json({ error: 'BadRequest', message: 'Invalid assignee' });
      return;
    }
    
    const ticket = await ticketService.assignTicket(id, assigneeId, user.id);
    
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────
// Close Ticket
// ─────────────────────────────────────────────────────────────
export async function closeTicket(
  req: Request<{ id: string }, {}, CloseTicketBody>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const user = req.user!;
    const resolution = req.body?.resolution;
    
    const ticket = await ticketService.closeTicket(id, user.id, resolution);
    
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────
// Reopen Ticket
// ─────────────────────────────────────────────────────────────
export async function reopenTicket(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const user = req.user!;
    
    const ticket = await ticketService.reopenTicket(id, user.id);
    
    res.json({ data: ticket });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────
// Delete Ticket
// ─────────────────────────────────────────────────────────────
export async function deleteTicket(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    
    await ticketService.deleteTicket(id);
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
```

---

## ⚙️ Services

### Ticket Service

```typescript
// backend/src/services/ticket.service.ts
import { eq, and, or, ilike, inArray, desc, asc, sql, isNull } from 'drizzle-orm';
import { db } from '../db';
import { tickets, ticketActivities, users, userOrganizations } from '../db/schema';
import { io } from '../socket';
import { boss } from '../jobs';
import { ListTicketsQuery, CreateTicketBody, UpdateTicketBody } from '../schemas/ticket.schema';

// ─────────────────────────────────────────────────────────────
// List Tickets
// ─────────────────────────────────────────────────────────────
export async function listTickets(params: ListTicketsQuery & { organizationId: string }) {
  const {
    organizationId,
    page,
    limit,
    status,
    priority,
    assigneeId,
    customerId,
    search,
    createdAfter,
    createdBefore,
    sortBy,
    sortOrder,
  } = params;

  // Build where conditions
  const conditions = [eq(tickets.organizationId, organizationId)];

  if (status?.length) {
    conditions.push(inArray(tickets.status, status));
  }
  if (priority?.length) {
    conditions.push(inArray(tickets.priority, priority));
  }
  if (assigneeId) {
    conditions.push(eq(tickets.assigneeId, assigneeId));
  }
  if (customerId) {
    conditions.push(eq(tickets.customerId, customerId));
  }
  if (search) {
    conditions.push(
      or(
        ilike(tickets.title, `%${search}%`),
        ilike(tickets.description, `%${search}%`)
      )!
    );
  }
  if (createdAfter) {
    conditions.push(sql`${tickets.createdAt} >= ${createdAfter}`);
  }
  if (createdBefore) {
    conditions.push(sql`${tickets.createdAt} <= ${createdBefore}`);
  }

  // Build order by
  const orderColumn = {
    createdAt: tickets.createdAt,
    updatedAt: tickets.updatedAt,
    priority: tickets.priority,
    status: tickets.status,
  }[sortBy];
  const orderDirection = sortOrder === 'asc' ? asc : desc;

  // Execute queries
  const offset = (page - 1) * limit;
  const whereClause = and(...conditions);

  const [data, countResult] = await Promise.all([
    db.query.tickets.findMany({
      where: whereClause,
      orderBy: orderDirection(orderColumn),
      limit,
      offset,
      with: {
        customer: {
          columns: { id: true, name: true, email: true, avatarUrl: true },
        },
        assignee: {
          columns: { id: true, name: true, avatarUrl: true },
        },
      },
    }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(whereClause),
  ]);

  const total = countResult[0].count;

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Get Ticket By ID
// ─────────────────────────────────────────────────────────────
export async function getTicketById(id: string) {
  return db.query.tickets.findFirst({
    where: eq(tickets.id, id),
    with: {
      customer: true,
      assignee: true,
      messages: {
        orderBy: asc(tickets.createdAt),
        with: {
          sender: {
            columns: { id: true, name: true, avatarUrl: true },
          },
        },
      },
      activities: {
        orderBy: desc(ticketActivities.createdAt),
        limit: 50,
        with: {
          user: {
            columns: { id: true, name: true },
          },
        },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Create Ticket
// ─────────────────────────────────────────────────────────────
export async function createTicket(
  data: CreateTicketBody & { customerId: string; organizationId: string }
) {
  return db.transaction(async (tx) => {
    // Get next ticket number for org
    const [{ max }] = await tx
      .select({ max: sql<number>`COALESCE(MAX(ticket_number), 0)` })
      .from(tickets)
      .where(eq(tickets.organizationId, data.organizationId));
    
    const ticketNumber = max + 1;

    // Calculate SLA deadline
    const slaDeadline = await calculateSLADeadline(data.organizationId, data.priority);

    // Create ticket
    const [ticket] = await tx
      .insert(tickets)
      .values({
        ...data,
        ticketNumber,
        slaDeadline,
      })
      .returning();

    // Create activity
    await tx.insert(ticketActivities).values({
      ticketId: ticket.id,
      userId: data.customerId,
      action: 'created',
    });

    // Schedule SLA check job
    if (slaDeadline) {
      await boss.send('sla:check', { ticketId: ticket.id }, {
        startAfter: slaDeadline,
      });
    }

    // Emit real-time event
    io.to(`org:${data.organizationId}`).emit('ticket:created', ticket);

    // Queue notification email
    await boss.send('email:ticket-created', { ticketId: ticket.id });

    return ticket;
  });
}

// ─────────────────────────────────────────────────────────────
// Update Ticket
// ─────────────────────────────────────────────────────────────
export async function updateTicket(
  id: string,
  updates: UpdateTicketBody,
  userId: string
) {
  return db.transaction(async (tx) => {
    // Get current ticket
    const [current] = await tx
      .select()
      .from(tickets)
      .where(eq(tickets.id, id));

    if (!current) {
      throw new Error('Ticket not found');
    }

    // Update ticket
    const [updated] = await tx
      .update(tickets)
      .set({
        ...updates,
        updatedAt: new Date(),
        ...(updates.status === 'resolved' && { resolvedAt: new Date() }),
        ...(updates.status === 'closed' && { closedAt: new Date() }),
      })
      .where(eq(tickets.id, id))
      .returning();

    // Log activities for significant changes
    if (updates.status && updates.status !== current.status) {
      await tx.insert(ticketActivities).values({
        ticketId: id,
        userId,
        action: 'status_changed',
        metadata: { fromStatus: current.status, toStatus: updates.status },
      });
    }

    if (updates.priority && updates.priority !== current.priority) {
      await tx.insert(ticketActivities).values({
        ticketId: id,
        userId,
        action: 'priority_changed',
        metadata: { fromPriority: current.priority, toPriority: updates.priority },
      });
    }

    // Emit real-time update
    io.to(`ticket:${id}`).emit('ticket:updated', updated);

    return updated;
  });
}

// ─────────────────────────────────────────────────────────────
// Assign Ticket
// ─────────────────────────────────────────────────────────────
export async function assignTicket(id: string, assigneeId: string, assignedBy: string) {
  return db.transaction(async (tx) => {
    // Get assignee details
    const assignee = await tx.query.users.findFirst({
      where: eq(users.id, assigneeId),
      columns: { name: true },
    });

    // Update ticket
    const [ticket] = await tx
      .update(tickets)
      .set({
        assigneeId,
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, id))
      .returning();

    // Log activity
    await tx.insert(ticketActivities).values({
      ticketId: id,
      userId: assignedBy,
      action: 'assigned',
      metadata: { assigneeId, assigneeName: assignee?.name },
    });

    // Notify assignee
    io.to(`user:${assigneeId}`).emit('ticket:assigned', ticket);

    // Queue email to assignee
    await boss.send('email:ticket-assigned', { ticketId: id, assigneeId });

    return ticket;
  });
}

// ─────────────────────────────────────────────────────────────
// Verify Assignee
// ─────────────────────────────────────────────────────────────
export async function verifyAssignee(assigneeId: string, organizationId: string) {
  return db.query.userOrganizations.findFirst({
    where: and(
      eq(userOrganizations.userId, assigneeId),
      eq(userOrganizations.organizationId, organizationId),
      inArray(userOrganizations.role, ['agent', 'admin', 'owner'])
    ),
  });
}

// ─────────────────────────────────────────────────────────────
// Close Ticket
// ─────────────────────────────────────────────────────────────
export async function closeTicket(id: string, userId: string, resolution?: string) {
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .update(tickets)
      .set({
        status: 'closed',
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, id))
      .returning();

    await tx.insert(ticketActivities).values({
      ticketId: id,
      userId,
      action: 'closed',
      metadata: resolution ? { reason: resolution } : {},
    });

    // Cancel any pending SLA jobs
    await boss.cancel('sla:check', { ticketId: id });

    io.to(`ticket:${id}`).emit('ticket:closed', ticket);

    return ticket;
  });
}

// ─────────────────────────────────────────────────────────────
// Reopen Ticket
// ─────────────────────────────────────────────────────────────
export async function reopenTicket(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .update(tickets)
      .set({
        status: 'open',
        closedAt: null,
        resolvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, id))
      .returning();

    await tx.insert(ticketActivities).values({
      ticketId: id,
      userId,
      action: 'reopened',
    });

    io.to(`ticket:${id}`).emit('ticket:reopened', ticket);

    return ticket;
  });
}

// ─────────────────────────────────────────────────────────────
// Delete Ticket
// ─────────────────────────────────────────────────────────────
export async function deleteTicket(id: string) {
  await db.delete(tickets).where(eq(tickets.id, id));
}

// ─────────────────────────────────────────────────────────────
// Calculate SLA Deadline
// ─────────────────────────────────────────────────────────────
async function calculateSLADeadline(organizationId: string, priority: string): Promise<Date> {
  // Get org's SLA policy for this priority
  const policy = await db.query.slaPolicies.findFirst({
    where: and(
      eq(slaPolicies.organizationId, organizationId),
      eq(slaPolicies.priority, priority as any)
    ),
  });

  // Use policy or default times
  const responseMinutes = policy?.firstResponseTime ?? {
    low: 24 * 60,
    medium: 8 * 60,
    high: 4 * 60,
    urgent: 60,
  }[priority] ?? 8 * 60;

  return new Date(Date.now() + responseMinutes * 60 * 1000);
}
```

---

## 🛡️ Middleware

### Error Handler

```typescript
// backend/src/middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', error);

  // Zod validation error
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Validation failed',
      details: error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Custom app error
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  // Database errors
  if (error.message.includes('unique constraint')) {
    res.status(409).json({
      error: 'ConflictError',
      message: 'Resource already exists',
    });
    return;
  }

  // Unknown error
  res.status(500).json({
    error: 'InternalError',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : error.message,
  });
}
```

### Validation Middleware

```typescript
// backend/src/middleware/validate.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

type Target = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    
    if (!result.success) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Validation failed',
        details: result.error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }
    
    // Replace with parsed/transformed data
    req[target] = result.data;
    next();
  };
}
```

### Role Check Middleware

```typescript
// backend/src/middleware/require-role.ts
import { Request, Response, NextFunction } from 'express';

type Role = 'customer' | 'agent' | 'admin' | 'owner';

export function requireRole(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }
    
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
      return;
    }
    
    next();
  };
}
```

---

## 📨 API Response Examples

### List Tickets Response

```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "ticketNumber": 42,
      "title": "Cannot login to my account",
      "description": "I've been trying to login but keep getting an error...",
      "status": "pending",
      "priority": "high",
      "createdAt": "2025-11-28T10:30:00Z",
      "updatedAt": "2025-11-28T11:45:00Z",
      "customer": {
        "id": "user-123",
        "name": "John Doe",
        "email": "john@example.com",
        "avatarUrl": "https://..."
      },
      "assignee": {
        "id": "agent-456",
        "name": "Jane Agent",
        "avatarUrl": "https://..."
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "totalPages": 8,
    "hasMore": true
  }
}
```

### Error Response

```json
{
  "error": "ValidationError",
  "message": "Validation failed",
  "details": [
    {
      "path": "title",
      "message": "Title must be at least 5 characters"
    },
    {
      "path": "priority",
      "message": "Invalid enum value. Expected 'low' | 'medium' | 'high' | 'urgent'"
    }
  ]
}
```

---

## Next Steps

→ Continue to [07-frontend.md](./07-frontend.md) to build the Next.js frontend.
