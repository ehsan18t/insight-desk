import { z } from "zod";

// Update profile schema
export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

// User query params schema
export const userQuerySchema = z.object({
  search: z.string().max(100).optional(),
  role: z.enum(["customer", "agent", "admin", "owner"]).optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(["name", "email", "createdAt", "lastLoginAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// User ID param schema
export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

// Update user role schema (admin only)
export const updateUserRoleSchema = z.object({
  role: z.enum(["customer", "agent", "admin"]),
});

// Deactivate user schema
export const deactivateUserSchema = z.object({
  reason: z.string().max(500).optional(),
});

// Types
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
