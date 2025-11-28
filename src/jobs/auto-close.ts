/**
 * Auto-Close Stale Tickets Job
 * Automatically closes tickets that have been resolved or pending for too long
 */

import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { ticketActivities, tickets } from "@/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("jobs:auto-close");

interface AutoCloseResult {
  checked: number;
  closed: number;
  errors: string[];
}

interface AutoCloseConfig {
  // Days after last activity to auto-close resolved tickets
  resolvedDays: number;
  // Days after last activity to auto-close pending tickets
  pendingDays: number;
}

const DEFAULT_CONFIG: AutoCloseConfig = {
  resolvedDays: 7,
  pendingDays: 14,
};

/**
 * Auto-close stale tickets based on their status
 */
export async function autoCloseStaleTickets(
  config: Partial<AutoCloseConfig> = {},
): Promise<AutoCloseResult> {
  const { resolvedDays, pendingDays } = { ...DEFAULT_CONFIG, ...config };

  const result: AutoCloseResult = {
    checked: 0,
    closed: 0,
    errors: [],
  };

  try {
    const now = new Date();
    const resolvedCutoff = new Date(now.getTime() - resolvedDays * 24 * 60 * 60 * 1000);
    const pendingCutoff = new Date(now.getTime() - pendingDays * 24 * 60 * 60 * 1000);

    // Find resolved tickets older than the cutoff
    const staleResolvedTickets = await db
      .select({
        id: tickets.id,
        status: tickets.status,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .where(and(eq(tickets.status, "resolved"), lt(tickets.updatedAt, resolvedCutoff)));

    // Find pending tickets with no activity older than the cutoff
    const stalePendingTickets = await db
      .select({
        id: tickets.id,
        status: tickets.status,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .where(and(eq(tickets.status, "pending"), lt(tickets.updatedAt, pendingCutoff)));

    const ticketsToClose = [...staleResolvedTickets, ...stalePendingTickets];
    result.checked = ticketsToClose.length;

    for (const ticket of ticketsToClose) {
      try {
        // Update ticket to closed
        await db
          .update(tickets)
          .set({
            status: "closed",
            closedAt: now,
            updatedAt: now,
          })
          .where(eq(tickets.id, ticket.id));

        // Log activity
        await db.insert(ticketActivities).values({
          ticketId: ticket.id,
          userId: null, // System action
          action: "status_changed",
          metadata: {
            fromStatus: ticket.status,
            toStatus: "closed",
            reason: `Auto-closed after ${ticket.status === "resolved" ? resolvedDays : pendingDays} days of inactivity`,
          },
        });

        result.closed++;

        logger.info({ ticketId: ticket.id, previousStatus: ticket.status }, "Ticket auto-closed");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Ticket ${ticket.id}: ${errorMessage}`);
        logger.error({ ticketId: ticket.id, error }, "Error auto-closing ticket");
      }
    }

    logger.info(result, "Auto-close job completed");
  } catch (error) {
    logger.error({ error }, "Fatal error in auto-close job");
    throw error;
  }

  return result;
}

/**
 * Get count of tickets that will be auto-closed
 */
export async function getAutoClosePreview(
  organizationId: string,
  config: Partial<AutoCloseConfig> = {},
): Promise<{
  resolvedToClose: number;
  pendingToClose: number;
  cutoffs: {
    resolved: Date;
    pending: Date;
  };
}> {
  const { resolvedDays, pendingDays } = { ...DEFAULT_CONFIG, ...config };

  const now = new Date();
  const resolvedCutoff = new Date(now.getTime() - resolvedDays * 24 * 60 * 60 * 1000);
  const pendingCutoff = new Date(now.getTime() - pendingDays * 24 * 60 * 60 * 1000);

  const resolvedCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(
      and(
        eq(tickets.organizationId, organizationId),
        eq(tickets.status, "resolved"),
        lt(tickets.updatedAt, resolvedCutoff),
      ),
    );

  const pendingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(tickets)
    .where(
      and(
        eq(tickets.organizationId, organizationId),
        eq(tickets.status, "pending"),
        lt(tickets.updatedAt, pendingCutoff),
      ),
    );

  return {
    resolvedToClose: Number(resolvedCount[0]?.count || 0),
    pendingToClose: Number(pendingCount[0]?.count || 0),
    cutoffs: {
      resolved: resolvedCutoff,
      pending: pendingCutoff,
    },
  };
}
