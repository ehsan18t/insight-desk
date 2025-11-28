/**
 * Canned Responses Schema
 * Validation schemas for canned response endpoints
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// PARAMS
// ═══════════════════════════════════════════════════════════════════════════

export const cannedResponseIdParam = z.object({
  id: z.uuid("Invalid canned response ID"),
});

// ═══════════════════════════════════════════════════════════════════════════
// QUERY
// ═══════════════════════════════════════════════════════════════════════════

export const listCannedResponsesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  category: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// BODY
// ═══════════════════════════════════════════════════════════════════════════

export const createCannedResponseBody = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  shortcut: z.string().max(50).optional(),
  category: z.string().max(100).optional(),
});

export const updateCannedResponseBody = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
  shortcut: z.string().max(50).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
});

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type CannedResponseIdParam = z.infer<typeof cannedResponseIdParam>;
export type ListCannedResponsesQuery = z.infer<typeof listCannedResponsesQuery>;
export type CreateCannedResponseBody = z.infer<typeof createCannedResponseBody>;
export type UpdateCannedResponseBody = z.infer<typeof updateCannedResponseBody>;
