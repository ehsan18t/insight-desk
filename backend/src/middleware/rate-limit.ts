import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

// Simple in-memory rate limiter
// For production, use Redis/Valkey-based limiter
const requestCounts = new Map<string, { count: number; resetTime: number }>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCounts) {
    if (now > value.resetTime) {
      requestCounts.delete(key);
    }
  }
}, 60000); // Clean every minute

// Get client identifier (IP or user ID)
function getClientId(req: Request): string {
  // Use user ID if authenticated, otherwise IP
  const userId = (req as { user?: { id: string } }).user?.id;
  if (userId) return `user:${userId}`;

  // Get IP from various headers (for proxies)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return `ip:${ip.trim()}`;
  }

  return `ip:${req.ip || 'unknown'}`;
}

// Rate limiter middleware
export function rateLimit(options?: {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
}) {
  const windowMs = options?.windowMs ?? config.RATE_LIMIT_WINDOW_MS;
  const maxRequests = options?.maxRequests ?? config.RATE_LIMIT_MAX_REQUESTS;
  const message = options?.message ?? 'Too many requests, please try again later';

  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = getClientId(req);
    const now = Date.now();

    let record = requestCounts.get(clientId);

    if (!record || now > record.resetTime) {
      // Create new record
      record = { count: 1, resetTime: now + windowMs };
      requestCounts.set(clientId, record);
    } else {
      record.count++;
    }

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': Math.max(0, maxRequests - record.count).toString(),
      'X-RateLimit-Reset': Math.ceil(record.resetTime / 1000).toString(),
    });

    if (record.count > maxRequests) {
      res.status(429).json({
        success: false,
        error: message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
      return;
    }

    next();
  };
}

// Stricter rate limit for auth endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
  message: 'Too many login attempts, please try again later',
});
