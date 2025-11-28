/**
 * SLA Breach Check Job
 * Checks for tickets that have breached or are about to breach their SLA
 */

import { and, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { ticketActivities, tickets } from "@/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("jobs:sla-breach");

interface SlaBreachResult {
  checked: number;
  breached: number;
  warnings: number;
  errors: string[];
}

/**
 * Check all active tickets for SLA breaches
 */
export async function checkSlaBreaches(): Promise<SlaBreachResult> {
  const result: SlaBreachResult = {
    checked: 0,
    breached: 0,
    warnings: 0,
    errors: [],
  };

  try {
    const now = new Date();

    // Get all tickets that are open/pending, have SLA deadlines, and haven't already been marked as breached
    const ticketsToCheck = await db
      .select({
        id: tickets.id,
        orgId: tickets.organizationId,
        priority: tickets.priority,
        status: tickets.status,
        assigneeId: tickets.assigneeId,
        firstResponseAt: tickets.firstResponseAt,
        slaDeadline: tickets.slaDeadline,
        slaBreached: tickets.slaBreached,
      })
      .from(tickets)
      .where(
        and(
          or(eq(tickets.status, "open"), eq(tickets.status, "pending")),
          isNotNull(tickets.slaDeadline),
          eq(tickets.slaBreached, false),
        ),
      );

    for (const ticket of ticketsToCheck) {
      result.checked++;

      try {
        // Check if SLA deadline has passed
        if (ticket.slaDeadline && new Date(ticket.slaDeadline) < now) {
          result.breached++;

          // Mark ticket as breached
          await db.update(tickets).set({ slaBreached: true }).where(eq(tickets.id, ticket.id));

          // Log activity for breach
          await db.insert(ticketActivities).values({
            ticketId: ticket.id,
            userId: undefined, // System action
            action: "sla_breached",
            metadata: {
              reason: "SLA deadline breached",
              slaDeadline: ticket.slaDeadline.toISOString(),
            },
          });

          logger.warn({ ticketId: ticket.id, deadline: ticket.slaDeadline }, "SLA breached");

          // TODO: Send notification to assignee or organization admins
        }

        // Check for upcoming SLA breaches (warnings - within 30 minutes)
        const warningThreshold = new Date(now.getTime() + 30 * 60 * 1000);

        if (
          ticket.slaDeadline &&
          new Date(ticket.slaDeadline) > now &&
          new Date(ticket.slaDeadline) < warningThreshold
        ) {
          result.warnings++;

          logger.info({ ticketId: ticket.id, deadline: ticket.slaDeadline }, "SLA about to breach");

          // TODO: Send warning notification
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Ticket ${ticket.id}: ${errorMessage}`);
        logger.error({ ticketId: ticket.id, error }, "Error checking SLA for ticket");
      }
    }

    logger.info(result, "SLA breach check completed");
  } catch (error) {
    logger.error({ error }, "Fatal error in SLA breach check");
    throw error;
  }

  return result;
}

/**
 * Get SLA breach statistics for an organization
 */
export async function getSlaStats(organizationId: string): Promise<{
  atRisk: number;
  breached: number;
  onTrack: number;
}> {
  const now = new Date();
  const warningThreshold = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

  // Get active tickets with SLA deadlines
  const ticketsWithSla = await db
    .select({
      id: tickets.id,
      slaDeadline: tickets.slaDeadline,
      slaBreached: tickets.slaBreached,
    })
    .from(tickets)
    .where(
      and(
        eq(tickets.organizationId, organizationId),
        or(eq(tickets.status, "open"), eq(tickets.status, "pending")),
        isNotNull(tickets.slaDeadline),
      ),
    );

  let atRisk = 0;
  let breached = 0;
  let onTrack = 0;

  for (const ticket of ticketsWithSla) {
    // Already breached
    if (ticket.slaBreached) {
      breached++;
      continue;
    }

    // Check if deadline has passed
    if (ticket.slaDeadline && new Date(ticket.slaDeadline) < now) {
      breached++;
      continue;
    }

    // Check if at risk (within warning threshold)
    if (ticket.slaDeadline && new Date(ticket.slaDeadline) < warningThreshold) {
      atRisk++;
    } else {
      onTrack++;
    }
  }

  return { atRisk, breached, onTrack };
}
