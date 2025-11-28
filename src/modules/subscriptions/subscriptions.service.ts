/**
 * Subscriptions Service
 * Business logic for subscription and usage management
 */

import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  organizationSubscriptions,
  type PlanLimits,
  subscriptionPlans,
  subscriptionUsage,
} from "@/db/schema";
import { BadRequestError, ConflictError, NotFoundError } from "@/middleware/error-handler";
import { plansService } from "@/modules/plans";
import type { LimitCheckResult, UsageType } from "./subscriptions.schema";

export const subscriptionsService = {
  /**
   * Get subscription for an organization
   */
  async getByOrganizationId(organizationId: string) {
    const [subscription] = await db
      .select({
        id: organizationSubscriptions.id,
        organizationId: organizationSubscriptions.organizationId,
        planId: organizationSubscriptions.planId,
        status: organizationSubscriptions.status,
        currentPeriodStart: organizationSubscriptions.currentPeriodStart,
        currentPeriodEnd: organizationSubscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: organizationSubscriptions.cancelAtPeriodEnd,
        canceledAt: organizationSubscriptions.canceledAt,
        previousPlanId: organizationSubscriptions.previousPlanId,
        metadata: organizationSubscriptions.metadata,
        createdAt: organizationSubscriptions.createdAt,
        updatedAt: organizationSubscriptions.updatedAt,
        plan: {
          id: subscriptionPlans.id,
          name: subscriptionPlans.name,
          slug: subscriptionPlans.slug,
          price: subscriptionPlans.price,
          currency: subscriptionPlans.currency,
          billingInterval: subscriptionPlans.billingInterval,
          limits: subscriptionPlans.limits,
          features: subscriptionPlans.features,
          alertsEnabled: subscriptionPlans.alertsEnabled,
          alertThreshold: subscriptionPlans.alertThreshold,
        },
      })
      .from(organizationSubscriptions)
      .innerJoin(subscriptionPlans, eq(organizationSubscriptions.planId, subscriptionPlans.id))
      .where(eq(organizationSubscriptions.organizationId, organizationId))
      .limit(1);

    return subscription || null;
  },

  /**
   * Create subscription for an organization (using default plan)
   */
  async createForOrganization(organizationId: string, planId?: string) {
    // Check if subscription already exists
    const existing = await this.getByOrganizationId(organizationId);
    if (existing) {
      throw new ConflictError("Organization already has a subscription");
    }

    // Get the plan to use
    let plan: Awaited<ReturnType<typeof plansService.getById>>;
    if (planId) {
      plan = await plansService.getById(planId);
      if (!plan || !plan.isActive) {
        throw new NotFoundError("Plan not found or inactive");
      }
    } else {
      // Use default plan
      plan = await plansService.getDefault();
      if (!plan) {
        throw new NotFoundError("No default plan configured");
      }
    }

    // Calculate period (monthly billing period)
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Create subscription
    const [subscription] = await db
      .insert(organizationSubscriptions)
      .values({
        organizationId,
        planId: plan.id,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning();

    // Initialize usage record
    await this.initializeUsage(organizationId, now, periodEnd, plan.limits);

    return {
      ...subscription,
      plan,
    };
  },

  /**
   * Initialize usage record for a billing period
   */
  async initializeUsage(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
    limits: PlanLimits,
  ) {
    const [usage] = await db
      .insert(subscriptionUsage)
      .values({
        organizationId,
        periodStart,
        periodEnd,
        ticketsCreated: 0,
        messagesCreated: 0,
        storageUsedMB: 0,
        apiRequestsCount: 0,
        ticketsRemaining: limits.ticketsPerMonth === -1 ? 999999999 : limits.ticketsPerMonth,
        messagesRemaining: limits.messagesPerMonth === -1 ? 999999999 : limits.messagesPerMonth,
        storageRemainingMB: limits.storagePerOrgMB === -1 ? 999999999 : limits.storagePerOrgMB,
      })
      .returning();

    return usage;
  },

  /**
   * Get current usage for an organization
   */
  async getCurrentUsage(organizationId: string) {
    const now = new Date();

    const [usage] = await db
      .select()
      .from(subscriptionUsage)
      .where(
        and(
          eq(subscriptionUsage.organizationId, organizationId),
          lte(subscriptionUsage.periodStart, now),
          gte(subscriptionUsage.periodEnd, now),
        ),
      )
      .limit(1);

    return usage || null;
  },

  /**
   * Get usage history for an organization
   */
  async getUsageHistory(organizationId: string, options: { from?: Date; to?: Date } = {}) {
    const conditions = [eq(subscriptionUsage.organizationId, organizationId)];

    if (options.from) {
      conditions.push(gte(subscriptionUsage.periodStart, options.from));
    }
    if (options.to) {
      conditions.push(lte(subscriptionUsage.periodEnd, options.to));
    }

    const history = await db
      .select()
      .from(subscriptionUsage)
      .where(and(...conditions))
      .orderBy(subscriptionUsage.periodStart);

    return history;
  },

  /**
   * Check if a limit allows the operation
   */
  async checkLimit(organizationId: string, usageType: UsageType): Promise<LimitCheckResult> {
    const subscription = await this.getByOrganizationId(organizationId);
    if (!subscription) {
      return {
        allowed: false,
        usageType,
        current: 0,
        limit: 0,
        remaining: 0,
        percentUsed: 100,
        shouldAlert: false,
        upgradeUrl: "/settings/billing",
      };
    }

    const usage = await this.getCurrentUsage(organizationId);
    if (!usage) {
      // No usage record, probably needs initialization
      return {
        allowed: true,
        usageType,
        current: 0,
        limit: this.getLimitValue(subscription.plan.limits, usageType),
        remaining: this.getLimitValue(subscription.plan.limits, usageType),
        percentUsed: 0,
        shouldAlert: false,
      };
    }

    const limit = this.getLimitValue(subscription.plan.limits, usageType);
    const current = this.getCurrentValue(usage, usageType);
    const remaining = limit === -1 ? 999999999 : Math.max(0, limit - current);
    const percentUsed = limit === -1 ? 0 : Math.round((current / limit) * 100);

    const allowed = limit === -1 || current < limit;
    const shouldAlert =
      subscription.plan.alertsEnabled &&
      limit !== -1 &&
      percentUsed >= subscription.plan.alertThreshold;

    return {
      allowed,
      usageType,
      current,
      limit,
      remaining,
      percentUsed,
      shouldAlert,
      upgradeUrl: allowed ? undefined : "/settings/billing",
    };
  },

  /**
   * Increment usage counter
   */
  async incrementUsage(
    organizationId: string,
    usageType: UsageType,
    amount: number = 1,
  ): Promise<void> {
    const usage = await this.getCurrentUsage(organizationId);
    if (!usage) {
      // Try to initialize usage
      const subscription = await this.getByOrganizationId(organizationId);
      if (subscription) {
        await this.initializeUsage(
          organizationId,
          subscription.currentPeriodStart,
          subscription.currentPeriodEnd,
          subscription.plan.limits,
        );
      }
      return;
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    switch (usageType) {
      case "tickets":
        updateData.ticketsCreated = usage.ticketsCreated + amount;
        updateData.ticketsRemaining = Math.max(0, usage.ticketsRemaining - amount);
        break;
      case "messages":
        updateData.messagesCreated = usage.messagesCreated + amount;
        updateData.messagesRemaining = Math.max(0, usage.messagesRemaining - amount);
        break;
      case "storage":
        updateData.storageUsedMB = usage.storageUsedMB + amount;
        updateData.storageRemainingMB = Math.max(0, usage.storageRemainingMB - amount);
        break;
      case "api":
        updateData.apiRequestsCount = usage.apiRequestsCount + amount;
        break;
    }

    await db.update(subscriptionUsage).set(updateData).where(eq(subscriptionUsage.id, usage.id));
  },

  /**
   * Change organization's plan
   */
  async changePlan(organizationId: string, newPlanId: string) {
    const subscription = await this.getByOrganizationId(organizationId);
    if (!subscription) {
      throw new NotFoundError("Subscription not found");
    }

    const newPlan = await plansService.getById(newPlanId);
    if (!newPlan || !newPlan.isActive) {
      throw new NotFoundError("Plan not found or inactive");
    }

    if (subscription.planId === newPlanId) {
      throw new BadRequestError("Already subscribed to this plan");
    }

    const oldPlan = subscription.plan;
    const isUpgrade = newPlan.price > oldPlan.price;

    // Update subscription
    const [updatedSubscription] = await db
      .update(organizationSubscriptions)
      .set({
        planId: newPlanId,
        previousPlanId: subscription.planId,
        updatedAt: new Date(),
      })
      .where(eq(organizationSubscriptions.id, subscription.id))
      .returning();

    // Update usage limits based on plan change
    const usage = await this.getCurrentUsage(organizationId);
    if (usage) {
      await this.adjustUsageLimits(usage.id, oldPlan.limits, newPlan.limits, isUpgrade);
    }

    return {
      ...updatedSubscription,
      plan: newPlan,
      previousPlan: oldPlan,
      isUpgrade,
    };
  },

  /**
   * Adjust usage limits when plan changes
   * - Upgrade: Add remaining to existing
   * - Downgrade: Just decrease remaining (don't add)
   */
  async adjustUsageLimits(
    usageId: string,
    oldLimits: PlanLimits,
    newLimits: PlanLimits,
    isUpgrade: boolean,
  ) {
    const [currentUsage] = await db
      .select()
      .from(subscriptionUsage)
      .where(eq(subscriptionUsage.id, usageId))
      .limit(1);

    if (!currentUsage) return;

    let ticketsRemaining: number;
    let messagesRemaining: number;
    let storageRemainingMB: number;

    if (isUpgrade) {
      // Add the difference to remaining
      const ticketDiff =
        newLimits.ticketsPerMonth === -1
          ? 999999999
          : oldLimits.ticketsPerMonth === -1
            ? 0
            : newLimits.ticketsPerMonth - oldLimits.ticketsPerMonth;
      ticketsRemaining =
        newLimits.ticketsPerMonth === -1
          ? 999999999
          : currentUsage.ticketsRemaining + Math.max(0, ticketDiff);

      const messageDiff =
        newLimits.messagesPerMonth === -1
          ? 999999999
          : oldLimits.messagesPerMonth === -1
            ? 0
            : newLimits.messagesPerMonth - oldLimits.messagesPerMonth;
      messagesRemaining =
        newLimits.messagesPerMonth === -1
          ? 999999999
          : currentUsage.messagesRemaining + Math.max(0, messageDiff);

      const storageDiff =
        newLimits.storagePerOrgMB === -1
          ? 999999999
          : oldLimits.storagePerOrgMB === -1
            ? 0
            : newLimits.storagePerOrgMB - oldLimits.storagePerOrgMB;
      storageRemainingMB =
        newLimits.storagePerOrgMB === -1
          ? 999999999
          : currentUsage.storageRemainingMB + Math.max(0, storageDiff);
    } else {
      // Downgrade: calculate new remaining based on current usage
      ticketsRemaining =
        newLimits.ticketsPerMonth === -1
          ? 999999999
          : Math.max(0, newLimits.ticketsPerMonth - currentUsage.ticketsCreated);
      messagesRemaining =
        newLimits.messagesPerMonth === -1
          ? 999999999
          : Math.max(0, newLimits.messagesPerMonth - currentUsage.messagesCreated);
      storageRemainingMB =
        newLimits.storagePerOrgMB === -1
          ? 999999999
          : Math.max(0, newLimits.storagePerOrgMB - currentUsage.storageUsedMB);
    }

    await db
      .update(subscriptionUsage)
      .set({
        ticketsRemaining,
        messagesRemaining,
        storageRemainingMB,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionUsage.id, usageId));
  },

  /**
   * Cancel subscription
   */
  async cancel(organizationId: string, immediately: boolean = false) {
    const subscription = await this.getByOrganizationId(organizationId);
    if (!subscription) {
      throw new NotFoundError("Subscription not found");
    }

    if (immediately) {
      // Immediate cancellation
      await db
        .update(organizationSubscriptions)
        .set({
          status: "canceled",
          canceledAt: new Date(),
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        })
        .where(eq(organizationSubscriptions.id, subscription.id));
    } else {
      // Cancel at period end
      await db
        .update(organizationSubscriptions)
        .set({
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(organizationSubscriptions.id, subscription.id));
    }

    return this.getByOrganizationId(organizationId);
  },

  /**
   * Reactivate canceled subscription
   */
  async reactivate(organizationId: string) {
    const subscription = await this.getByOrganizationId(organizationId);
    if (!subscription) {
      throw new NotFoundError("Subscription not found");
    }

    if (subscription.status !== "canceled" && !subscription.cancelAtPeriodEnd) {
      throw new BadRequestError("Subscription is not canceled");
    }

    await db
      .update(organizationSubscriptions)
      .set({
        status: "active",
        cancelAtPeriodEnd: false,
        canceledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(organizationSubscriptions.id, subscription.id));

    return this.getByOrganizationId(organizationId);
  },

  /**
   * Reset usage for new billing period
   */
  async resetUsageForNewPeriod(organizationId: string) {
    const subscription = await this.getByOrganizationId(organizationId);
    if (!subscription) return null;

    // Calculate new period
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Update subscription period
    await db
      .update(organizationSubscriptions)
      .set({
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        updatedAt: now,
      })
      .where(eq(organizationSubscriptions.id, subscription.id));

    // Create new usage record
    return this.initializeUsage(organizationId, now, periodEnd, subscription.plan.limits);
  },

  /**
   * Mark alert as sent to prevent spam
   */
  async markAlertSent(organizationId: string, usageType: UsageType) {
    const usage = await this.getCurrentUsage(organizationId);
    if (!usage) return;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    switch (usageType) {
      case "tickets":
        updateData.ticketAlertSentAt = new Date();
        break;
      case "messages":
        updateData.messageAlertSentAt = new Date();
        break;
      case "storage":
        updateData.storageAlertSentAt = new Date();
        break;
    }

    await db.update(subscriptionUsage).set(updateData).where(eq(subscriptionUsage.id, usage.id));
  },

  // ─────────────────────────────────────────────────────────────
  // Helper methods
  // ─────────────────────────────────────────────────────────────

  getLimitValue(limits: PlanLimits, usageType: UsageType): number {
    switch (usageType) {
      case "tickets":
        return limits.ticketsPerMonth;
      case "messages":
        return limits.messagesPerMonth;
      case "storage":
        return limits.storagePerOrgMB;
      case "api":
        return limits.apiRequestsPerMinute;
      default:
        return 0;
    }
  },

  getCurrentValue(
    usage: {
      ticketsCreated: number;
      messagesCreated: number;
      storageUsedMB: number;
      apiRequestsCount: number;
    },
    usageType: UsageType,
  ): number {
    switch (usageType) {
      case "tickets":
        return usage.ticketsCreated;
      case "messages":
        return usage.messagesCreated;
      case "storage":
        return usage.storageUsedMB;
      case "api":
        return usage.apiRequestsCount;
      default:
        return 0;
    }
  },
};
