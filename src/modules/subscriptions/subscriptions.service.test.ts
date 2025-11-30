/**
 * Subscriptions Service Tests
 * Comprehensive test coverage for subscription and usage management
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { BadRequestError, ConflictError, NotFoundError } from "@/middleware/error-handler";
import { plansService } from "@/modules/plans";
import { subscriptionsService } from "./subscriptions.service";

// Mock the database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  closeDatabaseConnection: vi.fn(),
}));

// Mock plans service
vi.mock("@/modules/plans", () => ({
  plansService: {
    getById: vi.fn(),
    getDefault: vi.fn(),
  },
}));

// ─────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────

const mockPlanLimits = {
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

const mockPlan = {
  id: "plan-free-123",
  name: "Free",
  slug: "free",
  price: 0,
  currency: "USD",
  billingInterval: "monthly",
  limits: mockPlanLimits,
  features: { ticketManagement: true },
  alertsEnabled: false,
  alertThreshold: 80,
  isActive: true,
  isDefault: true,
};

const mockProPlan = {
  id: "plan-pro-123",
  name: "Professional",
  slug: "professional",
  price: 2900,
  currency: "USD",
  billingInterval: "monthly",
  limits: {
    ...mockPlanLimits,
    ticketsPerMonth: 500,
    messagesPerMonth: 2000,
    storagePerOrgMB: 1000,
  },
  features: { ticketManagement: true, slaManagement: true },
  alertsEnabled: true,
  alertThreshold: 80,
  isActive: true,
  isDefault: false,
};

const mockSubscription = {
  id: "sub-123",
  organizationId: "org-123",
  planId: "plan-free-123",
  status: "active" as const,
  currentPeriodStart: new Date("2024-01-01"),
  currentPeriodEnd: new Date("2024-02-01"),
  cancelAtPeriodEnd: false,
  canceledAt: null,
  previousPlanId: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  plan: mockPlan,
};

const mockUsage = {
  id: "usage-123",
  organizationId: "org-123",
  periodStart: new Date("2024-01-01"),
  periodEnd: new Date("2024-02-01"),
  ticketsCreated: 10,
  messagesCreated: 50,
  storageUsedMB: 25,
  apiRequestsCount: 100,
  ticketsRemaining: 40,
  messagesRemaining: 150,
  storageRemainingMB: 75,
  ticketAlertSentAt: null,
  messageAlertSentAt: null,
  storageAlertSentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("subscriptionsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // getByOrganizationId
  // ─────────────────────────────────────────────────────────────
  describe("getByOrganizationId", () => {
    it("should return subscription with plan when found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([mockSubscription]),
            }),
          }),
        }),
      } as never);

      const result = await subscriptionsService.getByOrganizationId("org-123");

      expect(result).not.toBeNull();
      expect(result?.planId).toBe("plan-free-123");
      expect(result?.plan.name).toBe("Free");
    });

    it("should return null when no subscription found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      const result = await subscriptionsService.getByOrganizationId("non-existent");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // createForOrganization
  // ─────────────────────────────────────────────────────────────
  describe("createForOrganization", () => {
    it("should create subscription with default plan", async () => {
      // Mock no existing subscription
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      // Mock getDefault
      vi.mocked(plansService.getDefault).mockResolvedValue(mockPlan as never);

      // Mock subscription insert
      vi.mocked(db.insert).mockReturnValueOnce({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockSubscription]),
        }),
      } as never);

      // Mock usage insert
      vi.mocked(db.insert).mockReturnValueOnce({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockUsage]),
        }),
      } as never);

      const result = await subscriptionsService.createForOrganization("org-123");

      expect(result.plan.name).toBe("Free");
      expect(plansService.getDefault).toHaveBeenCalled();
    });

    it("should create subscription with specific plan", async () => {
      // Mock no existing subscription
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      // Mock getById
      vi.mocked(plansService.getById).mockResolvedValue(mockProPlan as never);

      // Mock subscription insert
      vi.mocked(db.insert).mockReturnValueOnce({
        values: () => ({
          returning: vi.fn().mockResolvedValue([{ ...mockSubscription, planId: "plan-pro-123" }]),
        }),
      } as never);

      // Mock usage insert
      vi.mocked(db.insert).mockReturnValueOnce({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockUsage]),
        }),
      } as never);

      await subscriptionsService.createForOrganization("org-123", "plan-pro-123");

      expect(plansService.getById).toHaveBeenCalledWith("plan-pro-123");
    });

    it("should throw ConflictError when subscription already exists", async () => {
      // Mock existing subscription
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([mockSubscription]),
            }),
          }),
        }),
      } as never);

      await expect(subscriptionsService.createForOrganization("org-123")).rejects.toThrow(
        ConflictError,
      );
    });

    it("should throw NotFoundError when plan not found", async () => {
      // Mock no existing subscription
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      // Mock plan not found - use null as unknown to satisfy TypeScript
      vi.mocked(plansService.getById).mockResolvedValue(
        null as unknown as Awaited<ReturnType<typeof plansService.getById>>,
      );

      await expect(
        subscriptionsService.createForOrganization("org-123", "non-existent-plan"),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError when no default plan configured", async () => {
      // Mock no existing subscription
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      // Mock no default plan - use null as unknown to satisfy TypeScript
      vi.mocked(plansService.getDefault).mockResolvedValue(
        null as unknown as Awaited<ReturnType<typeof plansService.getDefault>>,
      );

      await expect(subscriptionsService.createForOrganization("org-123")).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // initializeUsage
  // ─────────────────────────────────────────────────────────────
  describe("initializeUsage", () => {
    it("should create usage record with correct remaining values", async () => {
      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockUsage]),
        }),
      } as never);

      const result = await subscriptionsService.initializeUsage(
        "org-123",
        new Date("2024-01-01"),
        new Date("2024-02-01"),
        mockPlanLimits,
      );

      expect(result.ticketsRemaining).toBe(40); // From mock
    });

    it("should handle unlimited limits (-1) with large value", async () => {
      const unlimitedLimits = {
        ...mockPlanLimits,
        ticketsPerMonth: -1,
        messagesPerMonth: -1,
      };

      const unlimitedUsage = {
        ...mockUsage,
        ticketsRemaining: 999999999,
        messagesRemaining: 999999999,
      };

      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([unlimitedUsage]),
        }),
      } as never);

      const result = await subscriptionsService.initializeUsage(
        "org-123",
        new Date(),
        new Date(),
        unlimitedLimits,
      );

      expect(result.ticketsRemaining).toBe(999999999);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getCurrentUsage
  // ─────────────────────────────────────────────────────────────
  describe("getCurrentUsage", () => {
    it("should return current period usage", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockUsage]),
          }),
        }),
      } as never);

      const result = await subscriptionsService.getCurrentUsage("org-123");

      expect(result).not.toBeNull();
      expect(result?.ticketsCreated).toBe(10);
    });

    it("should return null when no current usage", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await subscriptionsService.getCurrentUsage("org-123");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // checkLimit
  // ─────────────────────────────────────────────────────────────
  describe("checkLimit", () => {
    it("should allow when under limit", async () => {
      // Mock subscription
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([mockSubscription]),
            }),
          }),
        }),
      } as never);

      // Mock usage
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockUsage]),
          }),
        }),
      } as never);

      const result = await subscriptionsService.checkLimit("org-123", "tickets");

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(10);
      expect(result.limit).toBe(50);
      expect(result.remaining).toBe(40);
      expect(result.percentUsed).toBe(20);
    });

    it("should deny when at limit", async () => {
      const atLimitUsage = {
        ...mockUsage,
        ticketsCreated: 50,
        ticketsRemaining: 0,
      };

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([mockSubscription]),
            }),
          }),
        }),
      } as never);

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([atLimitUsage]),
          }),
        }),
      } as never);

      const result = await subscriptionsService.checkLimit("org-123", "tickets");

      expect(result.allowed).toBe(false);
      expect(result.percentUsed).toBe(100);
      expect(result.upgradeUrl).toBe("/settings/billing");
    });

    it("should indicate alert needed when above threshold", async () => {
      const highUsage = {
        ...mockUsage,
        ticketsCreated: 45,
        ticketsRemaining: 5,
      };

      const subscriptionWithAlerts = {
        ...mockSubscription,
        plan: { ...mockPlan, alertsEnabled: true, alertThreshold: 80 },
      };

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([subscriptionWithAlerts]),
            }),
          }),
        }),
      } as never);

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([highUsage]),
          }),
        }),
      } as never);

      const result = await subscriptionsService.checkLimit("org-123", "tickets");

      expect(result.shouldAlert).toBe(true);
      expect(result.percentUsed).toBe(90);
    });

    it("should return not allowed when no subscription", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      const result = await subscriptionsService.checkLimit("org-123", "tickets");

      expect(result.allowed).toBe(false);
      expect(result.upgradeUrl).toBe("/settings/billing");
    });

    it("should always allow unlimited (-1) limits", async () => {
      const unlimitedSubscription = {
        ...mockSubscription,
        plan: {
          ...mockPlan,
          limits: { ...mockPlanLimits, ticketsPerMonth: -1 },
        },
      };

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([unlimitedSubscription]),
            }),
          }),
        }),
      } as never);

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([{ ...mockUsage, ticketsCreated: 1000 }]),
          }),
        }),
      } as never);

      const result = await subscriptionsService.checkLimit("org-123", "tickets");

      expect(result.allowed).toBe(true);
      expect(result.percentUsed).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // incrementUsage
  // ─────────────────────────────────────────────────────────────
  describe("incrementUsage", () => {
    it("should increment tickets usage", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockUsage]),
          }),
        }),
      } as never);

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      await subscriptionsService.incrementUsage("org-123", "tickets", 1);

      expect(db.update).toHaveBeenCalled();
    });

    it("should increment messages usage", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockUsage]),
          }),
        }),
      } as never);

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      await subscriptionsService.incrementUsage("org-123", "messages", 5);

      expect(db.update).toHaveBeenCalled();
    });

    it("should increment storage usage", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockUsage]),
          }),
        }),
      } as never);

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      await subscriptionsService.incrementUsage("org-123", "storage", 10);

      expect(db.update).toHaveBeenCalled();
    });

    it("should initialize usage if not exists", async () => {
      // No current usage
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      // Get subscription for initialization
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([mockSubscription]),
            }),
          }),
        }),
      } as never);

      // Initialize usage
      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockUsage]),
        }),
      } as never);

      await subscriptionsService.incrementUsage("org-123", "tickets", 1);

      expect(db.insert).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // changePlan
  // ─────────────────────────────────────────────────────────────
  describe("changePlan", () => {
    it("should upgrade plan successfully", async () => {
      // Mock current subscription
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([mockSubscription]),
            }),
          }),
        }),
      } as never);

      // Mock new plan
      vi.mocked(plansService.getById).mockResolvedValue(mockProPlan as never);

      // Mock update subscription
      vi.mocked(db.update).mockReturnValueOnce({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([{ ...mockSubscription, planId: "plan-pro-123" }]),
          }),
        }),
      } as never);

      // Mock get current usage
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockUsage]),
          }),
        }),
      } as never);

      // Mock get usage for adjustment
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([mockUsage]),
          }),
        }),
      } as never);

      // Mock update usage limits
      vi.mocked(db.update).mockReturnValueOnce({
        set: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      const result = await subscriptionsService.changePlan("org-123", "plan-pro-123");

      expect(result.isUpgrade).toBe(true);
      expect(result.plan.name).toBe("Professional");
    });

    it("should throw NotFoundError when subscription not found", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      await expect(subscriptionsService.changePlan("org-123", "plan-pro-123")).rejects.toThrow(
        NotFoundError,
      );
    });

    it("should throw BadRequestError when already on target plan", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([mockSubscription]),
            }),
          }),
        }),
      } as never);

      vi.mocked(plansService.getById).mockResolvedValue(mockPlan as never);

      await expect(subscriptionsService.changePlan("org-123", "plan-free-123")).rejects.toThrow(
        BadRequestError,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // cancel
  // ─────────────────────────────────────────────────────────────
  describe("cancel", () => {
    it("should cancel immediately when requested", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([mockSubscription]),
            }),
          }),
        }),
      } as never);

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      // Mock return after cancel
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([{ ...mockSubscription, status: "canceled" }]),
            }),
          }),
        }),
      } as never);

      const result = await subscriptionsService.cancel("org-123", true);

      expect(result?.status).toBe("canceled");
    });

    it("should set cancelAtPeriodEnd when not immediate", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([mockSubscription]),
            }),
          }),
        }),
      } as never);

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      // Mock return after cancel
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([{ ...mockSubscription, cancelAtPeriodEnd: true }]),
            }),
          }),
        }),
      } as never);

      const result = await subscriptionsService.cancel("org-123", false);

      expect(result?.cancelAtPeriodEnd).toBe(true);
    });

    it("should throw NotFoundError when subscription not found", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as never);

      await expect(subscriptionsService.cancel("org-123")).rejects.toThrow(NotFoundError);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // reactivate
  // ─────────────────────────────────────────────────────────────
  describe("reactivate", () => {
    it("should reactivate canceled subscription", async () => {
      const canceledSubscription = {
        ...mockSubscription,
        status: "canceled" as const,
        cancelAtPeriodEnd: true,
      };

      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([canceledSubscription]),
            }),
          }),
        }),
      } as never);

      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      // Mock return after reactivate
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([{ ...mockSubscription, status: "active" }]),
            }),
          }),
        }),
      } as never);

      const result = await subscriptionsService.reactivate("org-123");

      expect(result?.status).toBe("active");
    });

    it("should throw BadRequestError when not canceled", async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([mockSubscription]),
            }),
          }),
        }),
      } as never);

      await expect(subscriptionsService.reactivate("org-123")).rejects.toThrow(BadRequestError);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────
  describe("helper methods", () => {
    describe("getLimitValue", () => {
      it("should return correct limit for each usage type", () => {
        expect(subscriptionsService.getLimitValue(mockPlanLimits, "tickets")).toBe(50);
        expect(subscriptionsService.getLimitValue(mockPlanLimits, "messages")).toBe(200);
        expect(subscriptionsService.getLimitValue(mockPlanLimits, "storage")).toBe(100);
        expect(subscriptionsService.getLimitValue(mockPlanLimits, "api")).toBe(30);
      });
    });

    describe("getCurrentValue", () => {
      it("should return correct current value for each usage type", () => {
        expect(subscriptionsService.getCurrentValue(mockUsage, "tickets")).toBe(10);
        expect(subscriptionsService.getCurrentValue(mockUsage, "messages")).toBe(50);
        expect(subscriptionsService.getCurrentValue(mockUsage, "storage")).toBe(25);
        expect(subscriptionsService.getCurrentValue(mockUsage, "api")).toBe(100);
      });
    });
  });
});
