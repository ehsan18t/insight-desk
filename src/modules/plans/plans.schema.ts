/**
 * Plans Schema
 * Validation schemas for subscription plan management
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Shared Schemas
// ─────────────────────────────────────────────────────────────

export const planLimitsSchema = z.object({
  ticketsPerMonth: z.int().min(-1).prefault(100), // -1 = unlimited
  messagesPerMonth: z.int().min(-1).prefault(500),
  storagePerOrgMB: z.int().min(-1).prefault(500),
  apiRequestsPerMinute: z.int().min(1).prefault(60),
  agentsPerOrg: z.int().min(-1).prefault(3),
  customersPerOrg: z.int().min(-1).prefault(100),
  slaEnabled: z.boolean().prefault(false),
  customFieldsEnabled: z.boolean().prefault(false),
  reportingEnabled: z.boolean().prefault(true),
  apiAccessEnabled: z.boolean().prefault(false),
  prioritySupport: z.boolean().prefault(false),
});

export const planFeaturesSchema = z.object({
  ticketManagement: z.boolean().prefault(true),
  emailChannel: z.boolean().prefault(true),
  chatWidget: z.boolean().prefault(false),
  apiChannel: z.boolean().prefault(false),
  cannedResponses: z.boolean().prefault(true),
  tags: z.boolean().prefault(true),
  categories: z.boolean().prefault(true),
  fileAttachments: z.boolean().prefault(true),
  csatSurveys: z.boolean().prefault(false),
  slaManagement: z.boolean().prefault(false),
  customFields: z.boolean().prefault(false),
  analytics: z.boolean().prefault(false),
  advancedReporting: z.boolean().prefault(false),
  dataExport: z.boolean().prefault(false),
  customBranding: z.boolean().prefault(false),
  singleSignOn: z.boolean().prefault(false),
  auditLog: z.boolean().prefault(false),
  multipleWorkspaces: z.boolean().prefault(false),
});

// ─────────────────────────────────────────────────────────────
// Request Schemas
// ─────────────────────────────────────────────────────────────

export const planIdParam = z.object({
  id: z.uuid("Invalid plan ID"),
});

export const planSlugParam = z.object({
  slug: z.string().min(1, "Slug is required"),
});

export const createPlanBody = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50, "Slug too long")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
  description: z.string().max(500, "Description too long").optional(),
  price: z.int().min(0, "Price must be non-negative").prefault(0), // In cents
  currency: z.string().length(3, "Currency must be 3 characters").prefault("USD"),
  billingInterval: z.enum(["monthly", "yearly", "lifetime"]).prefault("monthly"),
  limits: planLimitsSchema,
  features: planFeaturesSchema,
  isActive: z.boolean().prefault(true),
  isDefault: z.boolean().prefault(false),
  isVisible: z.boolean().prefault(true),
  alertsEnabled: z.boolean().prefault(true),
  alertThreshold: z.int().min(50).max(100).prefault(90),
  position: z.int().min(0).prefault(0),
  stripeProductId: z.string().optional(),
  stripePriceId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).prefault({}),
});

export const updatePlanBody = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long").optional(),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50, "Slug too long")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes")
    .optional(),
  description: z.string().max(500, "Description too long").optional().nullable(),
  price: z.int().min(0, "Price must be non-negative").optional(),
  currency: z.string().length(3, "Currency must be 3 characters").optional(),
  billingInterval: z.enum(["monthly", "yearly", "lifetime"]).optional(),
  limits: planLimitsSchema.partial().optional(),
  features: planFeaturesSchema.partial().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  alertsEnabled: z.boolean().optional(),
  alertThreshold: z.int().min(50).max(100).optional(),
  position: z.int().min(0).optional(),
  stripeProductId: z.string().optional().nullable(),
  stripePriceId: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const listPlansQuery = z.object({
  includeInactive: z.stringbool({ truthy: ["true"], falsy: ["false"] }).optional(),
  includeHidden: z.stringbool({ truthy: ["true"], falsy: ["false"] }).optional(),
});

// ─────────────────────────────────────────────────────────────
// Type Exports
// ─────────────────────────────────────────────────────────────

export type PlanLimits = z.infer<typeof planLimitsSchema>;
export type PlanFeatures = z.infer<typeof planFeaturesSchema>;
export type PlanIdParam = z.infer<typeof planIdParam>;
export type PlanSlugParam = z.infer<typeof planSlugParam>;
export type CreatePlanBody = z.infer<typeof createPlanBody>;
export type UpdatePlanBody = z.infer<typeof updatePlanBody>;
export type ListPlansQuery = z.infer<typeof listPlansQuery>;
