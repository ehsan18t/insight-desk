/**
 * SLA Policies Schema
 * Validation schemas for SLA policy endpoints
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// PARAMS
// ═══════════════════════════════════════════════════════════════════════════

export const slaPolicyIdParam = z.object({
  id: z.uuid("Invalid SLA policy ID"),
});

// ═══════════════════════════════════════════════════════════════════════════
// QUERY
// ═══════════════════════════════════════════════════════════════════════════

export const listSlaPoliciesQuery = z.object({
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// BODY
// ═══════════════════════════════════════════════════════════════════════════

export const updateSlaPolicyBody = z.object({
  name: z.string().min(1).max(100).optional(),
  firstResponseTime: z.int().min(1).max(10080).optional(), // 1 min to 7 days
  resolutionTime: z.int().min(1).max(43200).optional(), // 1 min to 30 days
  businessHoursOnly: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const createSlaPolicyBody = z.object({
  name: z.string().min(1).max(100),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  firstResponseTime: z.int().min(1).max(10080), // in minutes
  resolutionTime: z.int().min(1).max(43200), // in minutes
  businessHoursOnly: z.boolean().prefault(true),
  isDefault: z.boolean().prefault(false),
});

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SlaPolicyIdParam = z.infer<typeof slaPolicyIdParam>;
export type ListSlaPoliciesQuery = z.infer<typeof listSlaPoliciesQuery>;
export type UpdateSlaPolicyBody = z.infer<typeof updateSlaPolicyBody>;
export type CreateSlaPolicyBody = z.infer<typeof createSlaPolicyBody>;
