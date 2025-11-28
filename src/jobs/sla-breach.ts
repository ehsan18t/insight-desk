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
    // Get all tickets that are open/pending and have SLA deadlines
    const ticketsToCheck = await db
      .select({
        id: tickets.id,
        orgId: tickets.organizationId,
        priority: tickets.priority,
        status: tickets.status,
        assigneeId: tickets.assigneeId,
        firstResponseAt: tickets.firstResponseAt,
        resolvedAt: tickets.resolvedAt,
        slaFirstResponseDeadline: tickets.slaFirstResponseDeadline,
        slaResolutionDeadline: tickets.slaResolutionDeadline,
      })
      .from(tickets)
      .where(
        and(
          or(eq(tickets.status, "open"), eq(tickets.status, "pending")),
          or(isNotNull(tickets.slaFirstResponseDeadline), isNotNull(tickets.slaResolutionDeadline)),
        ),
      );

    const now = new Date();

    for (const ticket of ticketsToCheck) {
      result.checked++;

      try {
        // Check first response SLA breach
        if (
          ticket.slaFirstResponseDeadline &&
          !ticket.firstResponseAt &&
          new Date(ticket.slaFirstResponseDeadline) < now
        ) {
          result.breached++;

          // Log activity for breach
          await db.insert(ticketActivities).values({
            ticketId: ticket.id,
            userId: null, // System action
            action: "sla_breached",
            metadata: {
              reason: "First response SLA breached",
              deadline: ticket.slaFirstResponseDeadline.toISOString(),
            },
          });

          logger.warn(
            { ticketId: ticket.id, deadline: ticket.slaFirstResponseDeadline },
            "First response SLA breached",
          );

          // TODO: Send notification to assignee or organization admins
        }

        // Check resolution SLA breach
        if (
          ticket.slaResolutionDeadline &&
          !ticket.resolvedAt &&
          new Date(ticket.slaResolutionDeadline) < now
        ) {
          result.breached++;

          await db.insert(ticketActivities).values({
            ticketId: ticket.id,
            userId: null,
            action: "sla_breached",
            metadata: {
              reason: "Resolution SLA breached",
              deadline: ticket.slaResolutionDeadline.toISOString(),
            },
          });

          logger.warn(
            { ticketId: ticket.id, deadline: ticket.slaResolutionDeadline },
            "Resolution SLA breached",
          );
        }

        // Check for upcoming SLA breaches (warnings - within 30 minutes)
        const warningThreshold = new Date(now.getTime() + 30 * 60 * 1000);

        if (
          ticket.slaFirstResponseDeadline &&
          !ticket.firstResponseAt &&
          new Date(ticket.slaFirstResponseDeadline) > now &&
          new Date(ticket.slaFirstResponseDeadline) < warningThreshold
        ) {
          result.warnings++;

          logger.info(
            { ticketId: ticket.id, deadline: ticket.slaFirstResponseDeadline },
            "First response SLA about to breach",
          );

          // TODO: Send warning notification
        }

        if (
          ticket.slaResolutionDeadline &&
          !ticket.resolvedAt &&
          new Date(ticket.slaResolutionDeadline) > now &&
          new Date(ticket.slaResolutionDeadline) < warningThreshold
        ) {
          result.warnings++;

          logger.info(
            { ticketId: ticket.id, deadline: ticket.slaResolutionDeadline },
            "Resolution SLA about to breach",
          );
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
      firstResponseAt: tickets.firstResponseAt,
      resolvedAt: tickets.resolvedAt,
      slaFirstResponseDeadline: tickets.slaFirstResponseDeadline,
      slaResolutionDeadline: tickets.slaResolutionDeadline,
    })
    .from(tickets)
    .where(
      and(
        eq(tickets.organizationId, organizationId),
        or(eq(tickets.status, "open"), eq(tickets.status, "pending")),
        or(isNotNull(tickets.slaFirstResponseDeadline), isNotNull(tickets.slaResolutionDeadline)),
      ),
    );

  let atRisk = 0;
  let breached = 0;
  let onTrack = 0;

  for (const ticket of ticketsWithSla) {
    const firstResponseBreached =
      ticket.slaFirstResponseDeadline &&
      !ticket.firstResponseAt &&
      new Date(ticket.slaFirstResponseDeadline) < now;

    const resolutionBreached =
      ticket.slaResolutionDeadline &&
      !ticket.resolvedAt &&
      new Date(ticket.slaResolutionDeadline) < now;

    if (firstResponseBreached || resolutionBreached) {
      breached++;
      continue;
    }

    const firstResponseAtRisk =
      ticket.slaFirstResponseDeadline &&
      !ticket.firstResponseAt &&
      new Date(ticket.slaFirstResponseDeadline) < warningThreshold;

    const resolutionAtRisk =
      ticket.slaResolutionDeadline &&
      !ticket.resolvedAt &&
      new Date(ticket.slaResolutionDeadline) < warningThreshold;

    if (firstResponseAtRisk || resolutionAtRisk) {
      atRisk++;
    } else {
      onTrack++;
    }
  }

  return { atRisk, breached, onTrack };
}
