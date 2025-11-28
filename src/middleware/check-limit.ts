/**
 * Check Limit Middleware
 * Middleware to check subscription limits before operations
 */

import type { NextFunction, Request, Response } from "express";
import { ForbiddenError } from "@/middleware/error-handler";
import { subscriptionsService, type UsageType } from "@/modules/subscriptions";

export class LimitExceededError extends ForbiddenError {
  public readonly usageType: UsageType;
  public readonly current: number;
  public readonly limit: number;
  public readonly upgradeUrl: string;

  constructor(usageType: UsageType, current: number, limit: number, upgradeUrl: string) {
    super(
      `You have reached your ${usageType} limit (${current}/${limit}). ` +
        `Please upgrade your plan to continue.`,
    );
    this.usageType = usageType;
    this.current = current;
    this.limit = limit;
    this.upgradeUrl = upgradeUrl;
  }
}

/**
 * Middleware factory to check usage limits
 * @param usageType - Type of usage to check (tickets, messages, storage, api)
 * @param incrementOnSuccess - Whether to increment usage after the request succeeds
 */
export function checkLimit(usageType: UsageType, incrementOnSuccess: boolean = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organizationId;

      if (!organizationId) {
        // No organization context, skip limit check
        return next();
      }

      const limitCheck = await subscriptionsService.checkLimit(organizationId, usageType);

      if (!limitCheck.allowed) {
        throw new LimitExceededError(
          usageType,
          limitCheck.current,
          limitCheck.limit,
          limitCheck.upgradeUrl || "/settings/billing",
        );
      }

      // Attach limit info to request for potential use in route handlers
      (req as Request & { limitCheck: typeof limitCheck }).limitCheck = limitCheck;

      // If we should send an alert, we'll check after the response
      if (limitCheck.shouldAlert) {
        res.on("finish", () => {
          subscriptionsService.markAlertSent(organizationId, usageType).catch(() => {
            // Ignore alert marking errors
          });
        });
      }

      // If we should increment usage on success, do it after the response
      if (incrementOnSuccess) {
        res.on("finish", () => {
          // Only increment on successful responses (2xx status codes)
          if (res.statusCode >= 200 && res.statusCode < 300) {
            subscriptionsService.incrementUsage(organizationId, usageType).catch(() => {
              // Ignore usage increment errors
            });
          }
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to increment usage after successful operation
 * Use this when you need to increment usage manually (e.g., after storage upload)
 * @param usageType - Type of usage to increment
 * @param amount - Amount to increment (default 1)
 */
export function incrementUsage(usageType: UsageType, amount: number = 1) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organizationId;

      if (!organizationId) {
        return next();
      }

      await subscriptionsService.incrementUsage(organizationId, usageType, amount);
      next();
    } catch {
      // Don't fail the request if usage increment fails
      next();
    }
  };
}

/**
 * Shorthand middlewares for common limit checks
 */
export const checkTicketLimit = checkLimit("tickets", true);
export const checkMessageLimit = checkLimit("messages", true);
export const checkStorageLimit = checkLimit("storage", false); // Storage is incremented manually after upload
export const checkApiLimit = checkLimit("api", true);
