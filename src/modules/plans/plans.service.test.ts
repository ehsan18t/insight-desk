/**
 * Plans Service Tests
 * Comprehensive test coverage for subscription plan management
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { ConflictError, NotFoundError } from "@/middleware/error-handler";
import { DEFAULT_FREE_FEATURES, DEFAULT_FREE_LIMITS, plansService } from "./plans.service";

// Mock the database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  closeDatabaseConnection: vi.fn(),
}));

// ─────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────

const mockFreePlan = {
  id: "plan-free-123",
  name: "Free",
  slug: "free",
  description: "Free tier",
  price: 0,
  currency: "USD",
  billingInterval: "monthly" as const,
  limits: DEFAULT_FREE_LIMITS,
  features: DEFAULT_FREE_FEATURES,
  isActive: true,
  isDefault: true,
  isVisible: true,
  alertsEnabled: false,
  alertThreshold: 80,
  position: 0,
  stripeProductId: null,
  stripePriceId: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockProPlan = {
  id: "plan-pro-123",
  name: "Professional",
  slug: "professional",
  description: "Professional tier",
  price: 2900,
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
  alertsEnabled: true,
  alertThreshold: 80,
  position: 1,
  stripeProductId: "prod_123",
  stripePriceId: "price_123",
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("plansService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // list
  // ─────────────────────────────────────────────────────────────
  describe("list", () => {
    it("should return only active and visible plans by default", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () => ({
            orderBy: vi.fn().mockResolvedValue([mockFreePlan, mockProPlan]),
          }),
        }),
      } as never);

      const result = await plansService.list();

      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe("free");
      expect(result[1].slug).toBe("professional");
    });

    it("should include inactive plans when requested", async () => {
      const inactivePlan = { ...mockProPlan, isActive: false };

      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () => ({
            orderBy: vi.fn().mockResolvedValue([mockFreePlan, inactivePlan]),
          }),
        }),
      } as never);

      const result = await plansService.list({ includeInactive: true });

      expect(result).toHaveLength(2);
    });

    it("should include hidden plans when requested", async () => {
      const hiddenPlan = { ...mockProPlan, isVisible: false };

      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () => ({
            orderBy: vi.fn().mockResolvedValue([mockFreePlan, hiddenPlan]),
          }),
        }),
      } as never);

      const result = await plansService.list({ includeHidden: true });

      expect(result).toHaveLength(2);
    });

    it("should return empty array when no plans exist", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () => ({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await plansService.list();

      expect(result).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getById
  // ─────────────────────────────────────────────────────────────
  describe("getById", () => {
    it("should return plan when found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockProPlan]),
          }),
        }),
      } as never);

      const result = await plansService.getById("plan-pro-123");

      expect(result).not.toBeNull();
      expect(result?.slug).toBe("professional");
      expect(result?.price).toBe(2900);
    });

    it("should return null when plan not found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await plansService.getById("non-existent");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getBySlug
  // ─────────────────────────────────────────────────────────────
  describe("getBySlug", () => {
    it("should return plan when slug matches", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockFreePlan]),
          }),
        }),
      } as never);

      const result = await plansService.getBySlug("free");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("Free");
    });

    it("should return null when slug not found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await plansService.getBySlug("non-existent-slug");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getDefault
  // ─────────────────────────────────────────────────────────────
  describe("getDefault", () => {
    it("should return default active plan", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockFreePlan]),
          }),
        }),
      } as never);

      const result = await plansService.getDefault();

      expect(result).not.toBeNull();
      expect(result?.isDefault).toBe(true);
      expect(result?.isActive).toBe(true);
    });

    it("should return null when no default plan configured", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await plansService.getDefault();

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────────────────────
  describe("create", () => {
    it("should create a new plan successfully", async () => {
      // Mock getBySlug returns null (no duplicate)
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      // Mock insert
      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockProPlan]),
        }),
      } as never);

      const result = await plansService.create({
        name: "Professional",
        slug: "professional",
        price: 2900,
        currency: "USD",
        billingInterval: "monthly",
        limits: mockProPlan.limits,
        features: mockProPlan.features,
        isActive: true,
        isDefault: false,
        isVisible: true,
        alertsEnabled: true,
        alertThreshold: 80,
        position: 1,
        metadata: {},
      });

      expect(result.slug).toBe("professional");
      expect(db.insert).toHaveBeenCalled();
    });

    it("should throw ConflictError when slug already exists", async () => {
      // Mock getBySlug returns existing plan
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockProPlan]),
          }),
        }),
      } as never);

      await expect(
        plansService.create({
          name: "Another Pro",
          slug: "professional",
          price: 3000,
          currency: "USD",
          billingInterval: "monthly",
          limits: mockProPlan.limits,
          features: mockProPlan.features,
          isActive: true,
          isDefault: false,
          isVisible: true,
          alertsEnabled: true,
          alertThreshold: 80,
          position: 1,
          metadata: {},
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("should unset other defaults when creating a default plan", async () => {
      // Mock getBySlug returns null
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      // Mock update for unsetting defaults
      vi.mocked(db.update).mockReturnValueOnce({
        set: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      // Mock insert
      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([{ ...mockFreePlan, isDefault: true }]),
        }),
      } as never);

      await plansService.create({
        name: "New Default",
        slug: "new-default",
        price: 0,
        currency: "USD",
        billingInterval: "monthly",
        limits: DEFAULT_FREE_LIMITS,
        features: DEFAULT_FREE_FEATURES,
        isActive: true,
        isDefault: true,
        isVisible: true,
        alertsEnabled: true,
        alertThreshold: 80,
        position: 0,
        metadata: {},
      });

      expect(db.update).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────────────────────
  describe("update", () => {
    it("should update plan successfully", async () => {
      // Mock getById returns existing plan
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockProPlan]),
          }),
        }),
      } as never);

      // Mock update
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([{ ...mockProPlan, name: "Pro Plus" }]),
          }),
        }),
      } as never);

      const result = await plansService.update("plan-pro-123", { name: "Pro Plus" });

      expect(result.name).toBe("Pro Plus");
    });

    it("should throw NotFoundError when plan not found", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      await expect(plansService.update("non-existent", { name: "Updated" })).rejects.toThrow(
        NotFoundError,
      );
    });

    it("should throw ConflictError when updating to duplicate slug", async () => {
      // Mock getById returns existing plan
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockProPlan]),
          }),
        }),
      } as never);

      // Mock getBySlug returns another plan with target slug
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockFreePlan]),
          }),
        }),
      } as never);

      await expect(plansService.update("plan-pro-123", { slug: "free" })).rejects.toThrow(
        ConflictError,
      );
    });

    it("should merge limits on partial update", async () => {
      // Mock getById
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockFreePlan]),
          }),
        }),
      } as never);

      const updatedPlan = {
        ...mockFreePlan,
        limits: { ...DEFAULT_FREE_LIMITS, ticketsPerMonth: 100 },
      };

      // Mock update
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([updatedPlan]),
          }),
        }),
      } as never);

      const result = await plansService.update("plan-free-123", {
        limits: { ticketsPerMonth: 100 },
      });

      // Verify the limits were merged (old values preserved, new value updated)
      expect(result.limits.ticketsPerMonth).toBe(100);
      expect(result.limits.messagesPerMonth).toBe(DEFAULT_FREE_LIMITS.messagesPerMonth);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // remove
  // ─────────────────────────────────────────────────────────────
  describe("remove", () => {
    it("should delete plan successfully", async () => {
      // Mock getById
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockProPlan]),
          }),
        }),
      } as never);

      // Mock delete
      vi.mocked(db.delete).mockReturnValue({
        where: () => ({
          returning: vi.fn().mockResolvedValue([mockProPlan]),
        }),
      } as never);

      const result = await plansService.remove("plan-pro-123");

      expect(result.id).toBe("plan-pro-123");
    });

    it("should throw NotFoundError when plan not found", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      await expect(plansService.remove("non-existent")).rejects.toThrow(NotFoundError);
    });

    it("should throw ConflictError when plan has active subscriptions", async () => {
      // Mock getById
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockProPlan]),
          }),
        }),
      } as never);

      // Mock delete throws FK constraint error
      vi.mocked(db.delete).mockReturnValue({
        where: () => ({
          returning: vi.fn().mockRejectedValue(new Error("foreign key constraint")),
        }),
      } as never);

      await expect(plansService.remove("plan-pro-123")).rejects.toThrow(ConflictError);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // seedDefaults
  // ─────────────────────────────────────────────────────────────
  describe("seedDefaults", () => {
    it("should seed default plans when none exist", async () => {
      // Mock list returns empty
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      // Mock insert
      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockFreePlan, mockProPlan]),
        }),
      } as never);

      const result = await plansService.seedDefaults();

      expect(result.seeded).toBe(true);
      expect(result.plans).toHaveLength(2);
    });

    it("should not seed when plans already exist", async () => {
      // Mock list returns existing plans
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: vi.fn().mockResolvedValue([mockFreePlan]),
          }),
        }),
      } as never);

      const result = await plansService.seedDefaults();

      expect(result.seeded).toBe(false);
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Default Constants Validation
  // ─────────────────────────────────────────────────────────────
  describe("default constants", () => {
    it("should have valid DEFAULT_FREE_LIMITS", () => {
      expect(DEFAULT_FREE_LIMITS.ticketsPerMonth).toBeGreaterThan(0);
      expect(DEFAULT_FREE_LIMITS.messagesPerMonth).toBeGreaterThan(0);
      expect(DEFAULT_FREE_LIMITS.storagePerOrgMB).toBeGreaterThan(0);
      expect(DEFAULT_FREE_LIMITS.agentsPerOrg).toBeGreaterThan(0);
      expect(DEFAULT_FREE_LIMITS.slaEnabled).toBe(false);
    });

    it("should have valid DEFAULT_FREE_FEATURES", () => {
      expect(DEFAULT_FREE_FEATURES.ticketManagement).toBe(true);
      expect(DEFAULT_FREE_FEATURES.emailChannel).toBe(true);
      expect(DEFAULT_FREE_FEATURES.slaManagement).toBe(false);
      expect(DEFAULT_FREE_FEATURES.advancedReporting).toBe(false);
    });
  });
});
