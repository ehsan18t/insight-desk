/**
 * Plans Schema
 * Validation schemas for subscription plan management
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Shared Schemas
// ─────────────────────────────────────────────────────────────

export const planLimitsSchema = z.object({
  ticketsPerMonth: z.int().min(-1).default(100), // -1 = unlimited
  messagesPerMonth: z.int().min(-1).default(500),
  storagePerOrgMB: z.int().min(-1).default(500),
  apiRequestsPerMinute: z.int().min(1).default(60),
  agentsPerOrg: z.int().min(-1).default(3),
  customersPerOrg: z.int().min(-1).default(100),
  slaEnabled: z.boolean().default(false),
  customFieldsEnabled: z.boolean().default(false),
  reportingEnabled: z.boolean().default(true),
  apiAccessEnabled: z.boolean().default(false),
  prioritySupport: z.boolean().default(false),
});

export const planFeaturesSchema = z.object({
  ticketManagement: z.boolean().default(true),
  emailChannel: z.boolean().default(true),
  chatWidget: z.boolean().default(false),
  apiChannel: z.boolean().default(false),
  cannedResponses: z.boolean().default(true),
  tags: z.boolean().default(true),
  categories: z.boolean().default(true),
  fileAttachments: z.boolean().default(true),
  csatSurveys: z.boolean().default(false),
  slaManagement: z.boolean().default(false),
  customFields: z.boolean().default(false),
  analytics: z.boolean().default(false),
  advancedReporting: z.boolean().default(false),
  dataExport: z.boolean().default(false),
  customBranding: z.boolean().default(false),
  singleSignOn: z.boolean().default(false),
  auditLog: z.boolean().default(false),
  multipleWorkspaces: z.boolean().default(false),
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
  price: z.int().min(0, "Price must be non-negative").default(0), // In cents
  currency: z.string().length(3, "Currency must be 3 characters").default("USD"),
  billingInterval: z.enum(["monthly", "yearly", "lifetime"]).default("monthly"),
  limits: planLimitsSchema,
  features: planFeaturesSchema,
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  isVisible: z.boolean().default(true),
  alertsEnabled: z.boolean().default(true),
  alertThreshold: z.int().min(50).max(100).default(90),
  position: z.int().min(0).default(0),
  stripeProductId: z.string().optional(),
  stripePriceId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
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
