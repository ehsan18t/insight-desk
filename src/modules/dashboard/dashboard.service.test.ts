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
  // getStats
  // ─────────────────────────────────────────────────────────────
  describe("getStats", () => {
    it("should return dashboard statistics", async () => {
      // Mock status counts query
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                groupBy: vi.fn().mockResolvedValue([
                  { status: "open", count: 10 },
                  { status: "pending", count: 5 },
                  { status: "resolved", count: 20 },
                  { status: "closed", count: 15 },
                ]),
              }),
            }),
          }) as never,
      );

      // Mock performance metrics query
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: vi.fn().mockResolvedValue([
                {
                  avgFirstResponse: 30,
                  avgResolution: 120,
                  totalWithSla: 50,
                  slaBreached: 5,
                },
              ]),
            }),
          }) as never,
      );

      // Mock agent counts query
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              innerJoin: () => ({
                where: vi.fn().mockResolvedValue([{ total: 10, active: 8 }]),
              }),
            }),
          }) as never,
      );

      const result = await dashboardService.getStats("org-1");

      expect(result.tickets.total).toBe(50);
      expect(result.tickets.open).toBe(10);
      expect(result.agents.total).toBe(10);
      expect(result.performance.slaComplianceRate).toBe(90);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getTrends
  // ─────────────────────────────────────────────────────────────
  describe("getTrends", () => {
    it("should return weekly trends by default", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                groupBy: () => ({
                  orderBy: vi.fn().mockResolvedValue([
                    { periodDate: "2024-01-01", created: 5, resolved: 3, closed: 2 },
                    { periodDate: "2024-01-08", created: 8, resolved: 6, closed: 1 },
                  ]),
                }),
              }),
            }),
          }) as never,
      );

      const result = await dashboardService.getTrends("org-1");

      expect(result.period).toBe("week");
      expect(result.data).toHaveLength(2);
      expect(result.data[0].created).toBe(5);
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
  // getAgentPerformance
  // ─────────────────────────────────────────────────────────────
  describe("getAgentPerformance", () => {
    it("should return top 10 agents by performance", async () => {
      const mockAgents = [
        {
          agentId: "agent-1",
          agentName: "Agent 1",
          ticketsAssigned: 20,
          ticketsResolved: 18,
          avgResponseTime: 60,
        },
        {
          agentId: "agent-2",
          agentName: "Agent 2",
          ticketsAssigned: 15,
          ticketsResolved: 14,
          avgResponseTime: 45,
        },
      ];

      // Chain: select().from().innerJoin().where().groupBy().orderBy().limit()
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  groupBy: () => ({
                    orderBy: () => ({
                      limit: vi.fn().mockResolvedValue(mockAgents),
                    }),
                  }),
                }),
              }),
            }),
          }) as never,
      );

      const result = await dashboardService.getAgentPerformance("org-1");

      expect(result).toHaveLength(2);
      expect(result[0].agentName).toBe("Agent 1");
      expect(result[0].ticketsResolved).toBe(18);
    });
  });
});
