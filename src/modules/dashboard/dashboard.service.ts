/**
 * Dashboard Service
 * Business logic for dashboard metrics and trends
 */

import { and, avg, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { tickets, userOrganizations, users } from "@/db/schema";
import type { DashboardStats, DashboardTrends, TrendDataPoint } from "./dashboard.schema";

/**
 * Get dashboard statistics for an organization
 */
async function getStats(
  organizationId: string,
  options: { startDate?: Date; endDate?: Date } = {},
): Promise<DashboardStats> {
  const conditions = [eq(tickets.organizationId, organizationId)];

  if (options.startDate) {
    conditions.push(gte(tickets.createdAt, options.startDate));
  }
  if (options.endDate) {
    conditions.push(lte(tickets.createdAt, options.endDate));
  }

  const whereClause = and(...conditions);

  // Get ticket counts by status
  const statusCounts = await db
    .select({
      status: tickets.status,
      count: count(),
    })
    .from(tickets)
    .where(whereClause)
    .groupBy(tickets.status);

  // Parse status counts
  const ticketStats = {
    total: 0,
    open: 0,
    pending: 0,
    resolved: 0,
    closed: 0,
  };

  for (const row of statusCounts) {
    ticketStats[row.status as keyof typeof ticketStats] = row.count;
    ticketStats.total += row.count;
  }

  // Get performance metrics
  const [performanceResult] = await db
    .select({
      avgFirstResponse: avg(
        sql<number>`EXTRACT(EPOCH FROM (${tickets.firstResponseAt} - ${tickets.createdAt})) / 60`,
      ),
      avgResolution: avg(
        sql<number>`EXTRACT(EPOCH FROM (${tickets.resolvedAt} - ${tickets.createdAt})) / 60`,
      ),
      totalWithSla: count(),
      slaBreached: sql<number>`COUNT(*) FILTER (WHERE ${tickets.slaBreached} = true)`,
    })
    .from(tickets)
    .where(whereClause);

  const slaComplianceRate =
    performanceResult.totalWithSla > 0
      ? Math.round(
          ((performanceResult.totalWithSla - Number(performanceResult.slaBreached)) /
            performanceResult.totalWithSla) *
            100,
        )
      : 100;

  // Get agent counts
  const [agentCounts] = await db
    .select({
      total: count(),
      active: sql<number>`COUNT(*) FILTER (WHERE ${users.isActive} = true)`,
    })
    .from(userOrganizations)
    .innerJoin(users, eq(userOrganizations.userId, users.id))
    .where(
      and(
        eq(userOrganizations.organizationId, organizationId),
        inArray(userOrganizations.role, ["agent", "admin", "owner"]),
      ),
    );

  return {
    tickets: ticketStats,
    performance: {
      avgFirstResponseTime: performanceResult.avgFirstResponse
        ? Math.round(Number(performanceResult.avgFirstResponse))
        : null,
      avgResolutionTime: performanceResult.avgResolution
        ? Math.round(Number(performanceResult.avgResolution))
        : null,
      slaComplianceRate,
    },
    agents: {
      total: agentCounts?.total ?? 0,
      active: Number(agentCounts?.active ?? 0),
    },
  };
}

/**
 * Get ticket trends over time
 */
async function getTrends(
  organizationId: string,
  options: { period?: "day" | "week" | "month"; periods?: number } = {},
): Promise<DashboardTrends> {
  const period = options.period || "week";
  const periodsCount = options.periods || 7;

  // Calculate date truncation based on period
  // SECURITY: Explicit whitelist to prevent SQL injection - only these values are allowed
  const ALLOWED_TRUNCATIONS = { day: "day", week: "week", month: "month" } as const;
  const dateTrunc = ALLOWED_TRUNCATIONS[period] ?? "week";

  // Calculate start date
  const now = new Date();
  const startDate = new Date(now);
  if (period === "day") {
    startDate.setDate(startDate.getDate() - periodsCount);
  } else if (period === "week") {
    startDate.setDate(startDate.getDate() - periodsCount * 7);
  } else {
    startDate.setMonth(startDate.getMonth() - periodsCount);
  }

  // Query for trend data
  const trendData = await db
    .select({
      periodDate: sql<string>`date_trunc('${sql.raw(dateTrunc)}', ${tickets.createdAt})::date`,
      created: count(),
      resolved: sql<number>`COUNT(*) FILTER (WHERE ${tickets.status} = 'resolved')`,
      closed: sql<number>`COUNT(*) FILTER (WHERE ${tickets.status} = 'closed')`,
    })
    .from(tickets)
    .where(and(eq(tickets.organizationId, organizationId), gte(tickets.createdAt, startDate)))
    .groupBy(sql`date_trunc('${sql.raw(dateTrunc)}', ${tickets.createdAt})::date`)
    .orderBy(sql`date_trunc('${sql.raw(dateTrunc)}', ${tickets.createdAt})::date`);

  // Format the data
  const data: TrendDataPoint[] = trendData.map((row) => ({
    date: row.periodDate,
    created: row.created,
    resolved: Number(row.resolved),
    closed: Number(row.closed),
  }));

  return {
    period,
    data,
  };
}

/**
 * Get ticket distribution by priority
 */
async function getPriorityDistribution(organizationId: string): Promise<Record<string, number>> {
  const distribution = await db
    .select({
      priority: tickets.priority,
      count: count(),
    })
    .from(tickets)
    .where(
      and(eq(tickets.organizationId, organizationId), inArray(tickets.status, ["open", "pending"])),
    )
    .groupBy(tickets.priority);

  const result: Record<string, number> = {
    low: 0,
    medium: 0,
    high: 0,
    urgent: 0,
  };

  for (const row of distribution) {
    result[row.priority] = row.count;
  }

  return result;
}

/**
 * Get agent performance metrics
 */
async function getAgentPerformance(organizationId: string): Promise<
  Array<{
    agentId: string;
    agentName: string;
    ticketsAssigned: number;
    ticketsResolved: number;
    avgResponseTime: number | null;
  }>
> {
  const agentStats = await db
    .select({
      agentId: users.id,
      agentName: users.name,
      ticketsAssigned: count(),
      ticketsResolved: sql<number>`COUNT(*) FILTER (WHERE ${tickets.status} IN ('resolved', 'closed'))`,
      avgResponseTime: avg(
        sql<number>`EXTRACT(EPOCH FROM (${tickets.firstResponseAt} - ${tickets.createdAt})) / 60`,
      ),
    })
    .from(tickets)
    .innerJoin(users, eq(tickets.assigneeId, users.id))
    .where(eq(tickets.organizationId, organizationId))
    .groupBy(users.id, users.name)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10);

  return agentStats.map((row) => ({
    agentId: row.agentId,
    agentName: row.agentName,
    ticketsAssigned: row.ticketsAssigned,
    ticketsResolved: Number(row.ticketsResolved),
    avgResponseTime: row.avgResponseTime ? Math.round(Number(row.avgResponseTime)) : null,
  }));
}

export const dashboardService = {
  getStats,
  getTrends,
  getPriorityDistribution,
  getAgentPerformance,
};
