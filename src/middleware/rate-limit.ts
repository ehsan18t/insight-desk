import type { NextFunction, Request, Response } from "express";
import { config } from "@/config";
import { valkey } from "@/lib/cache";
import { createLogger } from "@/lib/logger";

const logger = createLogger("rate-limit");

// =============================================================================
// Distributed Rate Limiter using Valkey 9 Hash Field Expiration
// =============================================================================

// Key pattern: ratelimit:{prefix}:{windowId}
// Field: clientId -> count

/**
 * Get the current time window ID (for bucket-based rate limiting)
 */
function getWindowId(windowMs: number): string {
  return Math.floor(Date.now() / windowMs).toString();
}

/**
 * Get rate limit key for current window
 */
function getRateLimitKey(prefix: string, windowMs: number): string {
  const windowId = getWindowId(windowMs);
  return `ratelimit:${prefix}:${windowId}`;
}

// Get client identifier (IP or user ID)
function getClientId(req: Request): string {
  // Use user ID if authenticated, otherwise IP
  const userId = (req as { user?: { id: string } }).user?.id;
  if (userId) return `user:${userId}`;

  // Get IP from various headers (for proxies)
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return `ip:${ip.trim()}`;
  }

  return `ip:${req.ip || "unknown"}`;
}

/**
 * Increment rate limit counter in Valkey
 * Uses HINCRBY for atomic increment, then HEXPIRE to set field TTL
 */
async function incrementRateLimit(
  key: string,
  clientId: string,
  windowSeconds: number,
): Promise<number> {
  // Atomic increment
  const count = await valkey.hincrby(key, clientId, 1);

  // Set field expiration (Valkey 9 feature)
  // Only set expiration on first request (when count is 1)
  if (count === 1) {
    // Set key-level expiration as fallback (in case HEXPIRE fails)
    await valkey.expire(key, windowSeconds + 10); // Add buffer

    // Set field-level expiration using Valkey 9 HEXPIRE
    try {
      await valkey.call("HEXPIRE", key, windowSeconds, "FIELDS", 1, clientId);
    } catch (err) {
      // HEXPIRE might not be supported (Valkey < 9), fall back to key expiration
      logger.debug({ err }, "HEXPIRE not supported, using key expiration");
    }
  }

  return count;
}

// Rate limiter middleware
export function rateLimit(options?: {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
  prefix?: string;
}) {
  const windowMs = options?.windowMs ?? config.RATE_LIMIT_WINDOW_MS;
  const maxRequests = options?.maxRequests ?? config.RATE_LIMIT_MAX_REQUESTS;
  const message = options?.message ?? "Too many requests, please try again later";
  const prefix = options?.prefix ?? "default";
  const windowSeconds = Math.ceil(windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction) => {
    const clientId = getClientId(req);
    const key = getRateLimitKey(prefix, windowMs);

    try {
      // Increment counter atomically
      const count = await incrementRateLimit(key, clientId, windowSeconds);

      // Calculate reset time (end of current window)
      const windowId = parseInt(getWindowId(windowMs), 10);
      const resetTime = (windowId + 1) * windowMs;

      // Set rate limit headers
      res.set({
        "X-RateLimit-Limit": maxRequests.toString(),
        "X-RateLimit-Remaining": Math.max(0, maxRequests - count).toString(),
        "X-RateLimit-Reset": Math.ceil(resetTime / 1000).toString(),
      });

      if (count > maxRequests) {
        const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
        res.status(429).json({
          success: false,
          error: message,
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: Math.max(1, retryAfter),
        });
        return;
      }

      next();
    } catch (err) {
      // If Valkey fails, log and allow request (fail open)
      logger.error({ err, clientId }, "Rate limit check failed, allowing request");
      next();
    }
  };
}

// Stricter rate limit for auth endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message: "Too many login attempts, please try again later",
  prefix: "auth",
});
