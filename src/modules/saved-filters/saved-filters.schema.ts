import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Filter Criteria Schema
// ─────────────────────────────────────────────────────────────

export const filterCriteriaSchema = z.object({
  status: z.array(z.enum(["open", "pending", "resolved", "closed"])).optional(),
  priority: z.array(z.enum(["low", "medium", "high", "urgent"])).optional(),
  assigneeId: z.uuid().nullable().optional(),
  customerId: z.uuid().optional(),
  tags: z.array(z.string()).optional(),
  categoryId: z.uuid().optional(),
  search: z.string().optional(),
  dateRange: z
    .object({
      field: z.enum(["createdAt", "updatedAt", "resolvedAt", "closedAt"]),
      from: z.iso.datetime().optional(),
      to: z.iso.datetime().optional(),
    })
    .optional(),
});

// ─────────────────────────────────────────────────────────────
// Create Saved Filter
// ─────────────────────────────────────────────────────────────

export const createSavedFilterSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  description: z.string().max(500, "Description must be 500 characters or less").optional(),
  criteria: filterCriteriaSchema,
  isDefault: z.boolean().prefault(false),
  isShared: z.boolean().prefault(false),
  sortBy: z.enum(["createdAt", "updatedAt", "priority", "status"]).prefault("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).prefault("desc"),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color")
    .optional(),
  icon: z.string().max(50).optional(),
});

export type CreateSavedFilterInput = z.infer<typeof createSavedFilterSchema>;

// ─────────────────────────────────────────────────────────────
// Update Saved Filter
// ─────────────────────────────────────────────────────────────

export const updateSavedFilterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  criteria: filterCriteriaSchema.optional(),
  isDefault: z.boolean().optional(),
  isShared: z.boolean().optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "priority", "status"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .nullable(),
  icon: z.string().max(50).optional().nullable(),
  position: z.int().min(0).optional(),
});

export type UpdateSavedFilterInput = z.infer<typeof updateSavedFilterSchema>;

// ─────────────────────────────────────────────────────────────
// Query Schema
// ─────────────────────────────────────────────────────────────

export const savedFilterQuerySchema = z.object({
  includeShared: z.stringbool({ truthy: ["true"], falsy: ["false"] }).default(true),
});

export type SavedFilterQuery = z.infer<typeof savedFilterQuerySchema>;

// ─────────────────────────────────────────────────────────────
// Params Schema
// ─────────────────────────────────────────────────────────────

export const savedFilterIdParamSchema = z.object({
  id: z.uuid("Invalid filter ID"),
});

// ─────────────────────────────────────────────────────────────
// Reorder Schema
// ─────────────────────────────────────────────────────────────

export const reorderFiltersSchema = z.object({
  filterIds: z.array(z.uuid()).min(1, "At least one filter ID is required"),
});

export type ReorderFiltersInput = z.infer<typeof reorderFiltersSchema>;
