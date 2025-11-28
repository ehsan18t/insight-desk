/**
 * Audit Schema
 * Validation schemas for audit log management
 */

import { z } from "zod";

// Audit action enum values (must match database enum)
export const auditActions = [
  "user_login",
  "user_logout",
  "user_password_changed",
  "user_email_changed",
  "organization_created",
  "organization_updated",
  "organization_deleted",
  "subscription_created",
  "subscription_upgraded",
  "subscription_downgraded",
  "subscription_canceled",
  "subscription_renewed",
  "user_invited",
  "user_removed",
  "user_role_changed",
  "settings_updated",
  "sla_policy_created",
  "sla_policy_updated",
  "sla_policy_deleted",
  "data_exported",
  "api_key_created",
  "api_key_revoked",
] as const;

export type AuditAction = (typeof auditActions)[number];

// ─────────────────────────────────────────────────────────────
// Request Schemas
// ─────────────────────────────────────────────────────────────

export const auditLogIdParam = z.object({
  id: z.uuid("Invalid audit log ID"),
});

export const listAuditLogsQuery = z.object({
  page: z.coerce.number().int().min(1).prefault(1),
  limit: z.coerce.number().int().min(1).max(100).prefault(50),
  action: z.enum(auditActions).optional(),
  userId: z.uuid("Invalid user ID").optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  from: z.iso.datetime("Invalid date format").optional(),
  to: z.iso.datetime("Invalid date format").optional(),
  sortBy: z.enum(["createdAt", "action", "userId"]).prefault("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).prefault("desc"),
});

export const createAuditLogInput = z.object({
  action: z.enum(auditActions),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  previousValue: z.record(z.string(), z.unknown()).optional(),
  newValue: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const exportAuditLogsQuery = z.object({
  format: z.enum(["json", "csv"]).prefault("json"),
  action: z.enum(auditActions).optional(),
  userId: z.uuid("Invalid user ID").optional(),
  from: z.iso.datetime("Invalid date format").optional(),
  to: z.iso.datetime("Invalid date format").optional(),
});

// ─────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────

export type AuditLogIdParam = z.infer<typeof auditLogIdParam>;
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuery>;
export type CreateAuditLogInput = z.infer<typeof createAuditLogInput>;
export type ExportAuditLogsQuery = z.infer<typeof exportAuditLogsQuery>;
