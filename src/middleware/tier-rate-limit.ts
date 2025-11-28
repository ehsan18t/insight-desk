/**
 * Tier-Based Rate Limit Middleware
 * Rate limiting based on subscription plan's apiRequestsPerMinute
 */

import type { NextFunction, Request, Response } from "express";
import { subscriptionsService } from "@/modules/subscriptions";

// In-memory store for rate limit tracking per organization
// For production, use Redis/Valkey for distributed rate limiting
const orgRequestCounts = new Map<string, { count: number; resetTime: number }>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of orgRequestCounts) {
    if (now > value.resetTime) {
      orgRequestCounts.delete(key);
    }
  }
}, 60 * 1000); // Clean every minute

// Default rate limit for unauthenticated or no-subscription requests
const DEFAULT_RATE_LIMIT = 30; // requests per minute

// Cache for organization rate limits (to avoid hitting DB on every request)
const rateLimitCache = new Map<string, { limit: number; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get rate limit for an organization (with caching)
 */
async function getOrgRateLimit(organizationId: string): Promise<number> {
  const now = Date.now();
  const cached = rateLimitCache.get(organizationId);

  if (cached && cached.expiresAt > now) {
    return cached.limit;
  }

  try {
    const subscription = await subscriptionsService.getByOrganizationId(organizationId);
    const limit = subscription?.plan?.limits?.apiRequestsPerMinute ?? DEFAULT_RATE_LIMIT;

    rateLimitCache.set(organizationId, {
      limit,
      expiresAt: now + CACHE_TTL,
    });

    return limit;
  } catch {
    // On error, use default limit
    return DEFAULT_RATE_LIMIT;
  }
}

/**
 * Tier-based rate limiter middleware
 * Uses the organization's subscription plan to determine rate limits
 */
export function tierRateLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const organizationId = req.organizationId;

    // If no organization context, skip tier-based rate limiting
    // The regular rate limiter will handle this
    if (!organizationId) {
      return next();
    }

    const rateLimit = await getOrgRateLimit(organizationId);
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window

    const key = `org:${organizationId}`;
    let record = orgRequestCounts.get(key);

    if (!record || now > record.resetTime) {
      // Create new record
      record = { count: 1, resetTime: now + windowMs };
      orgRequestCounts.set(key, record);
    } else {
      // Increment count
      record.count++;
    }

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", rateLimit);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, rateLimit - record.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));

    // Check if limit exceeded
    if (record.count > rateLimit) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader("Retry-After", retryAfter);

      return res.status(429).json({
        success: false,
        error: "Rate limit exceeded. Please upgrade your plan for higher limits.",
        code: "RATE_LIMIT_EXCEEDED",
        details: {
          limit: rateLimit,
          remaining: 0,
          resetAt: new Date(record.resetTime).toISOString(),
          retryAfterSeconds: retryAfter,
          upgradeUrl: "/settings/billing",
        },
      });
    }

    next();
  };
}

/**
 * Clear rate limit cache for an organization
 * Call this when subscription changes
 */
export function clearRateLimitCache(organizationId: string): void {
  rateLimitCache.delete(organizationId);
  orgRequestCounts.delete(`org:${organizationId}`);
}

/**
 * Clear all rate limit caches
 * Useful for testing
 */
export function clearAllRateLimitCaches(): void {
  rateLimitCache.clear();
  orgRequestCounts.clear();
}
