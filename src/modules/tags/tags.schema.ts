/**
 * Tags Schema
 * Validation schemas for tag management
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Request Schemas
// ─────────────────────────────────────────────────────────────

export const tagNameParam = z.object({
  name: z.string().min(1, "Tag name is required").max(50, "Tag name too long"),
});

export const createTagBody = z.object({
  name: z
    .string()
    .min(1, "Tag name is required")
    .max(50, "Tag name too long")
    .transform((v) => v.toLowerCase().trim()),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format (use #RRGGBB)")
    .optional(),
});

export const updateTagBody = z.object({
  name: z
    .string()
    .min(1, "Tag name is required")
    .max(50, "Tag name too long")
    .transform((v) => v.toLowerCase().trim())
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format (use #RRGGBB)")
    .optional()
    .nullable(),
});

export const listTagsQuery = z.object({
  search: z.string().max(50).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export const popularTagsQuery = z.object({
  limit: z.coerce.number().min(1).max(20).default(10),
});

// ─────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────

export type TagNameParam = z.infer<typeof tagNameParam>;
export type CreateTagBody = z.infer<typeof createTagBody>;
export type UpdateTagBody = z.infer<typeof updateTagBody>;
export type ListTagsQuery = z.infer<typeof listTagsQuery>;
export type PopularTagsQuery = z.infer<typeof popularTagsQuery>;
