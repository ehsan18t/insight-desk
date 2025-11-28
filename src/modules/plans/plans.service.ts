/**
 * Plans Service
 * Business logic for subscription plan management
 */

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { ConflictError, NotFoundError } from "@/middleware/error-handler";
import type { CreatePlanBody, UpdatePlanBody } from "./plans.schema";

// Default plan limits for the free tier
export const DEFAULT_FREE_LIMITS = {
  ticketsPerMonth: 50,
  messagesPerMonth: 200,
  storagePerOrgMB: 100,
  apiRequestsPerMinute: 30,
  agentsPerOrg: 2,
  customersPerOrg: 50,
  slaEnabled: false,
  customFieldsEnabled: false,
  reportingEnabled: false,
  apiAccessEnabled: false,
  prioritySupport: false,
};

export const DEFAULT_FREE_FEATURES = {
  ticketManagement: true,
  emailChannel: true,
  chatWidget: false,
  apiChannel: false,
  cannedResponses: true,
  tags: true,
  categories: true,
  fileAttachments: true,
  csatSurveys: false,
  slaManagement: false,
  customFields: false,
  analytics: false,
  advancedReporting: false,
  dataExport: false,
  customBranding: false,
  singleSignOn: false,
  auditLog: false,
  multipleWorkspaces: false,
};

export const plansService = {
  /**
   * List all plans
   */
  async list(options: { includeInactive?: boolean; includeHidden?: boolean } = {}) {
    const conditions = [];

    if (!options.includeInactive) {
      conditions.push(eq(subscriptionPlans.isActive, true));
    }

    if (!options.includeHidden) {
      conditions.push(eq(subscriptionPlans.isVisible, true));
    }

    const result = await db
      .select()
      .from(subscriptionPlans)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(subscriptionPlans.position), asc(subscriptionPlans.price));

    return result;
  },

  /**
   * Get plan by ID
   */
  async getById(id: string) {
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, id))
      .limit(1);

    return plan || null;
  },

  /**
   * Get plan by slug
   */
  async getBySlug(slug: string) {
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.slug, slug))
      .limit(1);

    return plan || null;
  },

  /**
   * Get default plan (auto-assigned to new organizations)
   */
  async getDefault() {
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(and(eq(subscriptionPlans.isDefault, true), eq(subscriptionPlans.isActive, true)))
      .limit(1);

    return plan || null;
  },

  /**
   * Create a new plan
   */
  async create(data: CreatePlanBody) {
    // Check for duplicate slug
    const existing = await this.getBySlug(data.slug);
    if (existing) {
      throw new ConflictError(`Plan with slug "${data.slug}" already exists`);
    }

    // If this plan is default, unset other defaults
    if (data.isDefault) {
      await db
        .update(subscriptionPlans)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(subscriptionPlans.isDefault, true));
    }

    const [plan] = await db
      .insert(subscriptionPlans)
      .values({
        name: data.name,
        slug: data.slug,
        description: data.description,
        price: data.price,
        currency: data.currency,
        billingInterval: data.billingInterval,
        limits: data.limits,
        features: data.features,
        isActive: data.isActive,
        isDefault: data.isDefault,
        isVisible: data.isVisible,
        alertsEnabled: data.alertsEnabled,
        alertThreshold: data.alertThreshold,
        position: data.position,
        stripeProductId: data.stripeProductId,
        stripePriceId: data.stripePriceId,
        metadata: data.metadata,
      })
      .returning();

    return plan;
  },

  /**
   * Update a plan
   */
  async update(id: string, data: UpdatePlanBody) {
    const existing = await this.getById(id);
    if (!existing) {
      throw new NotFoundError("Plan not found");
    }

    // Check for duplicate slug if changing
    if (data.slug && data.slug !== existing.slug) {
      const slugExists = await this.getBySlug(data.slug);
      if (slugExists) {
        throw new ConflictError(`Plan with slug "${data.slug}" already exists`);
      }
    }

    // If setting as default, unset other defaults
    if (data.isDefault && !existing.isDefault) {
      await db
        .update(subscriptionPlans)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(subscriptionPlans.isDefault, true));
    }

    // Merge limits and features if partial update
    const updatedLimits = data.limits ? { ...existing.limits, ...data.limits } : existing.limits;
    const updatedFeatures = data.features
      ? { ...existing.features, ...data.features }
      : existing.features;

    const [plan] = await db
      .update(subscriptionPlans)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.billingInterval !== undefined && { billingInterval: data.billingInterval }),
        ...(data.limits !== undefined && { limits: updatedLimits }),
        ...(data.features !== undefined && { features: updatedFeatures }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        ...(data.isVisible !== undefined && { isVisible: data.isVisible }),
        ...(data.alertsEnabled !== undefined && { alertsEnabled: data.alertsEnabled }),
        ...(data.alertThreshold !== undefined && { alertThreshold: data.alertThreshold }),
        ...(data.position !== undefined && { position: data.position }),
        ...(data.stripeProductId !== undefined && { stripeProductId: data.stripeProductId }),
        ...(data.stripePriceId !== undefined && { stripePriceId: data.stripePriceId }),
        ...(data.metadata !== undefined && { metadata: data.metadata }),
        updatedAt: new Date(),
      })
      .where(eq(subscriptionPlans.id, id))
      .returning();

    return plan;
  },

  /**
   * Delete a plan (only if no subscriptions are using it)
   */
  async remove(id: string) {
    const plan = await this.getById(id);
    if (!plan) {
      throw new NotFoundError("Plan not found");
    }

    // Check if plan is in use - this will be enforced by FK constraint
    try {
      const [deleted] = await db
        .delete(subscriptionPlans)
        .where(eq(subscriptionPlans.id, id))
        .returning();

      return deleted;
    } catch (error) {
      // FK constraint violation means plan is in use
      if (error instanceof Error && error.message.includes("foreign key constraint")) {
        throw new ConflictError("Cannot delete plan that has active subscriptions");
      }
      throw error;
    }
  },

  /**
   * Seed default plans if none exist
   */
  async seedDefaults() {
    const existing = await this.list({ includeInactive: true, includeHidden: true });
    if (existing.length > 0) {
      return { seeded: false, plans: existing };
    }

    const plans = [
      {
        name: "Free",
        slug: "free",
        description: "Perfect for small teams getting started",
        price: 0,
        currency: "USD",
        billingInterval: "monthly" as const,
        limits: DEFAULT_FREE_LIMITS,
        features: DEFAULT_FREE_FEATURES,
        isActive: true,
        isDefault: true,
        isVisible: true,
        position: 0,
      },
      {
        name: "Professional",
        slug: "professional",
        description: "For growing teams that need more power",
        price: 2900, // $29.00
        currency: "USD",
        billingInterval: "monthly" as const,
        limits: {
          ticketsPerMonth: 500,
          messagesPerMonth: 2000,
          storagePerOrgMB: 1000,
          apiRequestsPerMinute: 120,
          agentsPerOrg: 10,
          customersPerOrg: 500,
          slaEnabled: true,
          customFieldsEnabled: true,
          reportingEnabled: true,
          apiAccessEnabled: true,
          prioritySupport: false,
        },
        features: {
          ticketManagement: true,
          emailChannel: true,
          chatWidget: true,
          apiChannel: true,
          cannedResponses: true,
          tags: true,
          categories: true,
          fileAttachments: true,
          csatSurveys: true,
          slaManagement: true,
          customFields: true,
          analytics: true,
          advancedReporting: false,
          dataExport: true,
          customBranding: false,
          singleSignOn: false,
          auditLog: false,
          multipleWorkspaces: false,
        },
        isActive: true,
        isDefault: false,
        isVisible: true,
        position: 1,
      },
      {
        name: "Enterprise",
        slug: "enterprise",
        description: "Unlimited power for large organizations",
        price: 9900, // $99.00
        currency: "USD",
        billingInterval: "monthly" as const,
        limits: {
          ticketsPerMonth: -1, // Unlimited
          messagesPerMonth: -1,
          storagePerOrgMB: -1,
          apiRequestsPerMinute: 600,
          agentsPerOrg: -1,
          customersPerOrg: -1,
          slaEnabled: true,
          customFieldsEnabled: true,
          reportingEnabled: true,
          apiAccessEnabled: true,
          prioritySupport: true,
        },
        features: {
          ticketManagement: true,
          emailChannel: true,
          chatWidget: true,
          apiChannel: true,
          cannedResponses: true,
          tags: true,
          categories: true,
          fileAttachments: true,
          csatSurveys: true,
          slaManagement: true,
          customFields: true,
          analytics: true,
          advancedReporting: true,
          dataExport: true,
          customBranding: true,
          singleSignOn: true,
          auditLog: true,
          multipleWorkspaces: true,
        },
        isActive: true,
        isDefault: false,
        isVisible: true,
        position: 2,
      },
    ];

    const seededPlans = await db.insert(subscriptionPlans).values(plans).returning();

    return { seeded: true, plans: seededPlans };
  },
};
