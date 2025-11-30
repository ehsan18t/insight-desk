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
    it("should calculate total tickets from status counts", async () => {
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

      // Verify total is sum of all statuses (10+5+20+15 = 50)
      expect(result.tickets.total).toBe(50);
      expect(result.tickets.open).toBe(10);
      expect(result.tickets.pending).toBe(5);
      expect(result.tickets.resolved).toBe(20);
      expect(result.tickets.closed).toBe(15);
      expect(result.agents.total).toBe(10);
      expect(result.agents.active).toBe(8);
    });

    it("should calculate SLA compliance rate correctly", async () => {
      // Mock status counts
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                groupBy: vi.fn().mockResolvedValue([{ status: "open", count: 100 }]),
              }),
            }),
          }) as never,
      );

      // Mock performance - 100 tickets, 10 breached = 90% compliance
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: vi.fn().mockResolvedValue([
                {
                  avgFirstResponse: null,
                  avgResolution: null,
                  totalWithSla: 100,
                  slaBreached: 10,
                },
              ]),
            }),
          }) as never,
      );

      // Mock agent counts
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              innerJoin: () => ({
                where: vi.fn().mockResolvedValue([{ total: 0, active: 0 }]),
              }),
            }),
          }) as never,
      );

      const result = await dashboardService.getStats("org-1");

      // (100 - 10) / 100 * 100 = 90%
      expect(result.performance.slaComplianceRate).toBe(90);
    });

    it("should return 100% SLA compliance when no tickets exist", async () => {
      // Mock empty status counts
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

      // Mock performance with zero tickets
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: vi.fn().mockResolvedValue([
                {
                  avgFirstResponse: null,
                  avgResolution: null,
                  totalWithSla: 0,
                  slaBreached: 0,
                },
              ]),
            }),
          }) as never,
      );

      // Mock agent counts
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              innerJoin: () => ({
                where: vi.fn().mockResolvedValue([{ total: 5, active: 3 }]),
              }),
            }),
          }) as never,
      );

      const result = await dashboardService.getStats("org-1");

      expect(result.tickets.total).toBe(0);
      expect(result.performance.slaComplianceRate).toBe(100);
    });

    it("should handle null average response times", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                groupBy: vi.fn().mockResolvedValue([{ status: "open", count: 5 }]),
              }),
            }),
          }) as never,
      );

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: vi.fn().mockResolvedValue([
                {
                  avgFirstResponse: null,
                  avgResolution: null,
                  totalWithSla: 5,
                  slaBreached: 0,
                },
              ]),
            }),
          }) as never,
      );

      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              innerJoin: () => ({
                where: vi.fn().mockResolvedValue([{ total: 1, active: 1 }]),
              }),
            }),
          }) as never,
      );

      const result = await dashboardService.getStats("org-1");

      expect(result.performance.avgFirstResponseTime).toBeNull();
      expect(result.performance.avgResolutionTime).toBeNull();
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
      expect(result.data[0].resolved).toBe(3);
      expect(result.data[0].closed).toBe(2);
    });

    it("should return daily trends when period is day", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                groupBy: () => ({
                  orderBy: vi
                    .fn()
                    .mockResolvedValue([
                      { periodDate: "2024-01-15", created: 3, resolved: 2, closed: 1 },
                    ]),
                }),
              }),
            }),
          }) as never,
      );

      const result = await dashboardService.getTrends("org-1", { period: "day" });

      expect(result.period).toBe("day");
      expect(result.data).toHaveLength(1);
    });

    it("should return monthly trends when period is month", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                groupBy: () => ({
                  orderBy: vi.fn().mockResolvedValue([
                    { periodDate: "2024-01", created: 100, resolved: 80, closed: 70 },
                    { periodDate: "2024-02", created: 120, resolved: 90, closed: 85 },
                  ]),
                }),
              }),
            }),
          }) as never,
      );

      const result = await dashboardService.getTrends("org-1", { period: "month" });

      expect(result.period).toBe("month");
      expect(result.data).toHaveLength(2);
      expect(result.data[1].created).toBe(120);
    });

    it("should return empty data array when no trends exist", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              where: () => ({
                groupBy: () => ({
                  orderBy: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }) as never,
      );

      const result = await dashboardService.getTrends("org-1");

      expect(result.period).toBe("week");
      expect(result.data).toHaveLength(0);
      expect(result.data).toEqual([]);
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
    it("should return top 10 agents sorted by tickets resolved", async () => {
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
      expect(result[0].ticketsAssigned).toBe(20);
      expect(result[1].avgResponseTime).toBe(45);
    });

    it("should return empty array when no agents have assigned tickets", async () => {
      vi.mocked(db.select).mockImplementationOnce(
        () =>
          ({
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  groupBy: () => ({
                    orderBy: () => ({
                      limit: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                }),
              }),
            }),
          }) as never,
      );

      const result = await dashboardService.getAgentPerformance("org-1");

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it("should include agents with zero resolved tickets", async () => {
      const mockAgents = [
        {
          agentId: "agent-new",
          agentName: "New Agent",
          ticketsAssigned: 5,
          ticketsResolved: 0,
          avgResponseTime: null,
        },
      ];

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

      expect(result).toHaveLength(1);
      expect(result[0].ticketsResolved).toBe(0);
      expect(result[0].avgResponseTime).toBeNull();
    });
  });
});
