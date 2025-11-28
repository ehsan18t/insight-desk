/**
 * Dashboard Module - OpenAPI Route Definitions
 *
 * Registers all dashboard endpoints with the OpenAPI registry.
 * Covers dashboard statistics, trends, priority distribution, and agent performance.
 */

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "@/lib/openapi";
import { createDataResponseSchema, commonErrorResponses } from "@/lib/openapi/responses";

extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dashboard stats query parameters
 */
const DashboardStatsQuerySchema = z
  .object({
    startDate: z.coerce.date().optional().describe("Start date for filtering stats"),
    endDate: z.coerce.date().optional().describe("End date for filtering stats"),
  })
  .openapi("DashboardStatsQuery");

/**
 * Dashboard trends query parameters
 */
const DashboardTrendsQuerySchema = z
  .object({
    period: z.enum(["day", "week", "month"]).default("week").describe("Time period for trend data"),
    periods: z.coerce
      .number()
      .int()
      .min(1)
      .max(52)
      .default(7)
      .describe("Number of periods to look back (1-52)"),
  })
  .openapi("DashboardTrendsQuery");

/**
 * Ticket counts by status
 */
const TicketCountsSchema = z
  .object({
    total: z.number().int().nonnegative().describe("Total ticket count"),
    open: z.number().int().nonnegative().describe("Open tickets"),
    pending: z.number().int().nonnegative().describe("Pending tickets"),
    resolved: z.number().int().nonnegative().describe("Resolved tickets"),
    closed: z.number().int().nonnegative().describe("Closed tickets"),
  })
  .openapi("TicketCounts");

/**
 * Performance metrics
 */
const PerformanceMetricsSchema = z
  .object({
    avgFirstResponseTime: z.number().nullable().describe("Average first response time in minutes"),
    avgResolutionTime: z.number().nullable().describe("Average resolution time in minutes"),
    slaComplianceRate: z.number().min(0).max(100).describe("SLA compliance rate percentage"),
  })
  .openapi("PerformanceMetrics");

/**
 * Agent counts
 */
const AgentCountsSchema = z
  .object({
    total: z.number().int().nonnegative().describe("Total number of agents"),
    active: z.number().int().nonnegative().describe("Currently active agents"),
  })
  .openapi("AgentCounts");

/**
 * Dashboard statistics response
 */
const DashboardStatsSchema = z
  .object({
    tickets: TicketCountsSchema.describe("Ticket counts by status"),
    performance: PerformanceMetricsSchema.describe("Performance metrics"),
    agents: AgentCountsSchema.describe("Agent counts"),
  })
  .openapi("DashboardStats");

/**
 * Trend data point
 */
const TrendDataPointSchema = z
  .object({
    date: z.string().describe("Date for this data point"),
    created: z.number().int().nonnegative().describe("Tickets created"),
    resolved: z.number().int().nonnegative().describe("Tickets resolved"),
    closed: z.number().int().nonnegative().describe("Tickets closed"),
  })
  .openapi("TrendDataPoint");

/**
 * Dashboard trends response
 */
const DashboardTrendsSchema = z
  .object({
    period: z.string().describe("Period type (day, week, month)"),
    data: z.array(TrendDataPointSchema).describe("Array of trend data points"),
  })
  .openapi("DashboardTrends");

/**
 * Priority distribution item
 */
const PriorityDistributionItemSchema = z
  .object({
    priority: z.enum(["low", "medium", "high", "urgent"]).describe("Priority level"),
    count: z.number().int().nonnegative().describe("Number of tickets"),
    percentage: z.number().min(0).max(100).describe("Percentage of total"),
  })
  .openapi("PriorityDistributionItem");

/**
 * Priority distribution response
 */
const PriorityDistributionSchema = z
  .array(PriorityDistributionItemSchema)
  .openapi("PriorityDistribution");

/**
 * Agent performance metrics
 */
const AgentPerformanceSchema = z
  .object({
    agentId: z.string().uuid().describe("Agent ID"),
    agentName: z.string().describe("Agent name"),
    agentEmail: z.string().email().describe("Agent email"),
    ticketsAssigned: z.number().int().nonnegative().describe("Total tickets assigned"),
    ticketsResolved: z.number().int().nonnegative().describe("Tickets resolved"),
    avgResponseTime: z.number().nullable().describe("Average response time in minutes"),
    avgResolutionTime: z.number().nullable().describe("Average resolution time in minutes"),
    slaComplianceRate: z.number().min(0).max(100).describe("SLA compliance rate"),
    csatScore: z.number().nullable().describe("Average CSAT score"),
  })
  .openapi("AgentPerformance");

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/dashboard/stats
registry.registerPath({
  method: "get",
  path: "/api/dashboard/stats",
  tags: ["Dashboard"],
  summary: "Get dashboard statistics",
  description: `
Retrieve key dashboard statistics for the organization.

**Access Control:**
- Requires authentication
- Requires agent, admin, or owner role

**Statistics Included:**
- **Ticket counts**: Total, open, pending, resolved, and closed tickets
- **Performance metrics**: Average first response time, resolution time, SLA compliance
- **Agent stats**: Total and active agent counts

**Filtering:**
- Optionally filter by date range using startDate and endDate
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: DashboardStatsQuerySchema,
    headers: z.object({
      "x-organization-id": z.string().uuid().describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Dashboard statistics",
      content: {
        "application/json": {
          schema: createDataResponseSchema(DashboardStatsSchema, "DashboardStatsResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/dashboard/trends
registry.registerPath({
  method: "get",
  path: "/api/dashboard/trends",
  tags: ["Dashboard"],
  summary: "Get ticket trends",
  description: `
Retrieve ticket trend data over time for charting.

**Access Control:**
- Requires authentication
- Requires agent, admin, or owner role

**Data Included:**
For each period, returns:
- Date
- Tickets created
- Tickets resolved
- Tickets closed

**Parameters:**
- \`period\`: Time granularity (day, week, month)
- \`periods\`: Number of periods to return (1-52)
`,
  security: [{ cookieAuth: [] }],
  request: {
    query: DashboardTrendsQuerySchema,
    headers: z.object({
      "x-organization-id": z.string().uuid().describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Ticket trend data",
      content: {
        "application/json": {
          schema: createDataResponseSchema(DashboardTrendsSchema, "DashboardTrendsResponse"),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/dashboard/priority-distribution
registry.registerPath({
  method: "get",
  path: "/api/dashboard/priority-distribution",
  tags: ["Dashboard"],
  summary: "Get priority distribution",
  description: `
Retrieve ticket distribution by priority level.

**Access Control:**
- Requires authentication
- Requires agent, admin, or owner role

**Response:**
Returns count and percentage for each priority level (low, medium, high, urgent).
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": z.string().uuid().describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Priority distribution data",
      content: {
        "application/json": {
          schema: createDataResponseSchema(
            PriorityDistributionSchema,
            "PriorityDistributionResponse",
          ),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});

// GET /api/dashboard/agent-performance
registry.registerPath({
  method: "get",
  path: "/api/dashboard/agent-performance",
  tags: ["Dashboard"],
  summary: "Get agent performance metrics",
  description: `
Retrieve performance metrics for all agents in the organization.

**Access Control:**
- Requires authentication
- Requires admin or owner role (higher access level)

**Metrics Per Agent:**
- Tickets assigned and resolved
- Average response and resolution times
- SLA compliance rate
- CSAT score (if available)

**Use Cases:**
- Team performance monitoring
- Agent workload analysis
- Identifying training needs
`,
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "x-organization-id": z.string().uuid().describe("Organization ID"),
    }),
  },
  responses: {
    200: {
      description: "Agent performance metrics",
      content: {
        "application/json": {
          schema: createDataResponseSchema(
            z.array(AgentPerformanceSchema),
            "AgentPerformanceResponse",
          ),
        },
      },
    },
    401: commonErrorResponses[401],
    403: commonErrorResponses[403],
    500: commonErrorResponses[500],
  },
});
