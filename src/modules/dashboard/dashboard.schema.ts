/**
 * Dashboard Schema
 * Validation schemas for dashboard endpoints
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// QUERY
// ═══════════════════════════════════════════════════════════════════════════

export const dashboardStatsQuery = z.object({
  // Optional date range for stats
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const dashboardTrendsQuery = z.object({
  // Period for trend data
  period: z.enum(["day", "week", "month"]).default("week"),
  // Number of periods to look back
  periods: z.coerce.number().int().min(1).max(52).default(7),
});

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type DashboardStatsQuery = z.infer<typeof dashboardStatsQuery>;
export type DashboardTrendsQuery = z.infer<typeof dashboardTrendsQuery>;

// Response types
export interface DashboardStats {
  tickets: {
    total: number;
    open: number;
    pending: number;
    resolved: number;
    closed: number;
  };
  performance: {
    avgFirstResponseTime: number | null; // in minutes
    avgResolutionTime: number | null; // in minutes
    slaComplianceRate: number; // percentage
  };
  agents: {
    total: number;
    active: number;
  };
}

export interface TrendDataPoint {
  date: string;
  created: number;
  resolved: number;
  closed: number;
}

export interface DashboardTrends {
  period: string;
  data: TrendDataPoint[];
}
