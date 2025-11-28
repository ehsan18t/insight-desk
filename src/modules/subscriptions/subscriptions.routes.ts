/**
 * Subscriptions Routes
 * API endpoints for subscription and usage management
 */

import { type NextFunction, type Request, type Response, Router } from "express";
import { ForbiddenError, NotFoundError } from "@/middleware/error-handler";
import { validateRequest } from "@/middleware/validate";
import { authenticate, requireRole } from "@/modules/auth";
import { changePlanBody, usageQueryParams } from "./subscriptions.schema";
import { subscriptionsService } from "./subscriptions.service";

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/subscriptions/current - Get current subscription
// ─────────────────────────────────────────────────────────────
router.get("/current", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.organizationId) {
      throw new ForbiddenError("Organization context required");
    }

    const subscription = await subscriptionsService.getByOrganizationId(req.organizationId);

    if (!subscription) {
      throw new NotFoundError("No subscription found for this organization");
    }

    res.json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/subscriptions/usage - Get current usage
// ─────────────────────────────────────────────────────────────
router.get("/usage", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.organizationId) {
      throw new ForbiddenError("Organization context required");
    }

    const subscription = await subscriptionsService.getByOrganizationId(req.organizationId);
    if (!subscription) {
      throw new NotFoundError("No subscription found for this organization");
    }

    const usage = await subscriptionsService.getCurrentUsage(req.organizationId);

    // Calculate percentages for each usage type
    const limits = subscription.plan.limits;
    const usageData = usage
      ? {
          tickets: {
            used: usage.ticketsCreated,
            limit: limits.ticketsPerMonth,
            remaining: usage.ticketsRemaining,
            percentUsed:
              limits.ticketsPerMonth === -1
                ? 0
                : Math.round((usage.ticketsCreated / limits.ticketsPerMonth) * 100),
          },
          messages: {
            used: usage.messagesCreated,
            limit: limits.messagesPerMonth,
            remaining: usage.messagesRemaining,
            percentUsed:
              limits.messagesPerMonth === -1
                ? 0
                : Math.round((usage.messagesCreated / limits.messagesPerMonth) * 100),
          },
          storage: {
            usedMB: usage.storageUsedMB,
            limitMB: limits.storagePerOrgMB,
            remainingMB: usage.storageRemainingMB,
            percentUsed:
              limits.storagePerOrgMB === -1
                ? 0
                : Math.round((usage.storageUsedMB / limits.storagePerOrgMB) * 100),
          },
          apiRequests: {
            count: usage.apiRequestsCount,
            rateLimit: limits.apiRequestsPerMinute,
          },
          periodStart: usage.periodStart,
          periodEnd: usage.periodEnd,
        }
      : null;

    res.json({
      success: true,
      data: {
        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          slug: subscription.plan.slug,
        },
        usage: usageData,
        alertsEnabled: subscription.plan.alertsEnabled,
        alertThreshold: subscription.plan.alertThreshold,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/subscriptions/usage/history - Get usage history
// ─────────────────────────────────────────────────────────────
router.get(
  "/usage/history",
  requireRole("admin", "owner"),
  validateRequest({ query: usageQueryParams }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const options: { from?: Date; to?: Date } = {};
      if (req.query.periodStart) {
        options.from = new Date(req.query.periodStart as string);
      }
      if (req.query.periodEnd) {
        options.to = new Date(req.query.periodEnd as string);
      }

      const history = await subscriptionsService.getUsageHistory(req.organizationId, options);

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/subscriptions/limits/:type - Check specific limit
// ─────────────────────────────────────────────────────────────
router.get("/limits/:type", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.organizationId) {
      throw new ForbiddenError("Organization context required");
    }

    const usageType = req.params.type as "tickets" | "messages" | "storage" | "api";
    if (!["tickets", "messages", "storage", "api"].includes(usageType)) {
      throw new ForbiddenError("Invalid usage type");
    }

    const limitCheck = await subscriptionsService.checkLimit(req.organizationId, usageType);

    res.json({
      success: true,
      data: limitCheck,
    });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/subscriptions/change-plan - Change subscription plan
// ─────────────────────────────────────────────────────────────
router.post(
  "/change-plan",
  requireRole("owner"),
  validateRequest({ body: changePlanBody }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const result = await subscriptionsService.changePlan(req.organizationId, req.body.planId);

      res.json({
        success: true,
        data: {
          subscription: result,
          isUpgrade: result.isUpgrade,
          message: result.isUpgrade
            ? `Successfully upgraded to ${result.plan.name}`
            : `Successfully changed to ${result.plan.name}`,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/subscriptions/cancel - Cancel subscription
// ─────────────────────────────────────────────────────────────
router.post(
  "/cancel",
  requireRole("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const immediately = req.body.immediately === true;
      const subscription = await subscriptionsService.cancel(req.organizationId, immediately);

      res.json({
        success: true,
        data: {
          subscription,
          message: immediately
            ? "Subscription canceled immediately"
            : "Subscription will be canceled at the end of the current billing period",
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/subscriptions/reactivate - Reactivate canceled subscription
// ─────────────────────────────────────────────────────────────
router.post(
  "/reactivate",
  requireRole("owner"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organizationId) {
        throw new ForbiddenError("Organization context required");
      }

      const subscription = await subscriptionsService.reactivate(req.organizationId);

      res.json({
        success: true,
        data: {
          subscription,
          message: "Subscription reactivated successfully",
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export { router as subscriptionsRouter };
