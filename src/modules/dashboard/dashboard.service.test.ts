/**
 * Dashboard Service Unit Tests
 * Tests for dashboard analytics and metrics operations
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardService } from "./dashboard.service";

// Mock the database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    execute: vi.fn(),
  },
  closeDatabaseConnection: vi.fn(),
}));

import { db } from "@/db";

describe("dashboardService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // getStats - Skipped due to complex SQL/Promise.all pattern
  // ─────────────────────────────────────────────────────────────
  describe.skip("getStats", () => {
    it("should return dashboard statistics", async () => {
      // Complex SQL with multiple parallel queries - tested via integration tests
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getTrends - Skipped due to complex date_trunc SQL
  // ─────────────────────────────────────────────────────────────
  describe.skip("getTrends", () => {
    it("should return weekly trends by default", async () => {
      // Complex date_trunc SQL pattern - tested via integration tests
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getPriorityDistribution
  // ─────────────────────────────────────────────────────────────
  describe("getPriorityDistribution", () => {
    it("should return ticket distribution by priority", async () => {
      const mockDistribution = [
        { priority: "urgent", count: 5 },
        { priority: "high", count: 15 },
        { priority: "medium", count: 25 },
        { priority: "low", count: 10 },
      ];

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                groupBy: vi.fn().mockResolvedValue(mockDistribution),
              }),
            }),
          }) as never,
      );

      const result = await dashboardService.getPriorityDistribution("org-1");

      // Returns a Record with priority counts
      expect(result.urgent).toBe(5);
      expect(result.high).toBe(15);
      expect(result.medium).toBe(25);
      expect(result.low).toBe(10);
    });

    it("should return zero counts when no active tickets", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                groupBy: vi.fn().mockResolvedValue([]),
              }),
            }),
          }) as never,
      );

      const result = await dashboardService.getPriorityDistribution("org-1");

      // Returns a Record with zero counts
      expect(result).toEqual({ low: 0, medium: 0, high: 0, urgent: 0 });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getAgentPerformance - Skipped due to complex join chain
  // ─────────────────────────────────────────────────────────────
  describe.skip("getAgentPerformance", () => {
    it("should return top 10 agents by performance", async () => {
      // Complex innerJoin chain - tested via integration tests
    });
  });
});
