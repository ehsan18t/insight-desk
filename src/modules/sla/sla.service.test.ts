/**
 * SLA Service Unit Tests
 * Tests for SLA policy management operations
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SlaPolicy } from "./sla.service";
import { slaService } from "./sla.service";

// Mock the database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
  closeDatabaseConnection: vi.fn(),
}));

import { db } from "@/db";

// Mock SLA policy for tests
const mockSlaPolicy: SlaPolicy = {
  id: "sla-1",
  organizationId: "org-1",
  name: "High Priority SLA",
  priority: "high",
  firstResponseTime: 240, // 4 hours in minutes
  resolutionTime: 480, // 8 hours in minutes
  businessHoursOnly: true,
  isDefault: false,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

describe("slaService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // list
  // ─────────────────────────────────────────────────────────────
  describe("list", () => {
    it("should return list of SLA policies for organization", async () => {
      const mockPolicies = [
        { ...mockSlaPolicy, priority: "low" as const },
        { ...mockSlaPolicy, id: "sla-2", priority: "high" as const },
      ];

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                orderBy: vi.fn().mockResolvedValue(mockPolicies),
              }),
            }),
          }) as never,
      );

      const result = await slaService.list("org-1");

      expect(result).toHaveLength(2);
      expect(result[0].priority).toBe("low");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getById
  // ─────────────────────────────────────────────────────────────
  describe("getById", () => {
    it("should return SLA policy when found", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockSlaPolicy]),
              }),
            }),
          }) as never,
      );

      const result = await slaService.getById("sla-1", "org-1");

      expect(result).toEqual(mockSlaPolicy);
    });

    it("should return null when SLA policy not found", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      const result = await slaService.getById("non-existent", "org-1");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getByPriority
  // ─────────────────────────────────────────────────────────────
  describe("getByPriority", () => {
    it("should return SLA policy for specific priority", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockSlaPolicy]),
              }),
            }),
          }) as never,
      );

      const result = await slaService.getByPriority("org-1", "high");

      expect(result).toEqual(mockSlaPolicy);
      expect(result?.priority).toBe("high");
    });

    it("should return null when no policy for priority", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      const result = await slaService.getByPriority("org-1", "low");

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getSlaTimesForPriority
  // ─────────────────────────────────────────────────────────────
  describe("getSlaTimesForPriority", () => {
    it("should return policy times when policy exists", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockSlaPolicy]),
              }),
            }),
          }) as never,
      );

      const result = await slaService.getSlaTimesForPriority("org-1", "high");

      expect(result).toEqual({
        firstResponseTime: 240,
        resolutionTime: 480,
      });
    });

    it("should return default times when no policy exists for low priority", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      const result = await slaService.getSlaTimesForPriority("org-1", "low");

      // Default for low: 24 hours first response, 72 hours resolution
      expect(result).toEqual({
        firstResponseTime: 24 * 60, // 1440 minutes
        resolutionTime: 72 * 60, // 4320 minutes
      });
    });

    it("should return default times when no policy exists for medium priority", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      const result = await slaService.getSlaTimesForPriority("org-1", "medium");

      // Default for medium: 8 hours first response, 24 hours resolution
      expect(result).toEqual({
        firstResponseTime: 8 * 60, // 480 minutes
        resolutionTime: 24 * 60, // 1440 minutes
      });
    });

    it("should return default times when no policy exists for high priority", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      const result = await slaService.getSlaTimesForPriority("org-1", "high");

      // Default for high: 4 hours first response, 8 hours resolution
      expect(result).toEqual({
        firstResponseTime: 4 * 60, // 240 minutes
        resolutionTime: 8 * 60, // 480 minutes
      });
    });

    it("should return default times when no policy exists for urgent priority", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      const result = await slaService.getSlaTimesForPriority("org-1", "urgent");

      // Default for urgent: 1 hour first response, 4 hours resolution
      expect(result).toEqual({
        firstResponseTime: 60, // 60 minutes
        resolutionTime: 4 * 60, // 240 minutes
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────────────────────
  describe("create", () => {
    it("should create a new SLA policy", async () => {
      // No existing policy for priority
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      // Insert returns new policy
      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockSlaPolicy]),
        }),
      } as never);

      const result = await slaService.create("org-1", {
        name: "High Priority SLA",
        priority: "high",
        firstResponseTime: 240,
        resolutionTime: 480,
        businessHoursOnly: true,
        isDefault: false,
      });

      expect(result).toEqual(mockSlaPolicy);
    });

    it("should update existing policy if one exists for the priority", async () => {
      // Existing policy found for priority
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockSlaPolicy]),
              }),
            }),
          }) as never,
      );

      // getById for update check
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockSlaPolicy]),
              }),
            }),
          }) as never,
      );

      // Update returns updated policy
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([{ ...mockSlaPolicy, name: "Updated SLA" }]),
          }),
        }),
      } as never);

      const result = await slaService.create("org-1", {
        name: "Updated SLA",
        priority: "high",
        firstResponseTime: 240,
        resolutionTime: 480,
        businessHoursOnly: true,
        isDefault: false,
      });

      expect(result.name).toBe("Updated SLA");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────────────────────
  describe("update", () => {
    it("should update SLA policy name", async () => {
      // getById returns existing policy
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockSlaPolicy]),
              }),
            }),
          }) as never,
      );

      // Update returns updated policy
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi.fn().mockResolvedValue([{ ...mockSlaPolicy, name: "Updated Name" }]),
          }),
        }),
      } as never);

      const result = await slaService.update("sla-1", "org-1", {
        name: "Updated Name",
      });

      expect(result.name).toBe("Updated Name");
    });

    it("should update SLA policy times", async () => {
      // getById returns existing policy
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockSlaPolicy]),
              }),
            }),
          }) as never,
      );

      // Update returns updated policy
      vi.mocked(db.update).mockReturnValue({
        set: () => ({
          where: () => ({
            returning: vi
              .fn()
              .mockResolvedValue([
                { ...mockSlaPolicy, firstResponseTime: 120, resolutionTime: 240 },
              ]),
          }),
        }),
      } as never);

      const result = await slaService.update("sla-1", "org-1", {
        firstResponseTime: 120,
        resolutionTime: 240,
      });

      expect(result.firstResponseTime).toBe(120);
      expect(result.resolutionTime).toBe(240);
    });

    it("should throw NotFoundError when policy not found", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      await expect(slaService.update("non-existent", "org-1", { name: "Test" })).rejects.toThrow(
        "SLA policy not found",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // remove
  // ─────────────────────────────────────────────────────────────
  describe("remove", () => {
    it("should delete SLA policy", async () => {
      // getById returns existing policy
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([mockSlaPolicy]),
              }),
            }),
          }) as never,
      );

      // Delete succeeds
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as never);

      await slaService.remove("sla-1", "org-1");

      expect(db.delete).toHaveBeenCalled();
    });

    it("should throw NotFoundError when policy not found", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      await expect(slaService.remove("non-existent", "org-1")).rejects.toThrow(
        "SLA policy not found",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // initializeDefaults
  // ─────────────────────────────────────────────────────────────
  describe("initializeDefaults", () => {
    it("should create default policies for all priorities", async () => {
      // Mock getByPriority returning null (no existing policies)
      vi.mocked(db.select).mockImplementation(
        () =>
          ({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      // Mock insert for each priority - create uses .values().returning()
      vi.mocked(db.insert).mockReturnValue({
        values: () => ({
          returning: vi.fn().mockResolvedValue([mockSlaPolicy]),
        }),
      } as never);

      const result = await slaService.initializeDefaults("org-1");

      expect(result).toHaveLength(4); // 4 priorities: low, medium, high, urgent
    });
  });
});
