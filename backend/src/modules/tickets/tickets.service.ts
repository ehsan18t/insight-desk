import { db } from '../../db';
import {
  tickets,
  ticketActivities,
  slaPolicies,
  users,
  DEFAULT_SLA_TIMES,
  type Ticket,
  type NewTicket,
  type TicketPriority,
} from '../../db/schema/index';
import { eq, and, or, ilike, inArray, desc, asc, sql, isNull } from 'drizzle-orm';
import { NotFoundError, ForbiddenError } from '../../middleware/error-handler';
import { createLogger } from '../../lib/logger';
import type { CreateTicketInput, UpdateTicketInput, TicketQuery } from './tickets.schema';

const logger = createLogger('tickets');

// Get next ticket number for organization
async function getNextTicketNumber(organizationId: string): Promise<number> {
  const result = await db
    .select({ maxNumber: sql<number>`COALESCE(MAX(ticket_number), 0)` })
    .from(tickets)
    .where(eq(tickets.organizationId, organizationId));
  
  return (result[0]?.maxNumber || 0) + 1;
}

// Calculate SLA deadline based on priority
async function calculateSLADeadline(
  organizationId: string,
  priority: TicketPriority
): Promise<Date | null> {
  // Try to find org-specific SLA policy
  const policy = await db.query.slaPolicies.findFirst({
    where: and(
      eq(slaPolicies.organizationId, organizationId),
      eq(slaPolicies.priority, priority)
    ),
  });

  const responseTimeMinutes =
    policy?.firstResponseTime || DEFAULT_SLA_TIMES[priority].firstResponseTime;

  const deadline = new Date();
  deadline.setMinutes(deadline.getMinutes() + responseTimeMinutes);
  return deadline;
}

// ─────────────────────────────────────────────────────────────
// Ticket Service
// ─────────────────────────────────────────────────────────────
export const ticketsService = {
  // Create a new ticket
  async create(
    input: CreateTicketInput,
    organizationId: string,
    customerId: string
  ): Promise<Ticket> {
    const ticketNumber = await getNextTicketNumber(organizationId);
    const slaDeadline = await calculateSLADeadline(
      organizationId,
      input.priority || 'medium'
    );

    const [ticket] = await db
      .insert(tickets)
      .values({
        ticketNumber,
        title: input.title,
        description: input.description,
        priority: input.priority || 'medium',
        channel: input.channel || 'web',
        tags: input.tags || [],
        categoryId: input.categoryId,
        organizationId,
        customerId,
        slaDeadline,
      })
      .returning();

    // Log activity
    await db.insert(ticketActivities).values({
      ticketId: ticket.id,
      userId: customerId,
      action: 'created',
    });

    logger.info({ ticketId: ticket.id, ticketNumber }, 'Ticket created');

    return ticket;
  },

  // Get ticket by ID with access check
  async getById(
    ticketId: string,
    userId: string,
    userRole?: string,
    organizationId?: string
  ): Promise<Ticket & { customer: typeof users.$inferSelect; assignee?: typeof users.$inferSelect }> {
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      with: {
        customer: true,
        assignee: true,
      },
    });

    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    // Access check
    const isCustomer = ticket.customerId === userId;
    const isAgent = userRole && ['agent', 'admin', 'owner'].includes(userRole);
    const isOrgMember = organizationId === ticket.organizationId;

    if (!isCustomer && !(isAgent && isOrgMember)) {
      throw new ForbiddenError('Access denied to this ticket');
    }

    return ticket as Ticket & { customer: typeof users.$inferSelect; assignee?: typeof users.$inferSelect };
  },

  // List tickets with filters and pagination
  async list(
    query: TicketQuery,
    userId: string,
    userRole?: string,
    organizationId?: string
  ) {
    const conditions = [];

    // Base filter: organization context
    if (organizationId) {
      conditions.push(eq(tickets.organizationId, organizationId));
    }

    // Role-based filtering
    if (userRole === 'customer') {
      // Customers can only see their own tickets
      conditions.push(eq(tickets.customerId, userId));
    }

    // Query filters
    if (query.status) {
      conditions.push(eq(tickets.status, query.status));
    }

    if (query.priority) {
      conditions.push(eq(tickets.priority, query.priority));
    }

    if (query.assigneeId) {
      if (query.assigneeId === 'unassigned') {
        conditions.push(isNull(tickets.assigneeId));
      } else {
        conditions.push(eq(tickets.assigneeId, query.assigneeId));
      }
    }

    if (query.customerId) {
      conditions.push(eq(tickets.customerId, query.customerId));
    }

    if (query.search) {
      conditions.push(
        or(
          ilike(tickets.title, `%${query.search}%`),
          ilike(tickets.description, `%${query.search}%`)
        )!
      );
    }

    if (query.tags && query.tags.length > 0) {
      // PostgreSQL array overlap
      conditions.push(sql`${tickets.tags} && ${query.tags}`);
    }

    // Sorting
    const sortColumn = {
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      priority: tickets.priority,
      status: tickets.status,
    }[query.sortBy];

    const orderBy = query.sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    // Pagination
    const offset = (query.page - 1) * query.limit;

    // Execute query
    const [data, totalResult] = await Promise.all([
      db.query.tickets.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy,
        limit: query.limit,
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
        .where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    const total = totalResult[0]?.count || 0;

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  // Update ticket
  async update(
    ticketId: string,
    input: UpdateTicketInput,
    userId: string,
    _userRole?: string
  ): Promise<Ticket> {
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });

    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    // Build update object
    const updates: Partial<NewTicket> = {
      updatedAt: new Date(),
    };

    // Track changes for activity log
    const activities: { action: string; metadata: Record<string, unknown> }[] = [];

    if (input.title !== undefined) {
      updates.title = input.title;
    }

    if (input.description !== undefined) {
      updates.description = input.description;
    }

    if (input.priority !== undefined && input.priority !== ticket.priority) {
      updates.priority = input.priority;
      activities.push({
        action: 'priority_changed',
        metadata: { fromPriority: ticket.priority, toPriority: input.priority },
      });
    }

    if (input.status !== undefined && input.status !== ticket.status) {
      updates.status = input.status;
      activities.push({
        action: 'status_changed',
        metadata: { fromStatus: ticket.status, toStatus: input.status },
      });

      // Set resolved/closed timestamps
      if (input.status === 'resolved' && !ticket.resolvedAt) {
        updates.resolvedAt = new Date();
      }
      if (input.status === 'closed' && !ticket.closedAt) {
        updates.closedAt = new Date();
      }
    }

    if (input.tags !== undefined) {
      updates.tags = input.tags;
    }

    if (input.categoryId !== undefined) {
      updates.categoryId = input.categoryId;
    }

    // Perform update
    const [updated] = await db
      .update(tickets)
      .set(updates)
      .where(eq(tickets.id, ticketId))
      .returning();

    // Log activities
    for (const activity of activities) {
      await db.insert(ticketActivities).values({
        ticketId,
        userId,
        action: activity.action as 'priority_changed' | 'status_changed',
        metadata: activity.metadata,
      });
    }

    logger.info({ ticketId, updates: Object.keys(updates) }, 'Ticket updated');

    return updated;
  },

  // Assign ticket to agent
  async assign(
    ticketId: string,
    assigneeId: string | null,
    assignedBy: string
  ): Promise<Ticket> {
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });

    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    // Verify assignee exists (if not null)
    let assigneeName: string | undefined;
    if (assigneeId) {
      const assignee = await db.query.users.findFirst({
        where: eq(users.id, assigneeId),
      });
      if (!assignee) {
        throw new NotFoundError('Assignee not found');
      }
      assigneeName = assignee.name;
    }

    // Update ticket
    const [updated] = await db
      .update(tickets)
      .set({
        assigneeId,
        status: assigneeId ? 'pending' : 'open',
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    // Log activity
    await db.insert(ticketActivities).values({
      ticketId,
      userId: assignedBy,
      action: assigneeId ? 'assigned' : 'unassigned',
      metadata: assigneeId
        ? { assigneeId, assigneeName }
        : { previousAssignee: ticket.assigneeId },
    });

    logger.info({ ticketId, assigneeId }, 'Ticket assigned');

    return updated;
  },

  // Close ticket
  async close(ticketId: string, userId: string, reason?: string): Promise<Ticket> {
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });

    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    if (ticket.status === 'closed') {
      throw new ForbiddenError('Ticket is already closed');
    }

    const [updated] = await db
      .update(tickets)
      .set({
        status: 'closed',
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    await db.insert(ticketActivities).values({
      ticketId,
      userId,
      action: 'closed',
      metadata: reason ? { reason } : {},
    });

    logger.info({ ticketId }, 'Ticket closed');

    return updated;
  },

  // Reopen ticket
  async reopen(ticketId: string, userId: string): Promise<Ticket> {
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });

    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    if (ticket.status !== 'closed') {
      throw new ForbiddenError('Only closed tickets can be reopened');
    }

    const [updated] = await db
      .update(tickets)
      .set({
        status: 'open',
        closedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    await db.insert(ticketActivities).values({
      ticketId,
      userId,
      action: 'reopened',
    });

    logger.info({ ticketId }, 'Ticket reopened');

    return updated;
  },

  // Get ticket statistics for organization
  async getStats(organizationId: string) {
    const stats = await db
      .select({
        status: tickets.status,
        count: sql<number>`count(*)::int`,
      })
      .from(tickets)
      .where(eq(tickets.organizationId, organizationId))
      .groupBy(tickets.status);

    const byPriority = await db
      .select({
        priority: tickets.priority,
        count: sql<number>`count(*)::int`,
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.organizationId, organizationId),
          inArray(tickets.status, ['open', 'pending'])
        )
      )
      .groupBy(tickets.priority);

    return {
      byStatus: Object.fromEntries(stats.map((s) => [s.status, s.count])),
      byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p.count])),
      total: stats.reduce((sum, s) => sum + s.count, 0),
    };
  },
};
