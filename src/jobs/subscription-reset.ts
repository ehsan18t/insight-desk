/**
 * Subscription Usage Reset Job
 * Resets monthly usage counters when billing periods expire
 */

import { and, lte } from "drizzle-orm";
import { adminDb } from "@/db/admin-db";
import { organizationSubscriptions } from "@/db/schema";
import { createLogger } from "@/lib/logger";
import { subscriptionsService } from "@/modules/subscriptions";

const logger = createLogger("jobs:subscription-reset");

/**
 * Reset usage for all subscriptions that have expired periods
 */
export async function resetExpiredSubscriptionUsage(): Promise<{
  processed: number;
  reset: number;
  errors: number;
}> {
  const now = new Date();
  const stats = { processed: 0, reset: 0, errors: 0 };

  logger.info("Starting subscription usage reset job");

  try {
    // Find subscriptions where current period has ended
    const expiredSubscriptions = await adminDb
      .select({
        id: organizationSubscriptions.id,
        organizationId: organizationSubscriptions.organizationId,
        status: organizationSubscriptions.status,
        currentPeriodEnd: organizationSubscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: organizationSubscriptions.cancelAtPeriodEnd,
      })
      .from(organizationSubscriptions)
      .where(and(lte(organizationSubscriptions.currentPeriodEnd, now)));

    logger.info({ count: expiredSubscriptions.length }, "Found expired subscriptions");

    for (const subscription of expiredSubscriptions) {
      stats.processed++;

      try {
        // If subscription should cancel at period end
        if (subscription.cancelAtPeriodEnd) {
          await adminDb
            .update(organizationSubscriptions)
            .set({
              status: "canceled",
              updatedAt: now,
            })
            .where(and(lte(organizationSubscriptions.currentPeriodEnd, now)));
          logger.info(
            { organizationId: subscription.organizationId },
            "Subscription canceled at period end",
          );
          continue;
        }

        // Reset usage for next period
        await subscriptionsService.resetUsageForNewPeriod(subscription.organizationId);
        stats.reset++;

        logger.info(
          { organizationId: subscription.organizationId },
          "Subscription usage reset for new period",
        );
      } catch (error) {
        stats.errors++;
        logger.error(
          { error, organizationId: subscription.organizationId },
          "Failed to reset subscription usage",
        );
      }
    }

    logger.info(stats, "Subscription usage reset job completed");
    return stats;
  } catch (error) {
    logger.error({ error }, "Subscription usage reset job failed");
    throw error;
  }
}

/**
 * Get subscriptions that will expire soon (for alerts)
 */
export async function getExpiringSubscriptions(
  withinHours: number = 24,
): Promise<Array<{ organizationId: string; currentPeriodEnd: Date }>> {
  const now = new Date();
  const threshold = new Date(now.getTime() + withinHours * 60 * 60 * 1000);

  const expiring = await adminDb
    .select({
      organizationId: organizationSubscriptions.organizationId,
      currentPeriodEnd: organizationSubscriptions.currentPeriodEnd,
    })
    .from(organizationSubscriptions)
    .where(and(lte(organizationSubscriptions.currentPeriodEnd, threshold)));

  return expiring;
}
