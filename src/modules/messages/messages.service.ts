import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { type TicketMessage, ticketActivities, ticketMessages, tickets } from "@/db/schema/index";
import { createLogger } from "@/lib/logger";
import { emitToTicket, sendNotification } from "@/lib/socket";
import { ForbiddenError, NotFoundError } from "@/middleware/error-handler";
import type { CreateMessageInput, MessageQuery, UpdateMessageInput } from "./messages.schema";

const logger = createLogger("messages");

// ─────────────────────────────────────────────────────────────
// Messages Service
// ─────────────────────────────────────────────────────────────
export const messagesService = {
  // Create a new message on a ticket
  async create(
    ticketId: string,
    input: CreateMessageInput,
    senderId: string,
    senderRole?: string,
  ): Promise<TicketMessage> {
    // Verify ticket exists
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });

    if (!ticket) {
      throw new NotFoundError("Ticket not found");
    }

    // Internal notes can only be created by agents/admins
    if (input.type === "internal_note" && senderRole === "customer") {
      throw new ForbiddenError("Customers cannot create internal notes");
    }

    // Create the message
    const [message] = await db
      .insert(ticketMessages)
      .values({
        ticketId,
        senderId,
        content: input.content,
        type: input.type || "reply",
        attachments: input.attachments || [],
      })
      .returning();

    // Update ticket's updated_at timestamp
    await db.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, ticketId));

    // If this is the first agent response, record first response time
    if (senderRole && ["agent", "admin", "owner"].includes(senderRole)) {
      if (!ticket.firstResponseAt) {
        await db
          .update(tickets)
          .set({ firstResponseAt: new Date() })
          .where(eq(tickets.id, ticketId));
      }
    }

    // Log activity
    await db.insert(ticketActivities).values({
      ticketId,
      userId: senderId,
      action: "message_added",
      metadata: {
        messageType: input.type || "reply",
      },
    });

    // Emit real-time event to ticket room
    emitToTicket(ticketId, "ticket:message_added", {
      ticketId,
      messageId: message.id,
      message,
      senderId,
      type: input.type || "reply",
    });

    // Send notification to ticket participants
    // Notify customer if agent replied
    if (senderRole && ["agent", "admin", "owner"].includes(senderRole) && input.type !== "internal_note") {
      sendNotification({
        type: "notification",
        userId: ticket.customerId,
        data: {
          title: "New Reply",
          message: `You have a new reply on ticket #${ticket.ticketNumber}`,
          ticketId,
          action: "view_ticket",
        },
      });
    }

    // Notify assignee if customer replied
    if (senderRole === "customer" && ticket.assigneeId) {
      sendNotification({
        type: "notification",
        userId: ticket.assigneeId,
        data: {
          title: "Customer Reply",
          message: `Customer replied to ticket #${ticket.ticketNumber}: ${ticket.title}`,
          ticketId,
          action: "view_ticket",
        },
      });
    }

    logger.info({ ticketId, messageId: message.id }, "Message created");

    return message;
  },

  // Get messages for a ticket
  async list(ticketId: string, query: MessageQuery, userId: string, userRole?: string) {
    // Verify ticket exists and user has access
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });

    if (!ticket) {
      throw new NotFoundError("Ticket not found");
    }

    // Customers can only see their own tickets
    if (userRole === "customer" && ticket.customerId !== userId) {
      throw new ForbiddenError("Access denied to this ticket");
    }

    // Build conditions
    const conditions = [eq(ticketMessages.ticketId, ticketId)];

    // Customers cannot see internal notes
    if (userRole === "customer") {
      conditions.push(sql`${ticketMessages.type} != 'internal_note'`);
    }

    // Filter by type if specified
    if (query.type) {
      conditions.push(eq(ticketMessages.type, query.type));
    }

    // Pagination
    const offset = (query.page - 1) * query.limit;

    // Execute query
    const [data, totalResult] = await Promise.all([
      db.query.ticketMessages.findMany({
        where: and(...conditions),
        orderBy: asc(ticketMessages.createdAt),
        limit: query.limit,
        offset,
        with: {
          sender: {
            columns: { id: true, name: true, avatarUrl: true },
          },
        },
      }),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(ticketMessages)
        .where(and(...conditions)),
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

  // Get a single message by ID
  async getById(
    ticketId: string,
    messageId: string,
    userId: string,
    userRole?: string,
  ): Promise<
    TicketMessage & {
      sender: { id: string; name: string; avatarUrl: string | null } | null;
    }
  > {
    const message = await db.query.ticketMessages.findFirst({
      where: and(eq(ticketMessages.id, messageId), eq(ticketMessages.ticketId, ticketId)),
      with: {
        sender: {
          columns: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    if (!message) {
      throw new NotFoundError("Message not found");
    }

    // Verify ticket access
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });

    if (!ticket) {
      throw new NotFoundError("Ticket not found");
    }

    // Customers can only see their own tickets
    if (userRole === "customer" && ticket.customerId !== userId) {
      throw new ForbiddenError("Access denied to this message");
    }

    // Customers cannot see internal notes
    if (userRole === "customer" && message.type === "internal_note") {
      throw new ForbiddenError("Access denied to this message");
    }

    return message;
  },

  // Update a message
  async update(
    ticketId: string,
    messageId: string,
    input: UpdateMessageInput,
    userId: string,
  ): Promise<TicketMessage> {
    const message = await db.query.ticketMessages.findFirst({
      where: and(eq(ticketMessages.id, messageId), eq(ticketMessages.ticketId, ticketId)),
    });

    if (!message) {
      throw new NotFoundError("Message not found");
    }

    // Only the sender can edit their own message
    if (message.senderId !== userId) {
      throw new ForbiddenError("You can only edit your own messages");
    }

    // System messages cannot be edited
    if (message.type === "system") {
      throw new ForbiddenError("System messages cannot be edited");
    }

    // Update the message
    const [updated] = await db
      .update(ticketMessages)
      .set({
        content: input.content,
        isEdited: true,
        editedAt: new Date(),
      })
      .where(eq(ticketMessages.id, messageId))
      .returning();

    logger.info({ ticketId, messageId }, "Message updated");

    return updated;
  },

  // Delete a message
  async delete(
    ticketId: string,
    messageId: string,
    userId: string,
    userRole?: string,
  ): Promise<void> {
    const message = await db.query.ticketMessages.findFirst({
      where: and(eq(ticketMessages.id, messageId), eq(ticketMessages.ticketId, ticketId)),
    });

    if (!message) {
      throw new NotFoundError("Message not found");
    }

    // Only the sender or admins can delete messages
    const isAdmin = userRole && ["admin", "owner"].includes(userRole);
    if (message.senderId !== userId && !isAdmin) {
      throw new ForbiddenError("You can only delete your own messages");
    }

    // System messages cannot be deleted
    if (message.type === "system") {
      throw new ForbiddenError("System messages cannot be deleted");
    }

    await db.delete(ticketMessages).where(eq(ticketMessages.id, messageId));

    logger.info({ ticketId, messageId }, "Message deleted");
  },

  // Get message count for a ticket
  async getCount(ticketId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ticketMessages)
      .where(eq(ticketMessages.ticketId, ticketId));

    return result[0]?.count || 0;
  },
};
