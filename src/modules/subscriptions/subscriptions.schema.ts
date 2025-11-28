/**
 * Subscriptions Schema
 * Validation schemas for subscription and usage management
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Request Schemas
// ─────────────────────────────────────────────────────────────

export const subscribeBody = z.object({
  planId: z.string().uuid("Invalid plan ID"),
});

export const changePlanBody = z.object({
  planId: z.string().uuid("Invalid plan ID"),
});

export const usageQueryParams = z.object({
  periodStart: z.string().datetime("Invalid date format").optional(),
  periodEnd: z.string().datetime("Invalid date format").optional(),
});

// ─────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────

export type SubscribeBody = z.infer<typeof subscribeBody>;
export type ChangePlanBody = z.infer<typeof changePlanBody>;
export type UsageQueryParams = z.infer<typeof usageQueryParams>;

// ─────────────────────────────────────────────────────────────
// Usage Type Constants
// ─────────────────────────────────────────────────────────────

export type UsageType = "tickets" | "messages" | "storage" | "api";

export interface LimitCheckResult {
  allowed: boolean;
  usageType: UsageType;
  current: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  shouldAlert: boolean;
  upgradeUrl?: string;
}
