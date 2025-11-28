/**
 * Categories Schema
 * Validation schemas for category management
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Request Schemas
// ─────────────────────────────────────────────────────────────

export const categoryIdParam = z.object({
  id: z.string().uuid("Invalid category ID"),
});

export const createCategoryBody = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(500, "Description too long").optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format (use #RRGGBB)")
    .optional(),
  parentId: z.string().uuid("Invalid parent category ID").optional().nullable(),
});

export const updateCategoryBody = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long").optional(),
  description: z.string().max(500, "Description too long").optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format (use #RRGGBB)")
    .optional()
    .nullable(),
  parentId: z.string().uuid("Invalid parent category ID").optional().nullable(),
  isActive: z.boolean().optional(),
});

export const listCategoriesQuery = z.object({
  includeInactive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  parentId: z.string().uuid("Invalid parent category ID").optional().nullable(),
});

// ─────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────

export type CategoryIdParam = z.infer<typeof categoryIdParam>;
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuery>;
